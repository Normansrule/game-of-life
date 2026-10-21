/**
 * Math §18: the fate of every pattern that fits in a 4×4 box. The 8548
 * orbit representatives are run in a Web Worker (or between frames if
 * workers are blocked); finished results are cached in localStorage.
 */
import { type BoxRecord, OUTCOME_INFO, type Outcome, maskToCells } from '../engine/exhaustive';
import { type BoxCommand, type BoxMessage, createBoxRunner } from './boxRunner';
import { emit } from './bus';
import { drawChart } from './chart';
import { fitCanvas, h } from './dom';
import { alpha, onTheme, tok } from './theme';
import { drawThumb } from './thumb';

const N = 4;
const MAX_GEN = 6000;
const CACHE_KEY = 'life-tree:box4:v1';
const OUTCOMES = Object.keys(OUTCOME_INFO) as Outcome[];
/** Outcome colours from the data palette (the engine's own colours belong to the old design). */
const OUTCOME_TOKEN: Record<Outcome, string> = {
  vanishes: '--muted', flies: '--data-indigo', still: '--data-pine', oscillator: '--data-plum', gliders: '--data-ochre', unsettled: '--data-shu',
};
const outcomeVar = (o: Outcome) => `var(${OUTCOME_TOKEN[o]})`;

type Port = { postMessage: (m: BoxCommand) => void; terminate: () => void };

export function createBoxFigures() {
  let records: BoxRecord[] = [];
  let total = 0;
  let port: Port | null = null;
  let started = false;
  let t0 = 0;

  const status = h('span.readout', {}, 'Waiting to start: scroll here or press Run.');
  const bar = h('div.box-bar');
  const legend = h('div.box-legend');
  const byCells = h('canvas.chart.tall');
  const lifeChart = h('canvas.chart');
  const gallery = h('div.box-gallery');
  const runBtn = h('button', { onclick: () => start(true) }, 'Run the census again');

  function save() {
    try {
      const packed = records.map((r) => [r.mask, OUTCOMES.indexOf(r.outcome), r.lifespan, r.period, r.finalPopulation, r.maxPopulation]);
      localStorage.setItem(CACHE_KEY, JSON.stringify(packed));
    } catch { /* storage full or blocked: the census just reruns next time */ }
  }

  function load(): BoxRecord[] | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const packed = JSON.parse(raw) as number[][];
      return packed.map(([mask, o, lifespan, period, finalPopulation, maxPopulation]) => {
        const outcome = OUTCOMES[o];
        const fate = outcome === 'vanishes' || outcome === 'flies' ? 'dies' : outcome === 'unsettled' ? 'unsettled' : period === 1 ? 'still' : 'oscillates';
        const cells = maskToCells(mask, N).length;
        return { mask, outcome, lifespan, period, finalPopulation, maxPopulation, fate, escaped: outcome === 'flies' || outcome === 'gliders', cells };
      });
    } catch { return null; }
  }

  function onBatch(m: BoxMessage) {
    total = m.total;
    records.push(...m.records);
    dirty = true;
    if (m.done >= m.total) {
      status.textContent = `Done: ${total.toLocaleString()} patterns in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      save();
    } else status.textContent = `Running pattern ${m.done.toLocaleString()} of ${m.total.toLocaleString()}…`;
  }

  function ensurePort(): Port {
    if (port) return port;
    const local = (): Port => {
      const handle = createBoxRunner(onBatch);
      return { postMessage: handle, terminate: () => handle({ type: 'stop' }) };
    };
    try {
      const w = new Worker(new URL('./boxWorker.ts', import.meta.url), { type: 'module' });
      let heard = false;
      const pending: BoxCommand[] = [];
      w.onmessage = (e: MessageEvent<BoxMessage>) => { heard = true; onBatch(e.data); };
      w.onerror = () => {
        if (heard) return;
        w.terminate();
        port = local();
        for (const m of pending) port.postMessage(m);
      };
      port = { postMessage: (m) => { if (!heard) pending.push(m); w.postMessage(m); }, terminate: () => w.terminate() };
    } catch {
      port = local();
    }
    return port;
  }

  function start(force = false) {
    started = true;
    records = [];
    if (!force) {
      const cached = load();
      if (cached && cached.length) {
        records = cached;
        total = cached.length;
        status.textContent = `${total.toLocaleString()} patterns (saved from an earlier visit; press Run to recompute).`;
        dirty = true;
        return;
      }
    }
    t0 = performance.now();
    status.textContent = 'Starting…';
    ensurePort().postMessage({ type: 'start', n: N, maxGen: MAX_GEN });
  }

  // ---- drawing ----
  let dirty = false, lastDraw = 0;
  function frame(t: number) {
    requestAnimationFrame(frame);
    if (!dirty || t - lastDraw < 250) return;
    dirty = false;
    lastDraw = t;
    draw();
  }
  requestAnimationFrame(frame);
  onTheme(() => { galleryKey = ''; dirty = true; });

  function draw() {
    const counts = new Map<Outcome, number>(OUTCOMES.map((o) => [o, 0]));
    for (const r of records) counts.set(r.outcome, counts.get(r.outcome)! + 1);
    const denom = Math.max(total, records.length, 1);
    bar.replaceChildren(...OUTCOMES.filter((o) => counts.get(o)).map((o) =>
      h('span', { style: `width:${(counts.get(o)! / denom) * 100}%;background:${outcomeVar(o)}`, title: `${OUTCOME_INFO[o].label}: ${counts.get(o)}` })));
    legend.replaceChildren(...OUTCOMES.filter((o) => o !== 'unsettled' || counts.get(o)).map((o) =>
      h('div', {}, h('span.cls-dot', { style: `background:${outcomeVar(o)}` }), `${OUTCOME_INFO[o].label} `,
        h('b.readout', {}, counts.get(o)!.toLocaleString()),
        h('span.dim', {}, records.length ? ` (${((counts.get(o)! / records.length) * 100).toFixed(1)}%)` : ''))));
    drawByCells();
    drawLifespans();
    drawGallery();
  }

  function drawByCells() {
    fitCanvas(byCells);
    const ctx = byCells.getContext('2d')!;
    const dpr = byCells.width / Math.max(1, byCells.clientWidth);
    const W = byCells.clientWidth, H = byCells.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const muted = tok('--muted');
    const padL = 40, padB = 34, padT = 10, padR = 10;
    const pw = W - padL - padR, ph = H - padT - padB;
    const K = N * N + 1;
    const tally: number[][] = Array.from({ length: K }, () => OUTCOMES.map(() => 0));
    for (const r of records) tally[r.cells][OUTCOMES.indexOf(r.outcome)]++;
    const bw = pw / K;
    ctx.font = `11px ${tok('--ui')}`;
    ctx.fillStyle = muted;
    ctx.textAlign = 'right';
    for (const v of [0, 50, 100]) {
      const y = padT + ph * (1 - v / 100);
      ctx.fillText(`${v}%`, padL - 6, y + 4);
      ctx.strokeStyle = alpha('--ink', 0.12);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }
    ctx.textAlign = 'center';
    for (let k = 0; k < K; k++) {
      const sum = tally[k].reduce((a, b) => a + b, 0);
      const x = padL + k * bw;
      let y = padT + ph;
      if (sum) for (let o = 0; o < OUTCOMES.length; o++) {
        const hh = (tally[k][o] / sum) * ph;
        ctx.fillStyle = tok(OUTCOME_TOKEN[OUTCOMES[o]]);
        ctx.fillRect(x + 1, y - hh, bw - 2, hh);
        y -= hh;
      }
      ctx.fillStyle = muted;
      ctx.fillText(String(k), x + bw / 2, padT + ph + 14);
    }
    ctx.fillText('live cells at the start', padL + pw / 2, H - 4);
  }

  function drawLifespans() {
    // Count patterns in bins a quarter of a decade wide.
    const B = 4, counts: number[] = [];
    for (const r of records) {
      if (r.outcome === 'unsettled') continue;
      const b = Math.floor(Math.log10(r.lifespan + 1) * B);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    const xs: number[] = [], ys: number[] = [];
    for (let b = 0; b < counts.length; b++) if (counts[b]) { xs.push((b + 0.5) / B); ys.push(counts[b]); }
    drawChart(lifeChart, [{ values: ys, xs, color: '--ink', dots: true, width: 2, label: 'patterns per quarter-decade bin' }],
      { logY: true, legend: true, xLabel: 'log₁₀(generations until settled + 1)' });
  }

  let galleryKey = '';
  function drawGallery() {
    // Different starts often merge into the same history after a generation or two; show each history once.
    const seen = new Set<string>();
    const top = records.filter((r) => r.outcome !== 'unsettled').sort((a, b) => b.lifespan - a.lifespan || a.cells - b.cells).filter((r) => {
      const k = `${r.lifespan}:${r.finalPopulation}:${r.maxPopulation}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 12);
    const key = top.map((r) => r.mask).join(',');
    if (key === galleryKey) return;
    galleryKey = key;
    gallery.replaceChildren(...top.map((r, i) => {
      const cells = maskToCells(r.mask, N);
      const c = h('canvas.thumb.box');
      const card = h('button.box-card', {
        title: 'Open in the simulator',
        onclick: () => { emit('sim:load', { cells, name: `4×4 pattern #${r.mask} (lives ${r.lifespan} generations)` }); emit('navigate', { route: 'sim' }); },
      }, c,
      h('b', {}, `${r.lifespan.toLocaleString()} gens`),
      h('span.small.dim', {}, `${r.cells} cells → ${r.finalPopulation}${r.escaped ? ' + gliders' : ''}`));
      requestAnimationFrame(() => drawThumb(c, cells, i === 0 ? '--shell' : '--slate', '--board', 4));
      return card;
    }));
  }

  const figures = {
    outcomes: h('div', {}, h('div.fig-controls', {}, runBtn, status), bar, legend),
    byCells,
    lifeChart,
    gallery,
  };

  return {
    figures,
    /** Start (from the cache when possible) the first time the section scrolls into view. */
    watch(el: HTMLElement) {
      if (typeof IntersectionObserver === 'undefined') { start(); return; }
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting) && !started) { io.disconnect(); start(); }
      }, { rootMargin: '200px' });
      io.observe(el);
    },
    redraw() { dirty = true; },
  };
}
