/**
 * Synthesis: building objects by crashing gliders.
 *
 * A recipe book of every object the search can build cleanly from two to four
 * gliders, a lab where any recipe plays one glider at a time and where you can
 * keep firing your own gliders at the debris, and a chart of what all the
 * two-glider collisions leave.
 */
import { type Cell } from '../engine/life';
import { censusText } from '../engine/game';
import {
  type Collision, type Dir, type Recipe, type Shot, DIR_NAME, DIRS, RECIPES, aim, census, centreOf, madeObjectCells,
  build, outcomeCounts, recipeStages, settleTime, soleObject, twoGliderCatalogue,
} from '../engine/synthesis';
import { fitCanvas, h } from './dom';
import { GameBoard } from './gameBoard';
import { icon } from './icons';
import { paintThumb } from './thumb';
import * as sfx from './sfx';
import { onTheme } from './theme';

const DIST = 6;
const LANES = 8;
const FIRST: Shot = { dir: 'SE', lane: 0, delay: 0 };
const TURN: Record<Dir, number> = { NE: -45, SE: 45, SW: 135, NW: -135 };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

export function createSynthView(root: HTMLElement) {
  let active = false;
  /** What the lab holds between shots: the settled debris, and how many gliders it took. */
  let debris: Cell[] = [];
  let used = 0;
  let dir: Dir = 'NW', lane = 0, delay = 0;
  let playing = 0;
  let catalogue: Collision[] | null = null;
  /** Board cells are offset so they never go negative. */
  let off: Cell = [0, 0];

  const board = new GameBoard({ w: 30, h: 30, label: 'The synthesis lab' });
  const status = h('p.synth-status', { 'aria-live': 'polite' });
  const stageLine = h('p.readout.synth-stage');
  const book = h('ol.synth-book', { 'aria-label': 'Recipe book' });
  const chart = h('div.synth-chart');
  const chartNote = h('p.small.dim');
  const laneOut = h('span.readout');

  const dirs = h('div.game-options', { role: 'group', 'aria-label': 'Direction' }, h('span.small', {}, 'Fly:'),
    ...DIRS.map((d) => h('button.game-option', { 'data-dir': d, title: `Fly ${DIR_NAME[d]}`, 'aria-label': `Fly ${DIR_NAME[d]}`, onclick: () => { dir = d; preview(); } },
      h('span.game-dir', { style: `transform: rotate(${TURN[d]}deg)` }, icon('arrow')))));
  const delays = h('div.game-options', { role: 'group', 'aria-label': 'Timing' }, h('span.small', {}, 'Hold back:'),
    ...[0, 1, 2, 3].map((d) => h('button.game-option', { onclick: () => { delay = d; preview(); } }, String(d))));
  const fireBtn = h('button.primary', { onclick: () => fire() }, icon('play'), 'Fire');

  root.append(h('div.game.synth', {},
    h('header.view-head', {},
      h('h1', {}, 'Synthesis: building with gliders'),
      h('p', {}, 'Gliders are the cheapest thing in Life: a gun makes them for ever. Crash them together at the right lane and timing and they leave objects behind. This is glider synthesis, and it is how people build huge machines in Life from nothing but streams of gliders. Every recipe here was found by the engine, which tried every way to aim each glider.')),
    h('div.synth-layout', {},
      h('section.panel.synth-book-panel', {},
        h('h2.kicker', {}, 'Recipe book'),
        h('p.small.dim', {}, 'The fewest gliders the search needed for each object. Pick one to watch it built.'),
        book),
      h('section.panel.synth-lab', {},
        h('h2.kicker', {}, 'The lab'),
        stageLine,
        board.canvas,
        status,
        h('div.game-controls', {},
          dirs,
          h('div.game-options', { role: 'group', 'aria-label': 'Lane' }, h('span.small', {}, 'Lane:'),
            h('button.small.icon', { onclick: () => { lane = Math.max(-LANES, lane - 1); preview(); }, 'aria-label': 'Lane to the left' }, icon('minus')), laneOut,
            h('button.small.icon', { onclick: () => { lane = Math.min(LANES, lane + 1); preview(); }, 'aria-label': 'Lane to the right' }, icon('plus'))),
          delays,
          fireBtn,
          h('button.small', { onclick: () => clear() }, 'Clear'))),
      h('section.panel.synth-catalogue', {},
        h('h2.kicker', {}, 'Every two-glider crash'),
        h('p.small.dim', {}, 'One glider flies down and to the right. A second comes at it head on or at right angles, in every lane and with every timing. This is what the crashes leave. Pick a bar to watch one.'),
        chart, chartNote))));

  // ---- the board ----

  /** Fit the board around everything that matters now, with a margin. */
  function frame(...sets: Cell[][]) {
    const all = sets.flat();
    if (!all.length) { off = [15, 15]; board.setSize(30, 30); return; }
    const xs = all.map((c) => c[0]), ys = all.map((c) => c[1]);
    const x0 = Math.min(...xs) - 4, y0 = Math.min(...ys) - 4;
    const w = Math.max(24, Math.max(...xs) - x0 + 5), hh = Math.max(24, Math.max(...ys) - y0 + 5);
    off = [-x0 + Math.floor((w - (Math.max(...xs) - x0 + 5)) / 2), -y0 + Math.floor((hh - (Math.max(...ys) - y0 + 5)) / 2)];
    board.setSize(w, hh);
  }
  const put = (c: Cell[]) => c.map(([x, y]) => [x + off[0], y + off[1]] as Cell);

  /** Where the next shot is aimed: the middle of the debris, or the fixed first glider's path. */
  const target = (): Cell => (debris.length ? centreOf(debris) : [0, 0]);
  /** Start far enough back to clear the debris, but no further, so the board stays small. */
  const dist = () => {
    if (!debris.length) return DIST;
    const xs = debris.map((c) => c[0]), ys = debris.map((c) => c[1]);
    return DIST + Math.ceil(Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2);
  };
  const nextShot = () => aim({ dir, lane, delay }, target(), dist());
  const firstGlider = () => aim(FIRST, [0, 0], DIST);

  function preview() {
    stop();
    laneOut.textContent = lane > 0 ? `+${lane}` : String(lane);
    dirs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.dir === dir));
    delays.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i === delay));
    const black = debris.length ? debris : firstGlider();
    const white = nextShot();
    frame(black, white, ...DIRS.map((d) => aim({ dir: d, lane: 0, delay: 0 }, target(), dist())));
    board.given = put(black);
    board.player = put(white);
    board.draw();
    stageLine.textContent = debris.length ? `${plural(used, 'glider')} so far. Aim the next one at it.` : 'Your first glider crashes into the black one, which flies down and to the right.';
  }

  /** Stop anything playing and go back to showing the placed stones. */
  function stop() {
    playing++;
    board.stop();
  }

  /** Run `start` on the board for `gens` generations, then call `done` (unless something else started). */
  function run(start: Cell[], gens: number, done: () => void, speed = 40) {
    const token = ++playing;
    board.play((_, g) => {
      if (token !== playing) return false;
      if (g >= gens) { done(); return false; }
    }, speed, 1, put(start));
  }

  function fire() {
    const first = !debris.length;
    const black = first ? firstGlider() : debris;
    const white = nextShot();
    const start = [...black, ...white];
    const result = build(black, [{ dir, lane, delay }], target(), dist());
    const made = madeObjectCells(result.cells);
    const away = result.census.get('Glider') ?? 0;
    const gens = Math.min(300, settleTime(start) + 8);
    status.textContent = 'Watching…';
    sfx.stone();
    run(start, gens, () => {
      used += first ? 2 : 1;
      const c = census(made);
      const flew = away ? ` ${plural(away, 'glider')} flew away.` : '';
      if (result.missed) {
        used -= first ? 2 : 1;
        status.textContent = 'They missed: nothing touched. Try another lane or direction.';
      } else if (!made.length) {
        debris = made;
        status.textContent = `Everything was destroyed.${flew}`;
        used = 0;
      } else {
        debris = made;
        const name = soleObject(c);
        const r = name ? RECIPES.find((x) => x.name === name) : undefined;
        const book = r ? (r.gliders < used ? ` The book does it with ${r.gliders}.` : r.gliders === used ? ' That matches the book.' : ' That beats the book!') : '';
        status.textContent = `${plural(used, 'glider')} built ${censusText(c)}.${flew}${book}`;
        if (name) sfx.chime();
      }
      preview();
    });
  }

  function clear() {
    debris = [];
    used = 0;
    status.textContent = '';
    preview();
  }

  /** Play a recipe from the book, one stage at a time. */
  function watch(r: Recipe) {
    stop();
    book.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.name === r.name));
    if (location.hash !== `#synth/${slug(r.name)}`) history.replaceState(null, '', `#synth/${slug(r.name)}`);
    const stages = recipeStages(r);
    status.textContent = '';
    const token = ++playing;
    const step = (i: number) => {
      if (token !== playing) return;
      const s = stages[i];
      board.stop();
      frame(s.before, s.incoming, s.after);
      board.given = put(s.before);
      board.player = put(s.incoming);
      board.draw();
      stageLine.textContent = i === 0 ? `${r.name}: the first two gliders` : `${r.name}: glider ${i + 2} of ${r.gliders} flies in`;
      window.setTimeout(() => {
        if (token !== playing) return;
        board.play((_, g) => {
          if (token !== playing) return false;
          if (g >= s.settles + 8) {
            if (i + 1 < stages.length) window.setTimeout(() => step(i + 1), 500);
            else {
              debris = s.after;
              used = r.gliders;
              status.textContent = `${plural(r.gliders, 'glider')} built ${article(r.name)} ${r.name.toLowerCase()}. Keep firing to build on it, or clear the board.`;
              sfx.chime();
              window.setTimeout(() => { if (token === playing) preview(); }, 900);
            }
            return false;
          }
        }, 30, 1, put([...s.before, ...s.incoming]));
      }, 700);
    };
    step(0);
  }

  function renderBook() {
    book.replaceChildren(...RECIPES.map((r) => {
      const thumb = h('canvas.synth-thumb', { 'aria-hidden': 'true' });
      const b = h('button.synth-recipe', { 'data-name': r.name, onclick: () => watch(r) },
        thumb,
        h('span.synth-name', {}, r.name),
        h('span.synth-cost', { 'aria-label': plural(r.gliders, 'glider') }, ...Array.from({ length: r.gliders }, () => h('i'))));
      return h('li', {}, b);
    }));
    requestAnimationFrame(paintThumbs);
  }

  function paintThumbs() {
    book.querySelectorAll('button').forEach((b) => {
      const r = RECIPES.find((x) => x.name === (b as HTMLElement).dataset.name)!;
      const cv = b.querySelector('canvas')!;
      if (!cv.clientWidth) return;
      fitCanvas(cv);
      const ctx = cv.getContext('2d')!;
      const dpr = cv.width / cv.clientWidth;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      paintThumb(ctx, recipeStages(r).at(-1)!.after, 0, 0, cv.clientWidth, cv.clientHeight, '--slate', '--board', 6);
    });
  }

  function renderChart() {
    if (!catalogue) {
      chart.replaceChildren(h('p.small.dim', {}, 'Crashing every pair of gliders…'));
      window.setTimeout(() => { catalogue = twoGliderCatalogue(); renderChart(); }, 30);
      return;
    }
    const cat = catalogue;
    const counts = outcomeCounts(cat);
    const max = counts[0][1];
    chart.replaceChildren(...counts.map(([k, n]) => {
      const example = cat.find((c) => c.key === k)!;
      const label = k === 'nothing' ? 'Nothing left' : censusText(example.census).replace(/^./, (c) => c.toUpperCase());
      return h('button.synth-bar', { onclick: () => replay(example), title: `${label}: ${plural(n, 'setting')}` },
        h('span.synth-bar-label', {}, label),
        h('span.synth-bar-track', {}, h('span.synth-bar-fill', { style: `width: ${(100 * n) / max}%` })),
        h('span.readout', {}, String(n)));
    }));
    const clean = cat.filter((c) => soleObject(c.census) && soleObject(c.census) !== 'Glider').length;
    chartNote.textContent = `${cat.length} of the ${3 * (2 * 12 + 1) * 4} ways to aim the second glider make them touch. ${counts.find(([k]) => k === 'nothing')?.[1] ?? 0} destroy both, and ${clean} leave exactly one object.`;
  }

  /** Watch one collision from the catalogue in the lab. */
  function replay(c: Collision) {
    debris = [];
    used = 0;
    dir = c.shot.dir; lane = Math.max(-LANES, Math.min(LANES, c.shot.lane)); delay = c.shot.delay;
    if (lane !== c.shot.lane) {
      // Outside the lab's lanes: show it anyway, as it was found.
      stop();
      const start = [...firstGlider(), ...aim(c.shot, [0, 0], DIST)];
      frame(start);
      board.given = put(firstGlider());
      run(start, Math.min(300, settleTime(start) + 8), () => { status.textContent = `Lane ${c.shot.lane}: it left ${censusText(c.census)}.`; });
      return;
    }
    preview();
    fire();
  }

  function goToHash() {
    const id = location.hash.split('/')[1];
    const r = id ? RECIPES.find((x) => slug(x.name) === id) : undefined;
    if (r) watch(r);
  }

  renderBook();
  preview();
  window.addEventListener('resize', () => { if (active) { board.draw(); paintThumbs(); } });
  onTheme(() => { if (active) { board.draw(); paintThumbs(); } });
  window.addEventListener('hashchange', () => { if (active && location.hash.startsWith('#synth/')) goToHash(); });

  return {
    activate() {
      active = true;
      requestAnimationFrame(() => { board.draw(); paintThumbs(); if (!catalogue) renderChart(); });
      goToHash();
    },
    deactivate() { active = false; stop(); },
  };
}
