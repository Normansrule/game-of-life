/**
 * Play: the game. Nine chapters, one idea each. A chapter states its idea
 * and its formula, sets levels that can only be won by using the idea, and
 * once they are won shows where the same idea is used outside the game.
 * Chapters unlock in order; progress and stars are kept in the browser.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  CHAPTERS, type Chapter, DELAYS, LANES, type Level, type LevelScore, STAMPS, ashStars, censusText, chapterStars, checkPrediction,
  collide, collisionStart, collisionTable, findPeriod, isStill, judgeParent, judgeRace, judgeRule, measuredAsh, meanFieldFixedPoint,
  neighbourCounts, rotate, ruleString, sameCensus, starsFor, torusSoup, SOUP, SYNTH_DIST, SYNTH_LANES, judgeSynth, synthesise,
} from '../engine/game';
import { type Dir, DIR_NAME, aim } from '../engine/synthesis';
import { CLASS_INFO, RuleRun, langtonLambda } from '../engine/classify';
import { parseRule } from '../engine/rules';
import type { Cell } from '../engine/life';
import { describe } from '../engine/puzzles';
import { emit } from './bus';
import { fitCanvas, h } from './dom';
import { GameBoard } from './gameBoard';
import { icon } from './icons';
import * as sfx from './sfx';
import { onTheme, tok } from './theme';

const STORE = 'life-tree:game:v1';
interface Saved { scores: Record<string, LevelScore>; chapter: number }
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? '');
    if (s && typeof s === 'object' && s.scores) return { scores: s.scores, chapter: Number(s.chapter) || 0 };
  } catch { /* first visit, or storage blocked */ }
  return { scores: {}, chapter: 0 };
}

const tex = (s: string) => katex.renderToString(s, { displayMode: true, throwOnError: false });
const levelKey = (c: Chapter, i: number) => `${c.id}:${i}`;
const starRow = (n: number, of = 3) => h('span.stars', { 'aria-label': `${n} of ${of} stars` }, ...Array.from({ length: of }, (_, i) => h(`i${i < n ? '.on' : ''}`)));
const plural = (n: number, w: string) => `${n.toLocaleString('en-GB')} ${w}${n === 1 ? '' : 's'}`;

/** A torus board (a Uint8Array of N × N cells) drawn as small stones. */
function drawTorus(canvas: HTMLCanvasElement, cells: Uint8Array, N: number) {
  fitCanvas(canvas);
  const ctx = canvas.getContext('2d')!;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const W = canvas.clientWidth;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = W / N;
  ctx.fillStyle = tok('--board');
  ctx.fillRect(0, 0, W, W);
  ctx.fillStyle = tok('--slate');
  ctx.beginPath();
  const r = s * 0.44;
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    const x = (i % N) * s + s / 2, y = Math.floor(i / N) * s + s / 2;
    if (s >= 4) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    else ctx.rect(x - s / 2, y - s / 2, s, s);
  }
  ctx.fill();
}

export function createGameView(root: HTMLElement) {
  const saved = load();
  let chapter = Math.min(saved.chapter, CHAPTERS.length - 1);
  let level = 0;
  let active = false;
  /** Tries and hint use on the level being played. */
  let tries = 0, hinted = false, solved = false;
  let cleanup: () => void = () => {};
  let redraw: () => void = () => {};

  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify({ ...saved, chapter })); } catch { /* storage blocked: progress lasts this visit */ } };
  const score = (c: Chapter, i: number) => saved.scores[levelKey(c, i)];
  const done = (c: Chapter) => c.levels.every((_, i) => score(c, i));
  const unlocked = (k: number) => k === 0 || done(CHAPTERS[k - 1]);
  const totalStars = () => CHAPTERS.reduce((s, c) => s + c.levels.reduce((t, _, i) => t + (score(c, i)?.stars ?? 0), 0), 0);
  const maxStars = CHAPTERS.reduce((s, c) => s + c.levels.length * 3, 0);

  // ---- page ----
  const path = h('ol.game-path', { 'aria-label': 'Chapters' });
  const tally = h('span.readout.game-tally');
  const ideaPanel = h('section.panel.game-idea');
  const levelTabs = h('div.game-levels', { role: 'tablist', 'aria-label': 'Levels' });
  const levelTitle = h('h3');
  const goal = h('p.game-goal');
  const stage = h('div.game-stage');
  const controls = h('div.game-controls');
  const feedback = h('p.game-feedback', { 'aria-live': 'polite' });
  const hintBtn = h('button.small', { onclick: () => showHint() }, icon('hint'), 'Hint');
  const nextBtn = h('button.primary', { onclick: () => next() }, 'Next level', icon('arrow'));
  nextBtn.hidden = true;
  const hintText = h('p.game-hint');
  hintText.hidden = true;
  const applyPanel = h('section.panel.game-apply');

  root.append(h('div.game', {},
    h('header.view-head', {},
      h('h1', {}, 'Play: learn Life by playing it'),
      h('p', {}, 'Nine chapters, one idea each, from the rule itself to the edge of chaos. Each one states the idea and its maths, sets levels you can only win by using it, and then shows where the same idea is at work in the world outside the board.')),
    h('div.game-path-row', {}, path, tally),
    h('div.game-layout', {},
      ideaPanel,
      h('section.panel.game-play', {},
        h('div.game-play-head', {}, levelTabs, hintBtn),
        levelTitle, goal, stage, controls, feedback, hintText,
        h('div.actions', {}, nextBtn)),
      applyPanel)));

  function renderPath() {
    path.replaceChildren(...CHAPTERS.map((c, k) => {
      const open = unlocked(k);
      const st = chapterStars(c.levels.map((_, i) => score(c, i)));
      const b = h(`button.game-stop${k === chapter ? '.current' : ''}${done(c) ? '.done' : ''}`, {
        onclick: () => { if (open) selectChapter(k); },
        disabled: !open,
        'aria-current': k === chapter ? 'step' : undefined,
        title: open ? c.title : 'Finish the chapter before to unlock this one',
      }, h('span.game-stone', {}, open ? String(k + 1) : icon('lock')), h('span.game-stop-name', {}, c.title), done(c) ? starRow(st) : '');
      return h('li', {}, b);
    }));
    tally.textContent = `${totalStars()} of ${maxStars} stars`;
  }

  function renderIdea(c: Chapter) {
    ideaPanel.replaceChildren(
      h('p.kicker', {}, `Chapter ${chapter + 1} of ${CHAPTERS.length} · ${c.play}`),
      h('h2', {}, c.title),
      h('p.game-idea-text', {}, c.idea),
      h('div.game-formula', { html: tex(c.formula) }),
      h('p.small.dim', {}, c.formulaNote));
  }

  function renderApply(c: Chapter) {
    const open = done(c);
    const last = chapter === CHAPTERS.length - 1;
    applyPanel.classList.toggle('locked', !open);
    applyPanel.replaceChildren(
      h('p.kicker', {}, 'Where this idea is used'),
      open ? h('h3', {}, c.application.title) : h('h3', {}, icon('lock'), 'Finish the chapter to see'),
      open ? h('p', {}, c.application.text) : h('p.dim', {}, 'Win every level in this chapter and the real-world side of the idea opens here.'),
      open ? h('div.actions', {},
        h('button', { onclick: () => emit('navigate', { route: c.application.route }) }, c.application.label, icon('arrow')),
        !last ? h('button.primary', { onclick: () => selectChapter(chapter + 1) }, 'Next chapter', icon('arrow')) : h('p.small', {}, `That's the whole journey: ${totalStars()} of ${maxStars} stars. Replay any level to raise your score.`)) : '');
  }

  function renderLevelTabs(c: Chapter) {
    levelTabs.replaceChildren(...c.levels.map((l, i) => {
      const sc = score(c, i);
      const reachable = i === 0 || score(c, i - 1);
      return h(`button.game-level${i === level ? '.current' : ''}${sc ? '.won' : ''}`, {
        role: 'tab', 'aria-selected': String(i === level), disabled: !reachable, title: l.title,
        onclick: () => selectLevel(i),
      }, String(i + 1));
    }));
  }

  function selectChapter(k: number) {
    chapter = k;
    persist();
    if (location.hash !== `#play/${CHAPTERS[k].id}`) history.replaceState(null, '', `#play/${CHAPTERS[k].id}`);
    const c = CHAPTERS[k];
    renderPath();
    renderIdea(c);
    renderApply(c);
    // Open the first level not yet won.
    const first = c.levels.findIndex((_, i) => !score(c, i));
    selectLevel(first < 0 ? 0 : first);
    if (active) ideaPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function selectLevel(i: number) {
    cleanup();
    level = i;
    tries = 0;
    hinted = false;
    solved = false;
    const c = CHAPTERS[chapter];
    const l = c.levels[i];
    renderLevelTabs(c);
    levelTitle.textContent = `Level ${i + 1}: ${l.title}`;
    feedback.textContent = '';
    feedback.className = 'game-feedback';
    hintText.hidden = true;
    hintText.textContent = c.hints[i];
    nextBtn.hidden = true;
    stage.replaceChildren();
    controls.replaceChildren();
    const sc = score(c, i);
    if (sc) feedback.append(h('span.small.dim', {}, 'Best so far: '), starRow(sc.stars), h('span.small.dim', {}, '. Play again to improve it.'));
    cleanup = LEVELS[l.kind](l as never);
  }

  function showHint() {
    hinted = true;
    hintText.hidden = false;
    if (CHAPTERS[chapter].levels[level].kind === 'predict') countsHint?.();
  }
  let countsHint: (() => void) | null = null;

  /** The level is won: score it, keep the best, say so, and offer what's next. */
  function win(message: string, stars = starsFor(tries + 1, hinted)) {
    if (solved) return;
    solved = true;
    const c = CHAPTERS[chapter];
    const k = levelKey(c, level);
    const wasDone = done(c);
    const prev = saved.scores[k];
    if (!prev || stars > prev.stars) saved.scores[k] = { stars, tries: tries + 1, hint: hinted };
    persist();
    sfx.chime();
    feedback.className = 'game-feedback ok';
    feedback.replaceChildren(icon('check'), h('span', {}, message, ' '), starRow(stars));
    const finished = done(c);
    nextBtn.hidden = level >= c.levels.length - 1;
    renderLevelTabs(c);
    renderPath();
    if (finished && !wasDone) {
      renderApply(c);
      applyPanel.classList.add('reveal');
      setTimeout(() => applyPanel.classList.remove('reveal'), 1200);
      feedback.append(h('span.small', {}, ` Chapter complete: see where the idea is used${window.innerWidth < 900 ? ' below' : ''}.`));
    }
  }
  function lose(message: string) {
    tries++;
    sfx.thud();
    feedback.className = 'game-feedback bad';
    feedback.replaceChildren(icon('cross'), h('span', {}, message));
    if (tries >= 2 && hintText.hidden) feedback.append(h('span.small.dim', {}, ' Stuck? Try the hint.'));
  }
  function say(message: string) {
    feedback.className = 'game-feedback';
    feedback.textContent = message;
  }
  function next() {
    const c = CHAPTERS[chapter];
    if (level < c.levels.length - 1) selectLevel(level + 1);
  }

  /** A board in the stage, redrawn on resize and theme change. */
  function board(...b: GameBoard[]) {
    redraw = () => b.forEach((x) => x.draw());
    requestAnimationFrame(redraw);
  }
  const btn = (label: string | (Node | string)[], onclick: () => void, cls = '') => h(`button${cls}` as 'button', { onclick }, ...(Array.isArray(label) ? label : [label]));

  // ---- the levels, one builder per kind; each returns its cleanup ----
  const LEVELS: { [K in Level['kind']]: (l: Extract<Level, { kind: K }>) => () => void } = {
    predict(l) {
      goal.textContent = 'Place white stones where there will be stones one generation from now. Tap again to take one away.';
      const now = new GameBoard({ w: l.w, h: l.h, label: 'The board now' });
      now.given = l.start;
      const guess = new GameBoard({ w: l.w, h: l.h, editable: true, label: 'Your guess at the next generation' });
      guess.rings = [];
      stage.append(h('div.game-pair', {},
        h('figure', {}, now.canvas, h('figcaption', {}, 'Now')),
        h('figure', {}, guess.canvas, h('figcaption', {}, 'Next generation: your guess'))));
      countsHint = () => { now.counts = neighbourCounts(l.start); now.draw(); };
      guess.onChange = () => { feedback.textContent = ''; };
      controls.append(
        btn('Show counts', () => { hinted = true; countsHint!(); }, '.small'),
        btn('Clear', () => { guess.player = []; guess.clearMarks(); guess.draw(); }, '.small'),
        btn([icon('check'), 'Check'], () => {
          const r = checkPrediction(l.start, guess.player);
          if (r.ok) { guess.clearMarks(); guess.draw(); win('Exactly right.'); return; }
          guess.missed = r.missing;
          guess.wrong = r.extra;
          guess.draw();
          const parts = [r.missing.length ? `${plural(r.missing.length, 'stone')} missing (red rings)` : '', r.extra.length ? `${plural(r.extra.length, 'stone')} that won't be there (red crosses)` : ''].filter(Boolean);
          lose(`Not quite: ${parts.join(' and ')}.`);
        }, '.primary'));
      board(now, guess);
      return () => { countsHint = null; };
    },

    repair(l) {
      goal.textContent = 'Add one white stone so the whole pattern becomes a still life, a board the rule leaves exactly as it is.';
      const b = new GameBoard({ w: l.w, h: l.h, editable: true, maxStones: 1, label: 'A broken still life' });
      b.given = l.given;
      stage.append(b.canvas);
      b.onChange = () => { feedback.textContent = ''; };
      const watch = btn([icon('play'), 'Watch it run'], () => {
        if (b.running) { b.stop(); return; }
        b.play((cells, g) => { say(`Generation ${g}`); if (g >= 30 || !cells.length) { b.stop(false); say(`Generation ${g}: ${describe(b.cells)}`); return false; } }, 160);
      }, '.small');
      controls.append(watch,
        btn([icon('check'), 'Check'], () => {
          b.stop();
          if (b.player.length !== 1) { say('Place one white stone first.'); return; }
          if (isStill(b.cells)) win('A still life: F(x) = x.');
          else lose(describe(b.cells));
        }, '.primary'));
      board(b);
      return () => b.stop(false);
    },

    period(l) {
      goal.textContent = 'This pattern repeats. Step through it and say how many generations one cycle takes.';
      const b = new GameBoard({ w: l.w, h: l.h, label: 'An oscillator' });
      b.given = l.pattern;
      const answer = findPeriod(l.pattern, 30)!.period;
      const gen = h('span.readout', {}, 'Generation 0');
      const show = () => { gen.textContent = `Generation ${b.generation}`; };
      stage.append(b.canvas);
      const playBtn = btn([icon('play'), 'Play'], () => {
        if (b.ticking) { b.stop(false); playBtn.replaceChildren(icon('play'), 'Play'); return; }
        playBtn.replaceChildren(icon('pause'), 'Pause');
        b.play(() => show(), 450, 1, b.cells);
      }, '.small');
      controls.append(
        btn([icon('step'), 'Step'], () => { b.stop(false); playBtn.replaceChildren(icon('play'), 'Play'); b.step(); show(); }, '.small'),
        playBtn,
        btn([icon('reset'), 'Back to the start'], () => { b.stop(); playBtn.replaceChildren(icon('play'), 'Play'); show(); }, '.small'),
        gen,
        h('div.game-options', { role: 'group', 'aria-label': 'Your answer' }, h('span.small', {}, 'Period:'),
          ...l.options.map((p) => btn(String(p), () => {
            if (p === answer) win(`Period ${p}: it returns after ${plural(p, 'generation')}.`);
            else if (p % answer === 0) lose(`After ${p} it does look the same, but it already did sooner. The period is the smallest such number.`);
            else lose(`After ${plural(p, 'generation')} it doesn't look the same as at the start.`);
          }, '.game-option'))));
      board(b);
      return () => b.stop(false);
    },

    race(l) {
      const r = l.race;
      goal.textContent = `Get any stone onto the flag within ${r.deadline} generations. Your pattern must start inside the light area.`;
      const b = new GameBoard({ w: l.w, h: l.h, editable: true, allowed: r.start, maxStones: r.maxStones, label: 'A racetrack' });
      b.zones = [{ ...r.start, tone: 'start' }, { ...r.flag, tone: 'flag' }];
      let stampId: string | null = 'glider', turn = 0;
      const pal = h('div.game-stamps', { role: 'group', 'aria-label': 'Stamps' });
      const setStamp = () => {
        b.stamp = stampId ? rotate(STAMPS[stampId].cells(), turn) : null;
        b.o.maxStones = stampId ? undefined : r.maxStones;
        pal.querySelectorAll('button[data-stamp]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.stamp === (stampId ?? 'free')));
      };
      pal.append(
        ...Object.entries(STAMPS).map(([id, s]) => h('button.small', { 'data-stamp': id, onclick: () => { stampId = id; setStamp(); }, title: `${s.name}, ${s.speed}` }, s.name)),
        h('button.small', { 'data-stamp': 'free', onclick: () => { stampId = null; setStamp(); } }, 'Single stones'),
        h('button.small', { onclick: () => { turn = (turn + 1) % 4; setStamp(); if (stampId && b.player.length) { const x0 = Math.min(...b.player.map((p) => p[0])), y0 = Math.min(...b.player.map((p) => p[1])); b.player = b.stamp!.map(([x, y]) => [x + x0, y + y0] as Cell).filter(([x, y]) => x <= r.start.x1 && y <= r.start.y1); b.draw(); } }, title: 'Turn the stamp a quarter turn' }, icon('rotate'), 'Turn'));
      setStamp();
      const clock = h('span.readout', {}, `Generation 0 of ${r.deadline}`);
      stage.append(b.canvas, pal);
      controls.append(
        btn('Clear', () => { b.stop(); b.player = []; b.draw(); }, '.small'),
        clock,
        btn([icon('play'), 'Go'], () => {
          const verdict = judgeRace(b.player, r);
          if (!b.player.length || /start area|at most/.test(verdict.message)) { say(verdict.message); return; }
          b.play((cells, g) => {
            clock.textContent = `Generation ${g} of ${r.deadline}`;
            const there = cells.some(([x, y]) => x >= r.flag.x0 && x <= r.flag.x1 && y >= r.flag.y0 && y <= r.flag.y1);
            if (there || g >= r.deadline || !cells.length) {
              b.stop(false);
              if (verdict.ok) win(verdict.message); else lose(verdict.message);
              return false;
            }
          }, 90, 1, b.player);
        }, '.primary'));
      board(b);
      return () => b.stop(false);
    },

    collide(l) {
      goal.textContent = `${l.goal} The black glider is fixed. Move the white one to another lane, or hold it back a few generations, then fire.`;
      const b = new GameBoard({ w: 20, h: 20, label: 'Two gliders on a collision course' });
      let lane = 4, delay = 0;
      const laneOut = h('span.readout', {});
      const place = () => {
        b.stop();
        const { a, b: g2 } = collisionStart(lane, delay);
        b.given = a;
        b.player = g2;
        laneOut.textContent = lane > 0 ? `+${lane}` : String(lane);
        delays.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === delay));
        b.draw();
      };
      const delays = h('div.game-options', { role: 'group', 'aria-label': 'Timing' }, h('span.small', {}, 'Hold back:'),
        ...DELAYS.map((d) => btn(String(d), () => { delay = d; place(); }, '.game-option')));
      stage.append(b.canvas);
      controls.append(
        h('div.game-options', { role: 'group', 'aria-label': 'Lane' }, h('span.small', {}, 'Lane:'),
          btn([icon('minus')], () => { lane = Math.max(LANES[0], lane - 1); place(); }, '.small.icon'), laneOut,
          btn([icon('plus')], () => { lane = Math.min(LANES.at(-1)!, lane + 1); place(); }, '.small.icon')),
        delays,
        btn([icon('play'), 'Fire'], () => {
          const result = collide(lane, delay);
          b.play((_, g) => {
            say(`Generation ${g}`);
            if (g >= 110 || !b.cells.length) {
              b.stop(false);
              const text = censusText(result);
              if (sameCensus(result, l.target)) {
                const n = collisionTable().filter((x) => sameCensus(x.result, l.target)).length;
                win(`It left ${text}. ${n} of the 36 possible collisions do this.`);
              } else lose(`That collision left ${text}.`);
              return false;
            }
          }, 45, 1, [...b.given, ...b.player]);
        }, '.primary'));
      place();
      board(b);
      return () => b.stop(false);
    },

    synth(l) {
      goal.textContent = `${l.goal} Pick a direction, a lane and a delay for the white glider, then fire.`;
      const base = l.base();
      // Size the board to hold the black stones and every shot the controls can make.
      const reach = [...base, ...l.dirs.flatMap((d) => [-SYNTH_LANES, SYNTH_LANES].flatMap((lane) => aim({ dir: d, lane, delay: 0 }, l.at, SYNTH_DIST)))];
      const x0 = Math.min(...reach.map((c) => c[0])) - 2, y0 = Math.min(...reach.map((c) => c[1])) - 2;
      const w = Math.max(...reach.map((c) => c[0])) - x0 + 3, hgt = Math.max(...reach.map((c) => c[1])) - y0 + 3;
      const onBoard = (c: Cell[]) => c.map(([x, y]) => [x - x0, y - y0] as Cell);
      const b = new GameBoard({ w, h: hgt, label: 'Gliders on a collision course' });
      let dir: Dir = l.dirs[0], lane = 0, delay = 0;
      const shot = () => ({ dir, lane, delay });
      const laneOut = h('span.readout', {});
      const turn: Record<Dir, number> = { NE: -45, SE: 45, SW: 135, NW: -135 };
      const dirs = h('div.game-options', { role: 'group', 'aria-label': 'Direction' }, h('span.small', {}, 'Fly:'),
        ...l.dirs.map((d) => h('button.game-option', { 'data-dir': d, 'aria-label': `Fly ${DIR_NAME[d]}`, title: `Fly ${DIR_NAME[d]}`, onclick: () => { dir = d; place(); } },
          h('span.game-dir', { style: `transform: rotate(${turn[d]}deg)` }, icon('arrow')))));
      const delays = h('div.game-options', { role: 'group', 'aria-label': 'Timing' }, h('span.small', {}, 'Hold back:'),
        ...DELAYS.map((d) => btn(String(d), () => { delay = d; place(); }, '.game-option')));
      const place = () => {
        b.stop();
        b.given = onBoard(base);
        b.player = onBoard(aim(shot(), l.at, SYNTH_DIST));
        laneOut.textContent = lane > 0 ? `+${lane}` : String(lane);
        dirs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.dir === dir));
        delays.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === delay));
        b.draw();
      };
      stage.append(b.canvas);
      controls.append(
        dirs,
        h('div.game-options', { role: 'group', 'aria-label': 'Lane' }, h('span.small', {}, 'Lane:'),
          btn([icon('minus')], () => { lane = Math.max(-SYNTH_LANES, lane - 1); place(); }, '.small.icon'), laneOut,
          btn([icon('plus')], () => { lane = Math.min(SYNTH_LANES, lane + 1); place(); }, '.small.icon')),
        delays,
        btn([icon('play'), 'Fire'], () => {
          const s = shot();
          const verdict = judgeSynth(base, l.at, s, l.target);
          const quiet = synthesise(base, l.at, s);
          b.play((_, g) => {
            say(`Generation ${g}`);
            if (g >= 150 || !b.cells.length) {
              b.stop(false);
              if (verdict.ok) win(verdict.message); else if (quiet.missed) say(verdict.message); else lose(verdict.message);
              return false;
            }
          }, 45, 1, [...b.given, ...b.player]);
        }, '.primary'));
      place();
      board(b);
      return () => b.stop(false);
    },

    parent(l) {
      goal.textContent = `Draw a pattern of at most ${plural(l.maxStones, 'stone')} that becomes the ringed pattern, in the same place, one generation later.`;
      const b = new GameBoard({ w: l.w, h: l.h, editable: true, maxStones: l.maxStones, label: 'Draw the parent' });
      b.rings = l.target;
      stage.append(b.canvas);
      b.onChange = () => { feedback.textContent = ''; };
      controls.append(
        btn([icon('step'), 'Run one step'], () => {
          if (!b.player.length) { say('Draw a pattern first.'); return; }
          b.play(() => { b.stop(false); say(b.cells.length ? 'One generation later. Tap the board to keep drawing.' : 'Nothing is left one generation later.'); return false; }, 260, 1, b.player);
        }, '.small'),
        btn('Clear', () => { b.player = []; b.stop(); }, '.small'),
        btn([icon('check'), 'Check'], () => {
          b.stop();
          const r = judgeParent(b.player, l.target, l.maxStones);
          if (r.ok) win(r.message); else if (b.player.length) lose(r.message); else say(r.message);
        }, '.primary'));
      board(b);
      return () => b.stop(false);
    },

    ash(l) {
      const pct = Math.round(l.start * 100);
      goal.textContent = `This board is a torus (its edges wrap round) filled ${pct}% with random stones. After ${SOUP.gens} generations, what percentage of cells will still be alive?`;
      const cv = h('canvas.game-torus');
      const N = SOUP.N;
      let guess = 20;
      const out = h('output.readout', {}, `${guess}%`);
      const slider = h('input', { type: 'range', min: 0, max: 50, step: 1, value: guess, 'aria-label': 'Your prediction, percent alive' }) as HTMLInputElement;
      slider.addEventListener('input', () => { guess = +slider.value; out.textContent = `${guess}%`; });
      const status = h('span.readout', {});
      const first = torusSoup(N, l.start, SOUP.seeds[0], 0, 1).frames[0];
      stage.append(cv, h('div.game-ash-note.small.dim', {}, `Mean-field theory predicts ${(meanFieldFixedPoint() * 100).toFixed(0)}%.`));
      let timer = 0;
      const show = (f: Uint8Array) => drawTorus(cv, f, N);
      redraw = () => show(first);
      controls.append(h('label.game-guess', {}, 'I predict ', slider, out, ' alive at the end'),
        btn([icon('play'), 'Run the soup'], () => {
          clearTimeout(timer);
          const { frames } = torusSoup(N, l.start, SOUP.seeds[0], SOUP.gens, 4);
          let i = 0;
          const tick = () => {
            const f = frames[i];
            show(f);
            status.textContent = `Generation ${i * 4} · ${(100 * f.reduce((s, v) => s + v, 0) / (N * N)).toFixed(1)}% alive`;
            if (++i < frames.length) { timer = window.setTimeout(tick, 45); return; }
            const m = measuredAsh(l.start);
            const st = ashStars(guess / 100, m);
            const said = `Measured: ${(m * 100).toFixed(1)}% (the average of ${SOUP.seeds.length} soups). You said ${guess}%; mean-field theory said ${(meanFieldFixedPoint() * 100).toFixed(0)}%.`;
            if (st > 0) win(said, hinted ? Math.min(st, 1) : st);
            else lose(`${said} Off by ${Math.abs(guess - m * 100).toFixed(1)} points: try again.`);
          };
          tick();
        }, '.primary'), status);
      requestAnimationFrame(redraw);
      return () => clearTimeout(timer);
    },

    rule(l) {
      goal.textContent = l.want === 'III'
        ? 'Choose the neighbour counts that cause a birth (B) and let a cell survive (S) so that a random soup boils: busy churn that never settles.'
        : 'Choose a rule other than Life in which a random soup makes complex, long-lived structure: not dying, not freezing, not boiling.';
      const birth = Array<boolean>(9).fill(false), survive = Array<boolean>(9).fill(false);
      birth[3] = true; survive[2] = survive[3] = true;
      const cv = h('canvas.game-torus');
      const ruleOut = h('span.readout.game-rule', {});
      const lam = h('span.readout', {});
      const status = h('span.readout', {});
      const row = (label: string, bits: boolean[], from: number) => h('div.game-bits', { role: 'group', 'aria-label': label }, h('span.small', {}, label),
        ...bits.map((_, n) => {
          const b = h('button.game-bit', { 'aria-pressed': String(bits[n]), disabled: n < from, onclick: () => { bits[n] = !bits[n]; b.setAttribute('aria-pressed', String(bits[n])); refresh(); } }, String(n));
          return b;
        }));
      const refresh = () => {
        const r = ruleString(birth, survive);
        ruleOut.textContent = r;
        lam.textContent = `λ = ${langtonLambda(parseRule(r)).toFixed(3)}`;
      };
      stage.append(cv);
      controls.append(row('Birth', birth, 1), row('Survive', survive, 0), h('div.game-rule-line', {}, ruleOut, lam),
        btn([icon('play'), 'Run a soup'], () => {
          cancelAnimationFrame(raf);
          const rule = ruleString(birth, survive);
          if (!birth.some(Boolean)) { say('With no births nothing new can ever appear. Choose at least one birth number.'); return; }
          const run = new RuleRun(rule, 66, 0.5, 7);
          const loop = () => {
            for (let k = 0; k < 3; k++) run.step();
            drawTorus(cv, run.cells, 66);
            status.textContent = `Generation ${run.generation}`;
            if (run.generation < 240 && run.population > 0) { raf = requestAnimationFrame(loop); return; }
            const v = judgeRule(rule);
            const info = CLASS_INFO[v.cls];
            const verdict = `${rule} is class ${v.cls}: ${info.name.toLowerCase()} (${info.blurb.toLowerCase()}).`;
            if (l.not?.includes(rule)) lose(`${verdict} That's Life itself: find another one.`);
            else if (v.cls === l.want) win(verdict);
            else lose(verdict);
          };
          loop();
        }, '.primary'), status);
      let raf = 0;
      refresh();
      redraw = () => drawTorus(cv, new RuleRun(ruleString(birth, survive), 66, 0.5, 7).cells, 66);
      requestAnimationFrame(redraw);
      return () => cancelAnimationFrame(raf);
    },
  };

  window.addEventListener('resize', () => active && redraw());
  onTheme(() => active && redraw());

  function fromHash() {
    const id = location.hash.slice(1).split('/')[1];
    const k = CHAPTERS.findIndex((c) => c.id === id);
    return k >= 0 && unlocked(k) ? k : chapter;
  }
  window.addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#play')) return;
    const k = fromHash();
    if (k !== chapter) selectChapter(k);
  });

  selectChapter(fromHash());
  return {
    activate() { active = true; requestAnimationFrame(() => { renderPath(); redraw(); }); },
    deactivate() { active = false; },
  };
}
