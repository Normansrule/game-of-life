/**
 * Puzzles tab: draw a pattern on a small grid to meet a goal, and the
 * engine checks it. Progress and drafts are kept in localStorage.
 */
import { type Cell, evolveSparse } from '../engine/life';
import { type Difficulty, PUZZLES, type Puzzle } from '../engine/puzzles';
import { emit } from './bus';
import { fitCanvas, h, readVar } from './dom';

const STORE = 'life-tree:puzzles:v1';
const DIFF_COLOUR: Record<Difficulty, string> = { easy: '#38e8a8', medium: '#ffb020', hard: '#ff4fa3' };

interface Saved { solved: string[]; drafts: Record<string, Cell[]> }

function loadSaved(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return { solved: Array.isArray(s.solved) ? s.solved : [], drafts: s.drafts && typeof s.drafts === 'object' ? s.drafts : {} };
  } catch { return { solved: [], drafts: {} }; }
}

export function createPuzzlesView(root: HTMLElement) {
  const saved = loadSaved();
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* private mode: progress lasts for this visit */ } };

  let puzzle: Puzzle = PUZZLES[0];
  let cells = new Set<string>();
  let playing: Cell[] | null = null;
  let gen = 0;
  let done = false;
  let view = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let active = false;

  const list = h('div.pz-list');
  const progress = h('div.pz-progress');
  const title = h('h2');
  const chip = h('span.pz-chip');
  const goal = h('p.pz-goal');
  const hint = h('p.pz-hint');
  const canvas = h('canvas.pz-canvas');
  const verdict = h('div.pz-verdict');
  const info = h('span.mono.dim');
  const playBtn = h('button', { onclick: () => (playing ? stop() : play()) }, '▶ Watch it run');
  const checkBtn = h('button.primary', { onclick: check }, 'Check');

  root.append(h('div.puzzles', {},
    h('header.math-hero', {},
      h('h1', {}, 'Puzzles'),
      h('p', {}, 'Ten construction challenges. Draw on the grid, press Check, and the same engine that runs the simulator decides whether your pattern does what the goal asks. Wrong answers are told what their pattern actually does, which is often the best clue.')),
    h('div.pz-layout', {},
      h('aside', {}, progress, list),
      h('section.panel.pz-main', {},
        h('div.pz-head', {}, title, chip),
        goal,
        canvas,
        h('div.fig-controls', {}, checkBtn, playBtn,
          h('button', { onclick: () => { stop(); cells.clear(); saveDraft(); draw(); verdict.replaceChildren(); } }, 'Clear'),
          h('button', { onclick: () => hint.classList.toggle('shown') }, 'Hint'),
          h('button', { onclick: openInSim }, 'Open in simulator'),
          info),
        hint,
        verdict))));

  function renderList() {
    list.replaceChildren(...PUZZLES.map((p, i) => h(`button.pz-item${p.id === puzzle.id ? '.active' : ''}${saved.solved.includes(p.id) ? '.solved' : ''}`, { onclick: () => select(p) },
      h('span.pz-num', {}, saved.solved.includes(p.id) ? '✓' : String(i + 1)),
      h('span', {}, h('b', {}, p.title), h('span.pz-dot', { style: `background:${DIFF_COLOUR[p.difficulty]}`, title: p.difficulty })))));
    const n = saved.solved.filter((id) => PUZZLES.some((p) => p.id === id)).length;
    progress.replaceChildren(h('b', {}, `${n} / ${PUZZLES.length} solved`), h('div.pz-bar', {}, h('span', { style: `width:${(n / PUZZLES.length) * 100}%` })));
  }

  function select(p: Puzzle) {
    stop();
    puzzle = p;
    cells = new Set((saved.drafts[p.id] ?? []).map(([x, y]) => `${x},${y}`));
    title.textContent = p.title;
    chip.textContent = p.difficulty;
    chip.style.setProperty('--c', DIFF_COLOUR[p.difficulty]);
    goal.textContent = p.goal;
    hint.textContent = p.hint;
    hint.classList.remove('shown');
    verdict.replaceChildren();
    if (saved.solved.includes(p.id)) verdict.append(h('div.ok', {}, 'Solved before. Try a different answer if you like.'));
    renderList();
    resetView();
    draw();
  }

  const currentCells = (): Cell[] => [...cells].map((k) => k.split(',').map(Number) as Cell);
  function saveDraft() { saved.drafts[puzzle.id] = currentCells(); persist(); }

  function check() {
    stop();
    const v = puzzle.check(currentCells());
    verdict.replaceChildren(h(v.ok ? 'div.ok' : 'div.bad', {}, v.ok ? `✓ Solved! ${v.message}` : v.message));
    if (v.ok && !saved.solved.includes(puzzle.id)) { saved.solved.push(puzzle.id); persist(); renderList(); }
  }

  function openInSim() {
    const c = currentCells();
    if (!c.length) return;
    emit('sim:load', { cells: c, name: `Puzzle: ${puzzle.title}` });
    emit('navigate', { route: 'sim' });
  }

  // ---- playback ----
  function play() {
    if (!cells.size) return;
    playing = currentCells();
    gen = 0;
    done = false;
    playBtn.textContent = '■ Back to drawing';
    canvas.classList.add('playing');
  }
  function stop() {
    playing = null;
    playBtn.textContent = '▶ Watch it run';
    canvas.classList.remove('playing');
    info.textContent = '';
    resetView();
    draw();
  }
  function resetView() { view = { x0: 0, y0: 0, x1: puzzle.w - 1, y1: puzzle.h - 1 }; }

  let frame = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!active || !playing || done || frame++ % 3) return;
    playing = evolveSparse(playing, 1);
    gen++;
    // Grow (never shrink) the view so expanding patterns stay visible.
    for (const [x, y] of playing) {
      if (x < view.x0) view.x0 = x; if (x > view.x1) view.x1 = x;
      if (y < view.y0) view.y0 = y; if (y > view.y1) view.y1 = y;
    }
    info.textContent = `generation ${gen} · ${playing.length} cells`;
    draw();
    if (!playing.length || gen >= 3000) { done = true; info.textContent += playing.length ? ' · stopped at 3000' : ' · all gone'; }
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
    ctx.clearRect(0, 0, W, H);
    const { s, ox, oy } = geometry();
    // The puzzle grid.
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(ox + (0 - view.x0) * s, oy + (0 - view.y0) * s, puzzle.w * s, puzzle.h * s);
    if (s >= 6) {
      ctx.strokeStyle = readVar('--grid') || 'rgba(140,160,220,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= puzzle.w; x++) { const px = ox + (x - view.x0) * s; ctx.moveTo(px, oy - view.y0 * s); ctx.lineTo(px, oy + (puzzle.h - view.y0) * s); }
      for (let y = 0; y <= puzzle.h; y++) { const py = oy + (y - view.y0) * s; ctx.moveTo(ox - view.x0 * s, py); ctx.lineTo(ox + (puzzle.w - view.x0) * s, py); }
      ctx.stroke();
    }
    const live = playing ?? currentCells();
    ctx.fillStyle = playing ? '#c084fc' : '#7df9ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = s > 8 ? 8 : 0;
    const g = s > 4 ? Math.max(1, s * 0.08) : 0;
    for (const [x, y] of live) ctx.fillRect(ox + (x - view.x0) * s + g, oy + (y - view.y0) * s + g, Math.max(1, s - 2 * g), Math.max(1, s - 2 * g));
    ctx.shadowBlur = 0;
  }

  // ---- editing ----
  let painting: boolean | null = null;
  function cellAt(e: PointerEvent): Cell | null {
    const r = canvas.getBoundingClientRect();
    const { s, ox, oy } = geometry();
    const x = Math.floor((e.clientX - r.left - ox) / s) + view.x0, y = Math.floor((e.clientY - r.top - oy) / s) + view.y0;
    return x >= 0 && y >= 0 && x < puzzle.w && y < puzzle.h ? [x, y] : null;
  }
  function paint(c: Cell | null) {
    if (!c || painting === null) return;
    const k = `${c[0]},${c[1]}`;
    if (painting) cells.add(k); else cells.delete(k);
    draw();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (playing) stop();
    const c = cellAt(e);
    if (!c) return;
    canvas.setPointerCapture(e.pointerId);
    painting = !cells.has(`${c[0]},${c[1]}`);
    verdict.replaceChildren();
    paint(c);
  });
  canvas.addEventListener('pointermove', (e) => paint(cellAt(e)));
  const end = () => { if (painting !== null) { painting = null; saveDraft(); } };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  window.addEventListener('resize', () => active && draw());

  select(PUZZLES.find((p) => !saved.solved.includes(p.id)) ?? PUZZLES[0]);
  return {
    activate() { active = true; requestAnimationFrame(draw); },
    deactivate() { active = false; },
  };
}
