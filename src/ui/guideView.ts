/**
 * Field guide: a card for every pattern in the library, with the pattern
 * moving on a small board and facts the engine measures by running it. The
 * quick facts are measured when the guide opens. Methuselahs are run to the
 * end in a worker, and their results are kept in localStorage so they are
 * only measured once.
 *
 * A card can be linked to as #guide/<id>, e.g. #guide/acorn.
 */
import { type Facts, type GrowthFacts, type RunFacts, measure } from '../engine/guide';
import { type Cell, bounds, evolveSparse } from '../engine/life';
import { findPeriod } from '../engine/objects';
import { PATTERNS, type PatternCategory, type PatternDef, patternCells } from '../engine/patterns';
import { emit } from './bus';
import { h } from './dom';
import type { GuideMessage } from './guideWorker';
import { icon } from './icons';
import { alpha, onTheme, reducedMotion, tok } from './theme';
import { CellPainter, drawBoardLines } from './thumb';

const STORE = 'life-tree:guide:v1';

type Long = { run?: RunFacts; growth?: GrowthFacts };
const needsWorker = (d: PatternDef) => d.category === 'Methuselah' || d.category === 'Growth';
const FPS = 8;

type Filter = 'all' | PatternCategory;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'Still life', label: 'Still lifes' },
  { value: 'Oscillator', label: 'Oscillators' },
  { value: 'Spaceship', label: 'Spaceships' },
  { value: 'Methuselah', label: 'Methuselahs' },
  { value: 'Gun', label: 'Guns' },
  { value: 'Growth', label: 'Growth' },
];

const CAT_COLOUR: Record<PatternCategory, string> = {
  'Still life': '--data-indigo',
  Oscillator: '--data-pine',
  Spaceship: '--data-shu',
  Methuselah: '--data-ochre',
  Gun: '--data-shu',
  Growth: '--data-ochre',
};

const n = (x: number) => x.toLocaleString('en-GB');
const plural = (x: number, w: string) => `${n(x)} ${w}${x === 1 ? '' : 's'}`;
const oneDp = (x: number) => (Number.isInteger(x) ? n(x) : x.toFixed(1));

interface Card {
  def: PatternDef;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  facts: HTMLElement;
  spark: HTMLCanvasElement;
  frames?: Cell[][];
  frame: number;
  visible: boolean;
  quick?: Facts;
  run?: RunFacts;
  growth?: GrowthFacts;
  progress?: number;
}

function loadRuns(): Record<string, Long> {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    return s && typeof s === 'object' ? s : {};
  } catch { return {}; }
}

/**
 * The frames a card loops through. Repeating patterns loop over their cycle
 * (spaceships over a few, so they travel); the rest play their first
 * generations and start again.
 */
function framesFor(def: PatternDef, facts?: Facts): Cell[][] {
  const cells = patternCells(def);
  let count: number;
  if (def.category === 'Still life') count = 1;
  else if (def.category === 'Oscillator') count = findPeriod(cells, 120)?.period ?? 1;
  else if (def.category === 'Spaceship') {
    const p = findPeriod(cells, 120);
    const step = p ? Math.max(Math.abs(p.dx), Math.abs(p.dy)) : 1;
    count = p ? p.period * Math.max(1, Math.ceil(8 / step)) : 1;
  } else if (def.category === 'Gun') {
    // Start once the stream is out, and loop one period: the gliders on the
    // board then line up across the loop, and the stream looks continuous.
    const P = facts?.gun?.period ?? def.period ?? 30;
    const warm = Math.min(3 * P, 140);
    const start = evolveSparse(cells, warm);
    const out: Cell[][] = [start];
    let cur = start;
    for (let i = 1; i < P; i++) { cur = evolveSparse(cur, 1); out.push(cur); }
    return out;
  } else count = def.category === 'Growth' ? 240 : 200;
  const out: Cell[][] = [cells];
  let cur = cells;
  for (let i = 1; i < count; i++) {
    cur = evolveSparse(cur, 1);
    out.push(cur);
  }
  return out;
}

export function createGuideView(root: HTMLElement) {
  let filter: Filter = 'all';
  let active = false;
  let raf = 0;
  let last = 0;
  let worker: Worker | null = null;
  const runs = loadRuns();

  const chips = h('div.guide-filters', { role: 'group', 'aria-label': 'Show' });
  const grid = h('div.guide-grid');
  const note = h('p.guide-note.dim');

  const cards: Card[] = PATTERNS.map((def) => {
    const canvas = h('canvas.guide-canvas', { role: 'img', 'aria-label': `${def.name}, moving` });
    const facts = h('dl.guide-facts');
    const spark = h('canvas.guide-spark', { hidden: true, 'aria-hidden': 'true' });
    const el = h('article.guide-card', { id: `guide-${def.id}`, 'data-cat': def.category },
      canvas,
      h('div.guide-body', {},
        h('div.guide-head', {},
          h('h3', {}, def.name),
          h('span.guide-chip', { style: `--c: var(${CAT_COLOUR[def.category]})` }, def.category)),
        h('p.guide-desc', {}, def.description),
        facts,
        spark,
        def.discovered ? h('p.guide-credit', {}, `Found by ${def.discovered}`) : null,
        h('div.guide-actions', {},
          h('button', { onclick: () => openOnBoard(def) }, icon('play'), 'Open on the board'),
          h('a.guide-anchor', { href: `#guide/${def.id}`, title: `Link to ${def.name}`, 'aria-label': `Link to ${def.name}` }, icon('link')))));
    return { def, el, canvas, facts, spark, frame: 0, visible: false, run: runs[def.id]?.run, growth: runs[def.id]?.growth };
  });

  for (const f of FILTERS) {
    chips.append(h('button.guide-filter', {
      'aria-pressed': String(f.value === filter),
      'data-filter': f.value,
      onclick: () => setFilter(f.value),
    }, f.label));
  }

  root.append(
    h('div.guide', {},
      h('header.view-head', {},
        h('h1', {}, 'Field guide'),
        h('p', {}, 'The classic patterns of Life, each moving on its own small board. Every number on a card is measured by running the pattern in this app: the period, speed and heat of the ones that repeat, and how long the methuselahs take to settle and what they leave behind.')),
      chips,
      grid,
      note,
      h('section.guide-terms', {},
        h('h2', {}, 'Reading a card'),
        h('dl', {},
          h('dt', {}, 'Period'), h('dd', {}, 'Generations until the pattern looks the same again.'),
          h('dt', {}, 'Speed'), h('dd', {}, 'How far a spaceship moves per period, as a fraction of c, the speed of light: one cell per generation.'),
          h('dt', {}, 'Heat'), h('dd', {}, 'Stones placed or taken off per generation, on average over a period. Still lifes have none.'),
          h('dt', {}, 'Rotor and stator'), h('dd', {}, 'The rotor is the points that change during the cycle; the stator is the stones that never move.'),
          h('dt', {}, 'Settles at'), h('dd', {}, 'The generation from which a methuselah only repeats or is empty. Gliders that fly off don\'t count, so they are taken away once nothing lies ahead of them.')))),
  );

  grid.append(...cards.map((c) => c.el));

  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const c = cards.find((k) => k.el === e.target);
        if (!c) continue;
        c.visible = e.isIntersecting;
        if (c.visible) { if (!c.quick) fillFacts(c); c.frames ??= framesFor(c.def, c.quick); draw(c); }
      }
    }, { rootMargin: '200px' })
    : null;
  for (const c of cards) io?.observe(c.el);

  function setFilter(f: Filter) {
    filter = f;
    for (const b of chips.querySelectorAll<HTMLButtonElement>('.guide-filter')) b.setAttribute('aria-pressed', String(b.dataset.filter === f));
    for (const c of cards) c.el.hidden = f !== 'all' && c.def.category !== f;
    const shown = cards.filter((c) => !c.el.hidden).length;
    note.textContent = `${plural(shown, 'pattern')} shown.`;
  }

  function openOnBoard(def: PatternDef) {
    emit('sim:load', { cells: patternCells(def), name: def.name });
    emit('navigate', { route: 'sim' });
  }

  // Facts

  function row(label: string, value: string, title?: string) {
    return [h('dt', {}, label), h('dd', title ? { title } : {}, value)];
  }

  function fillFacts(c: Card) {
    const q = (c.quick ??= measure(c.def));
    const rows: HTMLElement[][] = [
      row('Stones', n(q.cells)),
      row('Size', `${q.width} × ${q.height}`),
    ];
    const cy = q.cycle;
    if (cy) {
      if (cy.speed) rows.push(row('Speed', cy.speed));
      if (cy.period > 1) rows.push(row('Period', n(cy.period)));
      if (cy.minPop !== cy.maxPop) rows.push(row('Stones over a cycle', `${n(cy.minPop)} to ${n(cy.maxPop)}`));
      if (cy.period > 1) rows.push(row('Heat', oneDp(cy.heat)));
      if (cy.rotor !== undefined && cy.period > 1) rows.push(row('Rotor, stator', `${n(cy.rotor)}, ${n(cy.stator ?? 0)}`));
    }
    if (q.gun) {
      rows.push(row('Period', n(q.gun.period)));
      rows.push(row('Fires', q.gun.perPeriod === 1 ? `a glider every ${n(q.gun.period)} generations` : `${n(q.gun.perPeriod)} gliders every ${n(q.gun.period)} generations`));
    }
    if (c.def.category === 'Growth') rows.push(row('Stones at 2,000', c.growth ? n(c.growth.final) : 'measuring…'));
    if (c.def.category === 'Methuselah') {
      const r = c.run;
      if (r) {
        rows.push(row('Settles at', r.ending === 'unsettled' ? 'not by 30,000' : `generation ${n(r.lifespan)}`));
        rows.push(row('Most stones', n(r.peakPop)));
        rows.push(row('Leaves', r.ending === 'dies' ? 'nothing' : `${plural(r.finalPop, 'stone')}, ${r.ending === 'still' ? 'still' : `period ${r.endPeriod}`}`));
        rows.push(row('Gliders off', n(r.escapes)));
      } else rows.push(row('Settles at', c.progress !== undefined ? `measuring, generation ${n(c.progress)}…` : 'measuring…'));
    }
    c.facts.replaceChildren(...rows.flat());
    const trace = c.run?.trace ?? c.growth?.trace;
    c.spark.hidden = !trace;
    if (trace) {
      c.spark.setAttribute('aria-label', c.run ? `Stones by generation, up to ${n(c.run.lifespan)}` : 'Stones by generation, up to 2,000');
      drawSpark(c.spark, trace);
    }
  }

  function drawSpark(canvas: HTMLCanvasElement, values: number[]) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || 240, H = canvas.clientHeight || 36;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const max = Math.max(1, ...values);
    const x = (i: number) => (i / Math.max(1, values.length - 1)) * (W - 2) + 1;
    const y = (v: number) => H - 2 - (v / max) * (H - 4);
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.lineTo(x(values.length - 1), H);
    ctx.lineTo(x(0), H);
    ctx.closePath();
    ctx.fillStyle = alpha('--data-ochre', 0.18);
    ctx.fill();
    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = tok('--data-ochre');
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Methuselahs, in a worker

  function measureRuns() {
    const todo = cards.filter((c) => needsWorker(c.def) && !c.run && !c.growth).map((c) => c.def.id);
    if (!todo.length || worker) return;
    try {
      worker = new Worker(new URL('./guideWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      for (const c of cards) if (needsWorker(c.def) && !c.run && !c.growth) c.facts.lastElementChild!.textContent = 'needs Web Workers';
      return;
    }
    worker.onmessage = (e: MessageEvent<GuideMessage>) => {
      const c = cards.find((k) => k.def.id === e.data.id);
      if (!c) return;
      if ('gen' in e.data) c.progress = e.data.gen;
      else {
        if ('run' in e.data) c.run = e.data.run;
        else c.growth = e.data.growth;
        runs[c.def.id] = { run: c.run, growth: c.growth };
        try { localStorage.setItem(STORE, JSON.stringify(runs)); } catch { /* measured again next visit */ }
        if (cards.every((k) => !needsWorker(k.def) || k.run || k.growth)) { worker?.terminate(); worker = null; }
      }
      fillFacts(c);
    };
    worker.postMessage({ ids: todo });
  }

  // Drawing

  function draw(c: Card) {
    const frames = c.frames;
    if (!frames) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = c.canvas.clientWidth || 260, H = c.canvas.clientHeight || 180;
    if (c.canvas.width !== Math.round(W * dpr)) { c.canvas.width = Math.round(W * dpr); c.canvas.height = Math.round(H * dpr); }
    const ctx = c.canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, W, H);
    // One frame for the whole loop, so the board doesn't jump: the box around every frame, plus a margin.
    const box = frameBox(c);
    const cw = box.x1 - box.x0 + 1, ch = box.y1 - box.y0 + 1;
    const s = Math.min((W - 16) / cw, (H - 16) / ch, 18);
    const ox = (W - cw * s) / 2 - box.x0 * s, oy = (H - ch * s) / 2 - box.y0 * s;
    drawBoardLines(ctx, W, H, s, ox, oy);
    const p = new CellPainter(s);
    for (const [x, y] of frames[c.frame % frames.length]) {
      const px = ox + x * s, py = oy + y * s;
      if (px > -s && py > -s && px < W && py < H) p.add(px, py);
    }
    p.fill(ctx);
  }

  type Box = { x0: number; y0: number; x1: number; y1: number };
  const boxes = new Map<string, Box[]>();
  /** The part of the board a frame shows. */
  function frameBox(c: Card): Box {
    let b = boxes.get(c.def.id);
    if (!b) {
      const frames = c.frames!;
      const cat = c.def.category;
      if (cat === 'Methuselah' || cat === 'Growth') {
        // A camera that pulls back as the pattern grows, and never closes in
        // again. Each frame frames the middle 96% of its stones, so gliders
        // flying off don't shrink the rest to specks.
        const q = (v: number[], f: number) => v[Math.min(v.length - 1, Math.floor(f * v.length))];
        b = [];
        let cam: Box | null = null;
        for (const f of frames) {
          if (!f.length) { b.push(cam ?? { x0: -4, y0: -3, x1: 4, y1: 3 }); continue; }
          const xs = f.map((p) => p[0]).sort((p, r) => p - r), ys = f.map((p) => p[1]).sort((p, r) => p - r);
          const lo = f.length < 40 ? 0 : 0.02, hi = f.length < 40 ? 0.9999 : 0.98;
          const fb = { x0: q(xs, lo) - 3, y0: q(ys, lo) - 3, x1: q(xs, hi) + 3, y1: q(ys, hi) + 3 };
          const nc: Box = cam ? { x0: Math.min(cam.x0, fb.x0), y0: Math.min(cam.y0, fb.y0), x1: Math.max(cam.x1, fb.x1), y1: Math.max(cam.y1, fb.y1) } : fb;
          cam = nc;
          b.push(nc);
        }
      } else if (cat === 'Gun') {
        // The gun and its stream at the start of the loop; gliders beyond it are off the board.
        const bb = bounds(frames[0])!;
        b = [{ x0: bb.x0 - 1, y0: bb.y0 - 1, x1: bb.x1 + 1, y1: bb.y1 + 1 }];
      } else {
        const bb = bounds(frames.flat())!;
        const m = cat === 'Still life' || cat === 'Oscillator' ? 2 : 1;
        b = [{ x0: bb.x0 - m, y0: bb.y0 - m, x1: bb.x1 + m, y1: bb.y1 + m }];
      }
      boxes.set(c.def.id, b);
    }
    return b[Math.min(b.length - 1, c.frame % c.frames!.length)];
  }

  function tick(t: number) {
    raf = requestAnimationFrame(tick);
    if (t - last < 1000 / FPS) return;
    last = t;
    for (const c of cards) {
      if (!c.visible || c.el.hidden || !c.frames || c.frames.length < 2) continue;
      c.frame = (c.frame + 1) % c.frames.length;
      draw(c);
    }
  }

  function goToHash() {
    const id = location.hash.split('/')[1];
    const c = id && cards.find((k) => k.def.id === id);
    if (!c) return;
    if (c.el.hidden) setFilter('all');
    // Fill in every card above it first, so nothing above grows after the scroll and pushes it away.
    for (const k of cards) { if (k === c) break; if (!k.quick) fillFacts(k); }
    if (!c.quick) fillFacts(c);
    c.el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    c.el.classList.remove('flash');
    void c.el.offsetWidth;
    c.el.classList.add('flash');
  }

  onTheme(() => { if (active) for (const c of cards) { if (c.visible) draw(c); if (!c.spark.hidden) fillFacts(c); } });
  window.addEventListener('hashchange', () => { if (active && location.hash.startsWith('#guide/')) goToHash(); });

  setFilter('all');

  return {
    activate() {
      active = true;
      if (!io) for (const c of cards) { c.visible = true; fillFacts(c); c.frames ??= framesFor(c.def, c.quick); draw(c); }
      measureRuns();
      if (!reducedMotion()) raf = requestAnimationFrame(tick);
      requestAnimationFrame(goToHash);
    },
    deactivate() {
      active = false;
      cancelAnimationFrame(raf);
    },
  };
}
