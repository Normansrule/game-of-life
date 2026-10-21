/**
 * Math §19: how many pasts does each present have? Every 5×5 pattern
 * (2^25 of them) is stepped once and its middle 3×3 tallied. Runs between
 * frames in chunks so the page stays responsive.
 */
import { preimageCounts3x3 } from '../engine/predecessors';
import { drawChart } from './chart';
import { h } from './dom';
import { onTheme, tok } from './theme';
import { CellPainter } from './thumb';

const TOTAL = 1 << 25;
const CHUNK = 1 << 20;

function drawWindow(canvas: HTMLCanvasElement, m: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const S = canvas.clientWidth || 54;
  canvas.width = canvas.height = Math.round(S * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = S / 3;
  ctx.fillStyle = tok('--board');
  ctx.fillRect(0, 0, S, S);
  const p = new CellPainter(c);
  for (let i = 0; i < 9; i++) if ((m >> i) & 1) p.add((i % 3) * c, Math.floor(i / 3) * c);
  p.fill(ctx, '--slate');
}

export function createPastFigure() {
  const chart = h('canvas.chart.tall');
  const status = h('span.mono', {}, 'Waiting to start…');
  const extremes = h('div.past-extremes');
  const stats = h('div.past-stats');
  let started = false;
  let result: Float64Array | null = null;
  onTheme(() => result && draw(result));

  function start() {
    started = true;
    const counts = new Float64Array(512);
    let at = 0;
    const t0 = performance.now();
    const step = () => {
      preimageCounts3x3('B3/S23', at, at + CHUNK, counts);
      at += CHUNK;
      status.textContent = at < TOTAL ? `Stepping 5×5 patterns: ${((at / TOTAL) * 100).toFixed(0)}%` : `All ${TOTAL.toLocaleString()} 5×5 patterns stepped in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
      if (at < TOTAL) setTimeout(step, 0);
      else draw(counts);
    };
    step();
  }

  function draw(counts: Float64Array) {
    result = counts;
    const order = [...counts.keys()].sort((a, b) => counts[b] - counts[a]);
    drawChart(chart, [{ values: order.map((i) => counts[i]), color: '--ink', width: 2, fill: true, label: 'number of 5×5 pasts (log scale)' }],
      { logY: true, legend: true, xLabel: 'the 512 possible 3×3 presents, most pasts first' });
    const card = (m: number) => {
      const c = h('canvas.past-win');
      requestAnimationFrame(() => drawWindow(c, m));
      return h('div.past-card', {}, c, h('b.mono', {}, counts[m].toLocaleString()), h('span.small.dim', {}, `${((counts[m] / TOTAL) * 100).toFixed(m === 0 ? 1 : 3)}%`));
    };
    extremes.replaceChildren(
      h('div', {}, h('h4', {}, 'Most pasts'), h('div.past-row', {}, ...order.slice(0, 4).map(card))),
      h('div', {}, h('h4', {}, 'Fewest pasts'), h('div.past-row', {}, ...order.slice(-4).reverse().map(card))));
    let H = 0;
    for (const v of counts) if (v) { const p = v / TOTAL; H -= p * Math.log2(p); }
    const zero = order.filter((i) => counts[i] === 0).length;
    stats.innerHTML = `Entropy of the 3×3 present: <b>${H.toFixed(2)} bits</b> out of a possible 9. ` +
      `Ratio of most to fewest pasts: <b>${Math.round(counts[order[0]] / counts[order[511]]).toLocaleString()} : 1</b>. ` +
      `3×3 presents with no 5×5 past: <b>${zero}</b>.`;
  }

  return {
    el: h('div', {}, h('div.fig-controls', {}, status), chart, stats, extremes),
    watch(el: HTMLElement) {
      if (typeof IntersectionObserver === 'undefined') { start(); return; }
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting) && !started) { io.disconnect(); start(); }
      }, { rootMargin: '200px' });
      io.observe(el);
    },
  };
}
