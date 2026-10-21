/**
 * Small, self-contained cellular automata used on the Applications page.
 * Each demo owns a grid, a step function and a colour function; the page
 * draws them with ImageData and animates only the ones on screen.
 */
import { h, slider } from './dom';
import { drawChart } from './chart';
import { isDark, onTheme, rgb } from './theme';

export interface Demo {
  el: HTMLElement;
  tick(): void; // called every animation frame while visible
  reset(): void;
}

export type RGB = [number, number, number];

// ---------------------------------------------------------------- Colour
// Demos paint with ImageData, so colours are read from the design tokens once
// and rebuilt when the colour mode changes. Three kinds of map:
//  - stones: a kaya board with slate stones, for two-state worlds;
//  - sequential: slate up through warm browns and the board to clamshell white,
//    for amounts (grains, speed, concentration), drawn on slate;
//  - categorical: the data colours, on the board by day and on slate by lamplight
//    (the data colours are tuned for a light ground in one mode, dark in the other).

export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A value built from tokens, rebuilt lazily after the colour mode changes. */
export function themed<T>(make: () => T): () => T {
  let v: { x: T } | null = null;
  onTheme(() => (v = null));
  return () => (v ??= { x: make() }).x;
}

/** A lookup table of n colours interpolated through the stops. */
export function lut(stops: RGB[], n = 256): RGB[] {
  const out: RGB[] = [];
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x));
    out.push(mix(stops[i], stops[i + 1], x - i));
  }
  return out;
}

/** Sequential stops, low to high: slate, warm browns, the board, clamshell. */
export function sequential(): RGB[] {
  const slate = rgb('--slate'), edge = rgb('--board-edge');
  return [slate, mix(slate, edge, 0.5), edge, rgb('--board'), rgb('--shell')];
}

/** Diverging stops: pine, the board, vermilion. */
export const diverging = (): RGB[] => [rgb('--data-pine'), rgb('--board'), rgb('--data-shu')];

/** Background for demos whose states are categorical data colours. */
export const catGround = (): RGB => rgb(isDark() ? '--slate' : '--board');

/** An RGB triple as a CSS colour for canvas strokes and fills. */
export const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/** Look up t in [0, 1] in a table. */
export const at = (table: RGB[], t: number): RGB => table[Math.max(0, Math.min(table.length - 1, Math.round(t * (table.length - 1))))];

export class PixelCanvas {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  constructor(public w: number, public hgt: number) {
    this.canvas = h('canvas.demo-canvas', { width: w, height: hgt });
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(w, hgt);
  }
  paint(color: (i: number) => RGB) {
    const d = this.img.data;
    for (let i = 0; i < this.w * this.hgt; i++) {
      const c = color(i);
      d[i * 4] = c[0];
      d[i * 4 + 1] = c[1];
      d[i * 4 + 2] = c[2];
      d[i * 4 + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

const rnd = Math.random;

function countMoore(g: Uint8Array, w: number, hh: number, x: number, y: number, v = 1, wrap = true): number {
  let n = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      let xx = x + dx, yy = y + dy;
      if (wrap) {
        xx = (xx + w) % w;
        yy = (yy + hh) % hh;
      } else if (xx < 0 || yy < 0 || xx >= w || yy >= hh) {
        n += v === 1 ? 1 : 0; // treat outside as rock for caves
        continue;
      }
      if (g[yy * w + xx] === v) n++;
    }
  return n;
}

// ---------------------------------------------------------------- Caves
export function caveDemo(): Demo {
  const W = 120, H = 80;
  const px = new PixelCanvas(W, H);
  let g = new Uint8Array(W * H);
  let fill = 0.45;
  let steps = 0;
  const label = h('span.readout');
  // Open floor is the board; rock is slate, with a little grain so it reads as stone.
  const pal = themed(() => {
    const slate = rgb('--slate'), edge = rgb('--board-edge');
    return { floor: rgb('--board'), rock: Array.from({ length: 16 }, (_, k) => mix(slate, edge, (k / 15) * 0.22)) };
  });
  const reset = () => {
    for (let i = 0; i < g.length; i++) g[i] = rnd() < fill ? 1 : 0;
    steps = 0;
    draw();
  };
  const step = () => {
    // B5678/S45678: a cell becomes rock if 5+ of its 8 neighbours are rock.
    const n = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const c = countMoore(g, W, H, x, y, 1, false);
        const i = y * W + x;
        n[i] = g[i] ? (c >= 4 ? 1 : 0) : c >= 5 ? 1 : 0;
      }
    g = n;
    steps++;
    draw();
  };
  const draw = () => {
    const p = pal();
    px.paint((i) => (g[i] ? p.rock[Math.imul(i, 2654435761) >>> 28] : p.floor));
    label.textContent = `smoothing passes: ${steps}`;
  };
  onTheme(draw);
  reset();
  for (let k = 0; k < 4; k++) step();
  const fillCtl = slider('Initial rock', 0.3, 0.6, 0.01, fill, (v) => { fill = v; reset(); }, (v) => `${Math.round(v * 100)}%`);
  const el = h('div', {}, px.canvas, h('div.fig-controls', {}, h('button', { onclick: reset }, 'New noise'), h('button', { onclick: step }, 'Smooth once'), h('button', { onclick: () => { for (let k = 0; k < 5; k++) step(); } }, 'Smooth ×5'), fillCtl.el, label));
  return { el, tick() {}, reset };
}

// ---------------------------------------------------------------- Forest fire
export function forestFireDemo(): Demo {
  const W = 150, H = 100;
  const px = new PixelCanvas(W, H);
  let g = new Uint8Array(W * H); // 0 empty, 1 tree, 2 fire
  let growth = 0.02, lightning = 0.00004;
  const hist: number[] = [];
  const chart = h('canvas.chart.small');
  // Trees are pine, fire is vermilion running towards ochre; a little variation per cell.
  const pal = themed(() => {
    const ground = catGround(), pine = rgb('--data-pine'), shu = rgb('--data-shu'), ochre = rgb('--data-ochre');
    return { ground, tree: Array.from({ length: 8 }, (_, k) => mix(pine, ground, k * 0.03)), fire: Array.from({ length: 8 }, (_, k) => mix(shu, ochre, k / 10)) };
  });
  const reset = () => { g = new Uint8Array(W * H); for (let i = 0; i < g.length; i++) g[i] = rnd() < 0.5 ? 1 : 0; hist.length = 0; };
  reset();
  let frame = 0;
  const tick = () => {
    const n = new Uint8Array(W * H);
    let trees = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const s = g[i];
        if (s === 2) n[i] = 0;
        else if (s === 1) {
          n[i] = countMoore(g, W, H, x, y, 2) > 0 || rnd() < lightning ? 2 : 1;
          trees++;
        } else n[i] = rnd() < growth ? 1 : 0;
      }
    g = n;
    hist.push(trees / (W * H));
    if (hist.length > 400) hist.shift();
    const p = pal();
    px.paint((i) => (g[i] === 2 ? p.fire[(i * 7) & 7] : g[i] === 1 ? p.tree[(i * 13) & 7] : p.ground));
    if (++frame % 6 === 0) drawChart(chart, [{ values: hist, color: '--data-pine', fill: true, label: 'forest density' }], { yMin: 0, yMax: 0.7, legend: true });
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    slider('Tree growth p', 0.001, 0.08, 0.001, growth, (v) => (growth = v), (v) => v.toFixed(3)).el,
    slider('Lightning f', 0, 0.0005, 0.00001, lightning, (v) => (lightning = v), (v) => v.toExponential(1)).el,
    h('button', { onclick: reset }, 'Reset')));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Epidemic (SIRS)
export function epidemicDemo(): Demo {
  const W = 150, H = 100;
  const px = new PixelCanvas(W, H);
  // 0 susceptible, 1..I infected (counts up), then recovered for R steps.
  const I = 4, R = 9;
  let g = new Uint8Array(W * H);
  let beta = 0.3;
  const sH: number[] = [], iH: number[] = [], rH: number[] = [];
  const chart = h('canvas.chart.small');
  // Susceptible is the bare ground, infected is vermilion (darkening with each day of
  // illness), recovered is indigo fading back to the ground as immunity wanes.
  const pal = themed(() => {
    const ground = catGround(), shu = rgb('--data-shu'), indigo = rgb('--data-indigo'), ochre = rgb('--data-ochre');
    const c: RGB[] = [ground];
    for (let s = 1; s <= I; s++) c.push(mix(shu, ochre, ((s - 1) / I) * 0.5));
    for (let s = I + 1; s <= I + R; s++) c.push(mix(indigo, ground, ((s - I) / R) * 0.75));
    return c;
  });
  const reset = () => {
    g = new Uint8Array(W * H);
    for (let k = 0; k < 6; k++) g[Math.floor(rnd() * g.length)] = 1;
    sH.length = iH.length = rH.length = 0;
  };
  reset();
  let frame = 0;
  const tick = () => {
    const n = new Uint8Array(W * H);
    let S = 0, In = 0, Rc = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const s = g[i];
        if (s === 0) {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const v = g[((y + dy + H) % H) * W + ((x + dx + W) % W)];
              if (v >= 1 && v <= I) k++;
            }
          n[i] = rnd() < 1 - Math.pow(1 - beta, k) ? 1 : 0;
          if (rnd() < 0.000005) n[i] = 1;
        } else n[i] = s >= I + R ? 0 : s + 1;
        if (n[i] === 0) S++;
        else if (n[i] <= I) In++;
        else Rc++;
      }
    g = n;
    const T = W * H;
    sH.push(S / T); iH.push(In / T); rH.push(Rc / T);
    if (sH.length > 400) { sH.shift(); iH.shift(); rH.shift(); }
    if (In === 0) reset();
    const p = pal();
    px.paint((i) => p[Math.min(I + R, g[i])]);
    if (++frame % 6 === 0)
      drawChart(chart, [
        { values: sH, color: '--ink', label: 'susceptible' },
        { values: iH, color: '--data-shu', label: 'infected' },
        { values: rH, color: '--data-indigo', label: 'recovered' },
      ], { yMin: 0, yMax: 1, legend: true });
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    slider('Transmission β', 0.05, 0.9, 0.01, beta, (v) => (beta = v), (v) => v.toFixed(2)).el,
    h('button', { onclick: reset }, 'Reseed')));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Rule 30 PRNG
export function rule30Demo(): Demo {
  const W = 201, H = 110;
  const px = new PixelCanvas(W, H);
  const rows: Uint8Array[] = [];
  let row = new Uint8Array(W);
  const bitsEl = h('code.bits');
  let bits: number[] = [];
  let ones = 0, total = 0;
  const reset = () => {
    row = new Uint8Array(W);
    row[Math.floor(W / 2)] = 1;
    rows.length = 0;
    bits = [];
    ones = total = 0;
  };
  reset();
  const statsEl = h('span.readout');
  // Slate stones on the board; the centre column, the one read as random bits, in vermilion.
  const pal = themed(() => {
    const board = rgb('--board'), shu = rgb('--data-shu');
    return { board, stone: rgb('--slate'), bit: shu, noBit: mix(board, shu, 0.22) };
  });
  let frame = 0;
  const tick = () => {
    if (frame++ % 2) return;
    const n = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const l = row[(x - 1 + W) % W], c = row[x], r = row[(x + 1) % W];
      n[x] = (30 >> ((l << 2) | (c << 1) | r)) & 1; // Wolfram code 30
    }
    row = n;
    rows.push(row);
    if (rows.length > H) rows.shift();
    const b = row[Math.floor(W / 2)];
    bits.push(b);
    if (bits.length > 64) bits.shift();
    ones += b;
    total++;
    const p = pal();
    px.paint((i) => {
      const y = Math.floor(i / W), x = i % W;
      const r = rows[y];
      if (!r) return p.board;
      if (x === Math.floor(W / 2)) return r[x] ? p.bit : p.noBit;
      return r[x] ? p.stone : p.board;
    });
    bitsEl.textContent = bits.join('');
    statsEl.textContent = `${total} bits · ${((ones / Math.max(1, total)) * 100).toFixed(1)}% ones`;
  };
  const el = h('div', {}, px.canvas, h('div.fig-controls', {}, h('span', {}, 'Centre column:'), bitsEl), h('div.fig-controls', {}, statsEl, h('button', { onclick: reset }, 'Restart')));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Traffic (Rule 184)
export function trafficDemo(): Demo {
  const W = 200, H = 100;
  const px = new PixelCanvas(W, H);
  let density = 0.35;
  const rows: Uint8Array[] = [];
  let row = new Uint8Array(W);
  const chart = h('canvas.chart.small');
  const reset = () => {
    row = new Uint8Array(W);
    for (let i = 0; i < W; i++) row[i] = rnd() < density ? 1 : 0;
    rows.length = 0;
  };
  reset();
  // Fundamental diagram: flow (cars moved per cell per step) vs density.
  const fd = () => {
    const ds: number[] = [], fl: number[] = [];
    for (let k = 1; k < 40; k++) {
      const d = k / 40;
      let r = new Uint8Array(400);
      for (let i = 0; i < 400; i++) r[i] = rnd() < d ? 1 : 0;
      let moved = 0;
      for (let t = 0; t < 400; t++) {
        const n = new Uint8Array(400);
        for (let x = 0; x < 400; x++) {
          const l = r[(x + 399) % 400], c = r[x], rr = r[(x + 1) % 400];
          n[x] = (184 >> ((l << 2) | (c << 1) | rr)) & 1;
          if (t >= 200 && c && !rr) moved++;
        }
        r = n;
      }
      ds.push(d);
      fl.push(moved / (200 * 400));
    }
    drawFd = () => drawChart(chart, [
      { values: fl, xs: ds, color: '--ink', label: 'measured flow', dots: true, width: 1 },
      { values: ds.map((d) => Math.min(d, 1 - d)), xs: ds, color: '--data-shu', label: 'theory min(ρ, 1−ρ)', dash: [4, 3], width: 1.5 },
    ], { xMin: 0, xMax: 1, yMin: 0, yMax: 0.55, legend: true, xLabel: 'density ρ' });
    drawFd();
  };
  let drawFd = () => {};
  onTheme(() => drawFd());
  const pal = themed(() => ({ road: catGround(), go: rgb('--data-pine'), stuck: rgb('--data-shu') }));
  let frame = 0;
  let fdDone = false;
  const tick = () => {
    if (!fdDone) { fdDone = true; fd(); }
    if (frame++ % 2) return;
    const n = new Uint8Array(W);
    for (let x = 0; x < W; x++) {
      const l = row[(x - 1 + W) % W], c = row[x], r = row[(x + 1) % W];
      n[x] = (184 >> ((l << 2) | (c << 1) | r)) & 1;
    }
    rows.push(row);
    if (rows.length > H) rows.shift();
    row = n;
    const p = pal();
    px.paint((i) => {
      const y = Math.floor(i / W), x = i % W;
      const r = rows[y];
      if (!r || !r[x]) return p.road;
      // Green cars move next step (free road ahead); red cars are stuck in a jam.
      return r[(x + 1) % W] === 0 ? p.go : p.stuck;
    });
  };
  const el = h('div', {}, px.canvas, h('div.fig-controls', {},
    slider('Car density ρ', 0.05, 0.95, 0.01, density, (v) => { density = v; reset(); }, (v) => v.toFixed(2)).el,
    h('button', { onclick: reset }, 'New traffic')), chart);
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Denoising
export function denoiseDemo(): Demo {
  const W = 160, H = 80;
  const px = new PixelCanvas(W, H);
  let clean = new Uint8Array(W * H);
  let g = new Uint8Array(W * H);
  let noise = 0.2;
  const errEl = h('span.readout');
  const stones = themed(() => ({ board: rgb('--board'), stone: rgb('--slate') }));
  const makeClean = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LIFE', W / 2, H / 2 + 3);
    const d = ctx.getImageData(0, 0, W, H).data;
    for (let i = 0; i < W * H; i++) clean[i] = d[i * 4] > 127 ? 1 : 0;
  };
  const reset = () => {
    if (!clean.some((v) => v)) makeClean();
    for (let i = 0; i < g.length; i++) g[i] = rnd() < noise ? 1 - clean[i] : clean[i];
    draw();
  };
  const step = () => {
    // Anneal / majority vote: B4678/S35678 (alive next iff 5+ of the 9 cells, with a twist at 4/5).
    const n = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const k = countMoore(g, W, H, x, y, 1);
        n[i] = g[i] ? ([3, 5, 6, 7, 8].includes(k) ? 1 : 0) : [4, 6, 7, 8].includes(k) ? 1 : 0;
      }
    g = n;
    draw();
  };
  const draw = () => {
    let err = 0;
    for (let i = 0; i < g.length; i++) err += g[i] ^ clean[i];
    errEl.textContent = `wrong pixels: ${err} (${((100 * err) / g.length).toFixed(1)}%)`;
    const p = stones();
    px.paint((i) => (g[i] ? p.stone : p.board));
  };
  onTheme(draw);
  makeClean();
  reset();
  const el = h('div', {}, px.canvas, h('div.fig-controls', {},
    slider('Noise', 0, 0.4, 0.01, noise, (v) => { noise = v; reset(); }, (v) => `${Math.round(v * 100)}%`).el,
    h('button', { onclick: step }, 'Denoise step'),
    h('button', { onclick: reset }, 'Add noise'),
    errEl));
  return { el, tick() {}, reset };
}

// ---------------------------------------------------------------- Morphogenesis (Young 1984)
export function morphogenesisDemo(): Demo {
  const W = 140, H = 90;
  const px = new PixelCanvas(W, H);
  let g = new Uint8Array(W * H);
  let inhibit = 0.2;
  const R1 = 2.3, R2 = 6.0;
  let offsets: { dx: number; dy: number; w: number }[] = [];
  const buildKernel = () => {
    offsets = [];
    const r = Math.ceil(R2);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= R1) offsets.push({ dx, dy, w: 1 });
        else if (d <= R2) offsets.push({ dx, dy, w: -inhibit });
      }
  };
  const reset = () => {
    for (let i = 0; i < g.length; i++) g[i] = rnd() < 0.5 ? 1 : 0;
  };
  buildKernel();
  reset();
  let frame = 0;
  let settled = 0;
  // Pigment cells are slate on the board.
  const stones = themed(() => ({ board: rgb('--board'), stone: rgb('--slate') }));
  const draw = () => {
    const p = stones();
    px.paint((i) => (g[i] ? p.stone : p.board));
  };
  onTheme(draw);
  const tick = () => {
    if (frame++ % 4 || settled > 6) return;
    const n = new Uint8Array(W * H);
    let changes = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (const o of offsets) if (g[((y + o.dy + H) % H) * W + ((x + o.dx + W) % W)]) s += o.w;
        const i = y * W + x;
        n[i] = s > 0 ? 1 : s < 0 ? 0 : g[i];
        if (n[i] !== g[i]) changes++;
      }
    g = n;
    settled = changes ? 0 : settled + 1;
    draw();
  };
  const el = h('div', {}, px.canvas, h('div.fig-controls', {},
    slider('Inhibitor strength', 0.05, 0.6, 0.01, inhibit, (v) => { inhibit = v; buildKernel(); reset(); settled = 0; }, (v) => v.toFixed(2)).el,
    h('button', { onclick: () => { reset(); settled = 0; } }, 'Reseed')));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Wireworld
// Verified by simulation: the top lane passes a diode, the middle lane is
// blocked by a reversed diode, the bottom lane fans out into two wires.
const WIREWORLD_MAP = [
  "",
  "  ######                     ##",
  " #      ###################### ################################",
  "  tH####                     ##",
  "",
  "",
  "",
  "  ######                      ##",
  " #      ###################### ################################",
  "  tH####                      ##",
  "",
  "                           ####################################",
  "                          #",
  "                         #",
  "  ######                #",
  " #      ################",
  "  tH####                #",
  "                         #",
  "                          #",
  "                           ####################################",
  "",
  "",
  "",
];

export function wireworldDemo(): Demo {
  const W = 72, H = WIREWORLD_MAP.length;
  const px = new PixelCanvas(W, H);
  // 0 empty, 1 electron head, 2 electron tail, 3 conductor
  let g = new Uint8Array(W * H);
  const reset = () => {
    g = new Uint8Array(W * H);
    WIREWORLD_MAP.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) g[y * W + x] = row[x] === '#' ? 3 : row[x] === 'H' ? 1 : row[x] === 't' ? 2 : 0;
    });
  };
  reset();
  // Classic Wireworld colours, in the data palette: blue heads, red tails, copper wire.
  const pal = themed((): RGB[] => [catGround(), rgb('--data-indigo'), rgb('--data-shu'), rgb('--data-ochre')]);
  let frame = 0;
  const tick = () => {
    if (frame++ % 5) return;
    const n = new Uint8Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const s = g[i];
        if (s === 1) n[i] = 2;
        else if (s === 2) n[i] = 3;
        else if (s === 3) {
          let k = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx, yy = y + dy;
              if ((dx || dy) && xx >= 0 && yy >= 0 && xx < W && yy < H && g[yy * W + xx] === 1) k++;
            }
          n[i] = k === 1 || k === 2 ? 1 : 3;
        }
      }
    g = n;
    const p = pal();
    px.paint((i) => p[g[i]]);
  };
  const legend = h('div.fig-controls', {},
    h('span.readout', {}, 'blue = electron head · red = tail · ochre = copper wire'),
    h('button', { onclick: reset }, 'Reset'));
  const labels = h('p.blurb', {}, 'Top: a diode lets electrons through. Middle: the same diode reversed blocks them. Bottom: one wire fans out into two. Each loop on the left is a clock.');
  return { el: h('div', {}, px.canvas, labels, legend), tick, reset };
}

// ---------------------------------------------------------------- Langton's ant
export function langtonDemo(): Demo {
  const W = 160, H = 110;
  const px = new PixelCanvas(W, H);
  let g = new Uint8Array(W * H);
  let ax = 0, ay = 0, dir = 0, steps = 0;
  let speed = 60;
  const stepsEl = h('span.readout');
  // The ant walks on the board; black squares are slate stones, the ant itself vermilion.
  const pal = themed(() => ({ board: rgb('--board'), stone: rgb('--slate'), ant: rgb('--data-shu') }));
  const reset = () => {
    g = new Uint8Array(W * H);
    ax = Math.floor(W / 2) + 20;
    ay = Math.floor(H / 2) + 12;
    dir = 0;
    steps = 0;
  };
  reset();
  const tick = () => {
    for (let k = 0; k < speed; k++) {
      const i = ay * W + ax;
      // White square: turn right; black square: turn left; flip colour; step forward.
      dir = (dir + (g[i] ? 3 : 1)) % 4;
      g[i] ^= 1;
      ax = (ax + [0, 1, 0, -1][dir] + W) % W;
      ay = (ay + [-1, 0, 1, 0][dir] + H) % H;
      steps++;
    }
    const ai = ay * W + ax;
    const p = pal();
    px.paint((i) => (i === ai ? p.ant : g[i] ? p.stone : p.board));
    stepsEl.textContent = `${steps.toLocaleString('en-US')} steps${steps > 10500 ? ' · highway!' : steps > 500 ? ' · chaotic phase' : ''}`;
  };
  const el = h('div', {}, px.canvas, h('div.fig-controls', {},
    slider('Steps per frame', 1, 400, 1, speed, (v) => (speed = v)).el,
    h('button', { onclick: reset }, 'Restart'), stepsEl));
  return { el, tick, reset };
}
