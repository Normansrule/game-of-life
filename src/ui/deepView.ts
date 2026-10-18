import katex from 'katex';
import type { Cell } from '../engine/life';
import { Hashlife } from '../engine/hashlife';
import { getPattern, patternCells } from '../engine/patterns';
import { drawChart } from './chart';
import { fitCanvas, fmt, h, select, slider, toast } from './dom';
import { on } from './bus';

const SEEDS = ['gosper', 'simkin', 'switchengine', 'line', 'acorn', 'rabbits', 'rpentomino', 'copperhead', 'glider'];

function genText(g: number): string {
  const p = Math.log2(g);
  const pow = g > 0 && Number.isInteger(p) && p >= 10 ? ` = 2^${p}` : '';
  if (g >= 1e15) return `${g.toExponential(3)}${pow}`;
  return `${fmt(g)}${pow}`;
}

export function createDeepView(root: HTMLElement) {
  let life = new Hashlife();
  let seed = 'gosper';
  let seedCells: Cell[] = patternCells(seed);
  let active = false;
  let dirty = true;
  let follow = true;
  let playing = false;
  let stepExp = 6;
  const history: { g: number; p: number }[] = [];
  const view = { cx: 0, cy: 0, cellPx: 6 };
  let lastMs = 0;

  const canvas = h('canvas.deep-canvas');
  const statEls = { gen: h('b'), pop: h('b'), size: h('b'), level: h('b'), nodes: h('b'), hit: h('b'), ms: h('b') };
  const chart = h('canvas.chart.tall');
  const playBtn = h('button.primary', { onclick: () => { playing = !playing; playBtn.textContent = playing ? 'Pause' : 'Play'; } }, 'Play');
  const jumpSel = select(
    [10, 16, 20, 24, 30, 40, 50].map((n) => ({ value: String(n), label: `Jump to 2^${n}` })),
    '20',
    () => {},
  );
  const stepCtl = slider('Step size while playing', 0, 30, 1, stepExp, (v) => (stepExp = v), (v) => `2^${v} = ${fmt(2 ** v)} gens`);

  const patternSel = select(
    [...SEEDS.map((id) => ({ value: id, label: getPattern(id)!.name })), { value: 'custom', label: 'From the simulator' }],
    seed,
    (v) => {
      if (v === 'custom') return;
      seed = v;
      seedCells = patternCells(v);
      reset();
    },
  );
  const controls = h(
    'div.controls',
    {},
    h('label', {}, 'Pattern ', patternSel),
    h('button', { onclick: () => run(1) }, '+1'),
    h('button', { onclick: () => run(Math.max(1, life.generation)) }, 'Double generation'),
    jumpSel,
    h('button', { onclick: () => { const t = 2 ** +jumpSel.value; if (t > life.generation) run(t - life.generation); else toast('Already past that generation'); } }, 'Go'),
    playBtn,
    h('button', { onclick: reset }, 'Reset'),
  );

  const info = h('div.prose.small', {
    html:
      `<p>Hashlife stores the universe as a quadtree in which identical squares are shared, and remembers the future of every square it has seen. ` +
      `A node of size ${katex.renderToString('2^k')} can be advanced ${katex.renderToString('2^{k-2}')} generations by combining nine overlapping sub-results, so regular patterns can be pushed exponentially far in time.</p>` +
      `<p>On the log–log chart a power law ${katex.renderToString('P \\propto t^{a}')} is a straight line of slope ${katex.renderToString('a')}: guns and switch engines grow linearly (${katex.renderToString('a = 1')}), methuselahs flatten out.</p>`,
  });

  root.append(
    h(
      'div.lineage',
      {},
      h('div.lineage-main', {}, controls, h('div.tree-wrap', {}, canvas, h('div.tree-help', {}, 'Scroll to zoom · drag to pan · F toggles follow'))),
      h(
        'aside.side',
        {},
        h('section.panel', {}, h('h3', {}, 'Deep time'), h('div.stats.two', {},
          stat('Generation', statEls.gen), stat('Population', statEls.pop), stat('Extent', statEls.size),
          stat('Tree level', statEls.level), stat('Unique nodes', statEls.nodes), stat('Cache hit rate', statEls.hit), stat('Last jump', statEls.ms)), stepCtl.el),
        h('section.panel', {}, h('h3', {}, 'Population vs generation (log–log)'), chart),
        h('section.panel', {}, h('h3', {}, 'How it works'), info),
      ),
    ),
  );

  function stat(label: string, el: HTMLElement) {
    return h('div.stat', {}, h('span', {}, label), el);
  }

  function reset() {
    life = new Hashlife();
    life.load(seedCells);
    history.length = 0;
    history.push({ g: 0, p: life.population });
    playing = false;
    playBtn.textContent = 'Play';
    follow = true;
    fitView();
    updateStats();
  }

  function run(gens: number) {
    const t0 = performance.now();
    life.advance(gens);
    lastMs = performance.now() - t0;
    history.push({ g: life.generation, p: life.population });
    if (history.length > 400) history.splice(1, 1);
    if (follow) fitView();
    updateStats();
  }

  function fitView() {
    const b = life.bounds();
    fitCanvas(canvas);
    const W = canvas.clientWidth || 800, H = canvas.clientHeight || 600;
    if (!b) return;
    const w = b.x1 - b.x0 + 1, hh = b.y1 - b.y0 + 1;
    view.cellPx = Math.min(16, (W * 0.85) / w, (H * 0.85) / hh);
    view.cx = (b.x0 + b.x1 + 1) / 2;
    view.cy = (b.y0 + b.y1 + 1) / 2;
    dirty = true;
  }

  function updateStats() {
    const b = life.bounds();
    statEls.gen.textContent = genText(life.generation);
    statEls.pop.textContent = fmt(life.population);
    statEls.size.textContent = b ? `${fmt(b.x1 - b.x0 + 1)} × ${fmt(b.y1 - b.y0 + 1)}` : '—';
    statEls.level.textContent = `${life.root.k} (${fmt(2 ** life.root.k)}²)`;
    statEls.nodes.textContent = fmt(life.nodeCount);
    const t = life.stats.hits + life.stats.misses;
    statEls.hit.textContent = t ? `${((life.stats.hits / t) * 100).toFixed(1)}%` : '—';
    statEls.ms.textContent = `${lastMs.toFixed(1)} ms`;
    const pts = history.filter((p) => p.g > 0 && p.p > 0);
    const xs = pts.map((p) => Math.log10(p.g));
    const ys = pts.map((p) => Math.log10(p.p));
    const series = [{ values: ys, xs, color: '#7df9ff', label: 'log₁₀ population', dots: true, width: 1.5 }];
    if (pts.length > 1) {
      const x0 = xs[0], y0 = ys[0];
      const xe = xs[xs.length - 1];
      series.push({ values: [y0, y0 + (xe - x0)], xs: [x0, xe], color: '#ffb020', label: 'slope 1', dots: false, width: 1 });
      series.push({ values: [y0, y0 + 2 * (xe - x0)], xs: [x0, xe], color: '#ff4fa3', label: 'slope 2', dots: false, width: 1 });
    }
    drawChart(chart, series.map((s) => (s.label === 'log₁₀ population' ? s : { ...s, dash: [4, 3] })), { legend: true, xLabel: 'log₁₀ generation', yMax: Math.max(...ys, 1) + 0.5 });
    dirty = true;
  }

  function draw() {
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04060d';
    ctx.fillRect(0, 0, W, H);
    const px = view.cellPx;
    const vx0 = view.cx - W / 2 / px, vy0 = view.cy - H / 2 / px;
    const viewRect = { x0: vx0 - 1, y0: vy0 - 1, x1: vx0 + W / px + 1, y1: vy0 + H / px + 1 };
    // Stop descending at squares about one pixel wide.
    const minSize = Math.max(1, 2 ** Math.floor(Math.log2(Math.max(1, 1 / px))));
    const gap = px >= 5 ? 1 : 0;
    life.visit(minSize, viewRect, (x, y, s, d) => {
      const sx = (x - vx0) * px, sy = (y - vy0) * px;
      const size = Math.max(1, s * px);
      if (s === 1) ctx.fillStyle = '#9ff7ff';
      else {
        const a = Math.min(1, 0.25 + Math.sqrt(d) * 1.6);
        ctx.fillStyle = `rgba(125, 249, 255, ${a})`;
      }
      ctx.fillRect(sx, sy, size - gap, size - gap);
    });
    ctx.fillStyle = 'rgba(200,215,255,0.7)';
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText(`1 px = ${px >= 1 ? '1 cell' : `${fmt(Math.round(1 / px))} cells`}`, 12, H - 12);
  }

  // Interaction
  let drag: { x: number; y: number; cx: number; cy: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cy: view.cy };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.cx = drag.cx - (e.offsetX - drag.x) / view.cellPx;
    view.cy = drag.cy - (e.offsetY - drag.y) / view.cellPx;
    follow = false;
    dirty = true;
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const wx = view.cx + (e.offsetX - W / 2) / view.cellPx;
    const wy = view.cy + (e.offsetY - H / 2) / view.cellPx;
    view.cellPx = Math.min(40, Math.max(1e-12, view.cellPx * Math.exp(-e.deltaY * 0.0015)));
    view.cx = wx - (e.offsetX - W / 2) / view.cellPx;
    view.cy = wy - (e.offsetY - H / 2) / view.cellPx;
    follow = false;
    dirty = true;
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (active && e.key.toLowerCase() === 'f' && !(e.target instanceof HTMLInputElement)) {
      follow = !follow;
      if (follow) fitView();
      toast(follow ? 'Following the pattern' : 'Follow off');
    }
  });
  window.addEventListener('resize', () => (dirty = true));

  on('deep:load', ({ cells }) => {
    seedCells = cells;
    patternSel.value = 'custom';
    reset();
  });

  let lastStep = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!active) return;
    if (playing && now - lastStep > 50) {
      lastStep = now;
      run(2 ** stepExp);
    }
    if (dirty) {
      dirty = false;
      draw();
    }
  }
  requestAnimationFrame(frame);

  return {
    activate() {
      active = true;
      if (life.generation === 0 && history.length === 0) reset();
      requestAnimationFrame(() => {
        fitView();
        updateStats();
      });
    },
    deactivate() {
      active = false;
    },
  };
}
