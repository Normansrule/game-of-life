/**
 * Puzzles tab: place stones on a small board to meet a goal, and the engine
 * checks it. Progress, drafts and your fewest-stone solutions are kept in
 * localStorage.
 *
 * Play by pointer (tap or drag to place, drag over stones to lift them) or by
 * keyboard (arrows move the cursor, Space places or lifts, Enter checks,
 * W watches it run, Ctrl+Z undoes).
 */
import { type Cell, evolveSparse } from '../engine/life';
import { type Difficulty, PUZZLES, type Puzzle } from '../engine/puzzles';
import { emit } from './bus';
import { fitCanvas, h } from './dom';
import { icon, setIcon } from './icons';
import { alpha, onTheme, reducedMotion, tok } from './theme';
import { CellPainter, drawBoardLines, drawStarPoints } from './thumb';

const STORE = 'life-tree:puzzles:v1';
const DIFF_COLOUR: Record<Difficulty, string> = { easy: 'var(--data-pine)', medium: 'var(--data-ochre)', hard: 'var(--data-shu)' };

interface Saved { solved: string[]; drafts: Record<string, Cell[]>; best: Record<string, number> }

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return {
      solved: Array.isArray(s.solved) ? s.solved : [],
      drafts: s.drafts && typeof s.drafts === 'object' ? s.drafts : {},
      best: s.best && typeof s.best === 'object' ? s.best : {},
    };
  } catch { return { solved: [], drafts: {}, best: {} }; }
}

const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
const key = (x: number, y: number) => `${x},${y}`;

/** A placed stone drops onto the board on a spring; this is its scale over time (ms). */
function dropScale(ms: number): number {
  if (ms >= 360) return 1;
  const t = ms / 1000;
  return 1 + 0.18 * Math.exp(-22 * t) * Math.cos(30 * t);
}

export function createPuzzlesView(root: HTMLElement) {
  const saved = loadSaved();
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* private mode: progress lasts for this visit */ } };

  let puzzle: Puzzle = PUZZLES[0];
  let cells = new Set<string>();
  let undoStack: string[][] = [];
  let redoStack: string[][] = [];
  // While watching: the live stones and the generation each was born in, for the black-and-white turns.
  let playing: Cell[] | null = null;
  let born = new Map<string, number>();
  let gen = 0;
  let done = false;
  let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let active = false;
  let cursor: Cell | null = null;
  let hover: Cell | null = null;
  const dropping = new Map<string, number>();
  let celebrate = 0;

  const list = h('div.pz-list');
  const progress = h('div.pz-progress');
  const title = h('h2');
  const chip = h('span.pz-chip');
  const goal = h('p.pz-goal');
  const hint = h('p.pz-hint');
  const canvas = h('canvas.pz-canvas', {
    tabindex: '0',
    role: 'application',
    'aria-label': 'Puzzle board. Arrow keys move, Space places or lifts a stone, Enter checks, W watches it run.',
  });
  const verdict = h('div.pz-verdict', { 'aria-live': 'polite' });
  const count = h('span.pz-count.readout');
  const info = h('span.readout.dim');
  const playBtn = h('button', { onclick: () => (playing ? stop() : play()) }, icon('play'), 'Watch it run');
  const checkBtn = h('button.primary', { onclick: check }, 'Check');
  const undoBtn = h('button.icon', { onclick: undo, 'aria-label': 'Undo (Ctrl+Z)', title: 'Undo (Ctrl+Z)' }, icon('undo'));
  const redoBtn = h('button.icon', { onclick: redo, 'aria-label': 'Redo (Ctrl+Shift+Z)', title: 'Redo (Ctrl+Shift+Z)' }, icon('redo'));

  root.append(h('div.puzzles', {},
    h('header.view-head', {},
      h('h1', {}, 'Puzzles'),
      h('p', {}, 'Ten construction challenges. Place stones on the board, press Check, and the same engine that runs the simulator decides whether your pattern does what the goal asks. Wrong answers are told what their pattern actually does, which is often the best clue. Solved one? Try again with fewer stones.')),
    h('div.pz-layout', {},
      h('aside', {}, progress, list),
      h('section.panel.pz-main', {},
        h('div.pz-head', {}, title, chip),
        goal,
        canvas,
        h('div.pz-under', {}, count, info),
        h('div.fig-controls', {}, checkBtn, playBtn, undoBtn, redoBtn,
          h('button', { onclick: () => { stop(); if (cells.size) { pushUndo(); cells.clear(); saveDraft(); } verdict.replaceChildren(); draw(); } }, 'Clear'),
          h('button', { onclick: () => hint.classList.toggle('shown') }, 'Hint'),
          h('button', { onclick: openInSim }, 'Open in simulator')),
        hint,
        verdict))));

  function renderList() {
    list.replaceChildren(...PUZZLES.map((p, i) => {
      const solved = saved.solved.includes(p.id);
      return h(`button.pz-item${p.id === puzzle.id ? '.active' : ''}${solved ? '.solved' : ''}`, { onclick: () => select(p), 'aria-current': p.id === puzzle.id ? 'true' : undefined, 'aria-label': `${i + 1}. ${p.title}, ${p.difficulty}${solved ? ', solved' : ''}` },
        h('span.pz-num', {}, solved ? icon('check') : String(i + 1)),
        h('span', {}, h('b', {}, p.title),
          h('span.pz-meta', {},
            saved.best[p.id] ? h('span.readout.dim', { title: 'Your fewest stones' }, String(saved.best[p.id])) : '',
            h('span.pz-dot', { style: `background:${DIFF_COLOUR[p.difficulty]}`, title: p.difficulty }))));
    }));
    const n = saved.solved.filter((id) => PUZZLES.some((p) => p.id === id)).length;
    progress.replaceChildren(h('b', {}, `${n} of ${PUZZLES.length} solved`), h('div.pz-bar', {}, h('span', { style: `width:${(n / PUZZLES.length) * 100}%` })));
  }

  function select(p: Puzzle) {
    stop();
    puzzle = p;
    cells = new Set((saved.drafts[p.id] ?? []).map(([x, y]) => key(x, y)));
    undoStack = [];
    redoStack = [];
    cursor = null;
    title.textContent = p.title;
    chip.textContent = p.difficulty;
    chip.style.setProperty('--c', DIFF_COLOUR[p.difficulty]);
    goal.textContent = p.goal;
    hint.textContent = p.hint;
    hint.classList.remove('shown');
    verdict.replaceChildren();
    if (saved.solved.includes(p.id)) verdict.append(h('div.ok', {}, bestLine(p.id, 'Solved before.')));
    renderList();
    resetView();
    draw();
  }

  function bestLine(id: string, lead: string) {
    const b = saved.best[id];
    return b ? `${lead} Your fewest so far: ${plural(b, 'stone')}. Can you do it with fewer?` : lead;
  }

  const currentCells = (): Cell[] => [...cells].map((k) => k.split(',').map(Number) as Cell);
  function saveDraft() { saved.drafts[puzzle.id] = currentCells(); persist(); }

  // ---- undo ----
  function pushUndo() {
    undoStack.push([...cells]);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }
  function swap(from: string[][], to: string[][]) {
    const prev = from.pop();
    if (!prev) return;
    stop();
    to.push([...cells]);
    cells = new Set(prev);
    saveDraft();
    verdict.replaceChildren();
    draw();
  }
  function undo() { swap(undoStack, redoStack); }
  function redo() { swap(redoStack, undoStack); }

  function check() {
    stop();
    const v = puzzle.check(currentCells());
    let lead = v.ok ? `Solved with ${plural(cells.size, 'stone')}. ${v.message}` : v.message;
    if (v.ok) {
      const first = !saved.solved.includes(puzzle.id);
      if (first) saved.solved.push(puzzle.id);
      const prev = saved.best[puzzle.id];
      if (!prev || cells.size < prev) {
        saved.best[puzzle.id] = cells.size;
        if (prev) lead += ` That beats your old best of ${prev}.`;
      } else lead += ` Your fewest so far is ${plural(prev, 'stone')}.`;
      persist();
      renderList();
      celebrate = performance.now();
    }
    const next = v.ok ? PUZZLES.find((p) => !saved.solved.includes(p.id)) : undefined;
    verdict.replaceChildren(h(v.ok ? 'div.ok' : 'div.bad', {},
      lead,
      next ? h('div.fig-controls', {}, h('button.primary', { onclick: () => select(next) }, `Next: ${next.title}`, icon('arrow'))) : '',
      !v.ok && cells.size ? h('div.fig-controls', {}, h('button', { onclick: play }, icon('play'), 'Watch what it does')) : ''));
    draw();
  }

  function openInSim() {
    const c = currentCells();
    if (!c.length) return;
    emit('sim:load', { cells: c, name: `Puzzle: ${puzzle.title}` });
    emit('navigate', { route: 'sim' });
  }

  // ---- watching it run ----
  function play() {
    if (!cells.size) return;
    playing = currentCells();
    born = new Map(playing.map(([x, y]) => [key(x, y), 0]));
    gen = 0;
    done = false;
    setIcon(playBtn, 'stop', 'Back to placing');
    canvas.classList.add('playing');
  }
  function stop() {
    playing = null;
    setIcon(playBtn, 'play', 'Watch it run');
    canvas.classList.remove('playing');
    info.textContent = '';
    resetView();
    draw();
  }
  function resetView() { view = { x0: 0, y0: 0, x1: puzzle.w - 1, y1: puzzle.h - 1 }; }

  let frame = 0;
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (!active) return;
    const animating = dropping.size > 0 || now - celebrate < 900;
    if (playing && !done && frame++ % 3 === 0) {
      playing = evolveSparse(playing, 1);
      gen++;
      const nextBorn = new Map<string, number>();
      for (const [x, y] of playing) { const k = key(x, y); nextBorn.set(k, born.get(k) ?? gen); }
      born = nextBorn;
      // Grow (never shrink) the view so expanding patterns stay visible.
      for (const [x, y] of playing) {
        if (x < view.x0) view.x0 = x; if (x > view.x1) view.x1 = x;
        if (y < view.y0) view.y0 = y; if (y > view.y1) view.y1 = y;
      }
      info.textContent = `Generation ${gen} · ${plural(playing.length, 'stone')}`;
      if (!playing.length || gen >= 3000) { done = true; info.textContent += playing.length ? ' · stopped at 3,000' : ' · all gone'; }
      draw();
    } else if (animating) draw();
  }
  requestAnimationFrame(loop);

  // ---- drawing ----
  function geometry() {
    const vw = view.x1 - view.x0 + 1, vh = view.y1 - view.y0 + 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const s = Math.min(W / vw, H / vh);
    return { s, ox: (W - vw * s) / 2, oy: (H - vh * s) / 2 };
  }

  function draw() {
    canvas.style.aspectRatio = `${puzzle.w} / ${puzzle.h}`;
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, ox, oy } = geometry();
    // The puzzle area is the board; anything a running pattern grows into beyond it is the board's edge.
    const bx = ox - view.x0 * s, by = oy - view.y0 * s, bw = puzzle.w * s, bh = puzzle.h * s;
    ctx.fillStyle = tok(playing && (bw < W - 1 || bh < H - 1) ? '--board-edge' : '--board');
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(bx, by, bw, bh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    drawBoardLines(ctx, W, H, s, bx, by);
    drawStarPoints(ctx, puzzle.w, puzzle.h, s, bx, by);
    ctx.restore();
    const at = (x: number, y: number): [number, number] => [ox + (x - view.x0) * s, oy + (y - view.y0) * s];
    const now = performance.now();

    if (playing) {
      // Turns: a stone's colour is the parity of the generation it was born in, as in the simulator.
      const black = new CellPainter(s), white = new CellPainter(s);
      for (const [x, y] of playing) ((born.get(key(x, y)) ?? 0) % 2 ? white : black).add(...at(x, y));
      black.fill(ctx, '--slate');
      white.fill(ctx, '--shell');
    } else {
      const still = new CellPainter(s);
      const motion = !reducedMotion();
      const lift = motion && now - celebrate < 900;
      let i = 0;
      for (const k of cells) {
        const [x, y] = k.split(',').map(Number);
        const t0 = dropping.get(k);
        // A solved board breathes once: each stone rises and settles, a few ms after its neighbour.
        const sc = t0 !== undefined && motion ? dropScale(now - t0) : lift ? 1 + 0.12 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (now - celebrate - i * 25) / 420)) * Math.PI)) : 1;
        if (t0 !== undefined && now - t0 >= 360) dropping.delete(k);
        i++;
        if (sc === 1) { still.add(...at(x, y)); continue; }
        const p = new CellPainter(s * sc);
        const [px, py] = at(x, y);
        p.add(px - (s * (sc - 1)) / 2, py - (s * (sc - 1)) / 2);
        p.fill(ctx, '--slate');
      }
      still.fill(ctx, '--slate');
      if (!motion) dropping.clear();
      // Where the next stone would go: a ring under the pointer or the keyboard cursor.
      const mark = cursor ?? hover;
      if (mark) {
        const [px, py] = at(mark[0], mark[1]);
        ctx.strokeStyle = alpha('--board-line', cursor ? 0.9 : 0.5);
        ctx.lineWidth = cursor ? 2 : 1.5;
        ctx.beginPath();
        ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const limit = puzzle.maxCells;
    count.textContent = playing ? '' : `${plural(cells.size, 'stone')}${limit ? ` of at most ${limit}` : ''}`;
    count.classList.toggle('over', !!limit && cells.size > limit);
    undoBtn.disabled = !undoStack.length;
    redoBtn.disabled = !redoStack.length;
  }

  // ---- placing stones ----
  let painting: boolean | null = null;
  function cellAt(e: PointerEvent): Cell | null {
    const r = canvas.getBoundingClientRect();
    const { s, ox, oy } = geometry();
    const x = Math.floor((e.clientX - r.left - ox) / s) + view.x0, y = Math.floor((e.clientY - r.top - oy) / s) + view.y0;
    return x >= 0 && y >= 0 && x < puzzle.w && y < puzzle.h ? [x, y] : null;
  }
  function set(c: Cell, on: boolean) {
    const k = key(c[0], c[1]);
    if (on === cells.has(k)) return;
    if (on) { cells.add(k); dropping.set(k, performance.now()); } else { cells.delete(k); dropping.delete(k); }
  }
  function paint(c: Cell | null) {
    if (!c || painting === null) return;
    set(c, painting);
    draw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (playing) stop();
    const c = cellAt(e);
    if (!c) return;
    canvas.setPointerCapture(e.pointerId);
    cursor = null;
    pushUndo();
    painting = !cells.has(key(c[0], c[1]));
    verdict.replaceChildren();
    paint(c);
  });
  canvas.addEventListener('pointermove', (e) => {
    hover = e.pointerType === 'mouse' ? cellAt(e) : null;
    if (painting !== null) paint(hover ?? cellAt(e));
    else if (!playing) draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; if (!playing) draw(); });
  const end = () => { if (painting !== null) { painting = null; saveDraft(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const moves: Record<string, Cell> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      if (playing) stop();
      const c = cursor ?? [Math.floor(puzzle.w / 2), Math.floor(puzzle.h / 2)];
      cursor = [Math.min(puzzle.w - 1, Math.max(0, c[0] + moves[k][0])), Math.min(puzzle.h - 1, Math.max(0, c[1] + moves[k][1]))];
      draw();
    } else if (k === ' ') {
      e.preventDefault();
      if (playing) stop();
      cursor ??= [Math.floor(puzzle.w / 2), Math.floor(puzzle.h / 2)];
      pushUndo();
      set(cursor, !cells.has(key(cursor[0], cursor[1])));
      saveDraft();
      verdict.replaceChildren();
      draw();
    } else if (k === 'enter') { e.preventDefault(); check(); }
    else if (k === 'w') { e.preventDefault(); if (playing) stop(); else play(); }
  });
  canvas.addEventListener('blur', () => { cursor = null; if (!playing) draw(); });
  window.addEventListener('resize', () => active && draw());
  onTheme(draw);

  select(PUZZLES.find((p) => !saved.solved.includes(p.id)) ?? PUZZLES[0]);
  return {
    activate() { active = true; requestAnimationFrame(draw); },
    deactivate() { active = false; },
  };
}
