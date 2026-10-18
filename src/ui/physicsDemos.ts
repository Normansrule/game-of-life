/**
 * Application demos added in v3: the Abelian sandpile, an FHP lattice-gas
 * wind tunnel, Wa-Tor predator–prey dynamics, an excitable-medium model of
 * heart tissue and Reiter's snowflakes. The models themselves live in
 * src/engine/models and are unit tested; this file only draws them.
 */
import { h, select, slider } from './dom';
import { drawChart } from './chart';
import { type Demo, PixelCanvas, type RGB } from './demos';
import { Sandpile, linearFit, logBins } from '../engine/models/sandpile';
import { FHP } from '../engine/models/fhp';
import { FISH, SHARK, Wator } from '../engine/models/wator';
import { Excitable } from '../engine/models/excitable';
import { Reiter } from '../engine/models/reiter';

// ---------------------------------------------------------------- Sandpile
export function sandpileDemo(): Demo {
  const W = 128, H = 128;
  const px = new PixelCanvas(W, H);
  let pile = new Sandpile(W, H);
  let mode: 'random' | 'centre' = 'random';
  let rate = 3;
  const sizes: number[] = [];
  const flash = new Float32Array(W * H);
  const chart = h('canvas.chart.small');
  const label = h('span.mono');
  const PAL: RGB[] = [[12, 14, 30], [40, 70, 160], [80, 190, 230], [250, 240, 200]];
  const reset = () => {
    pile = new Sandpile(W, H);
    if (mode === 'random') {
      // Start from the maximal stable pile and let it relax into the critical state.
      pile.h.fill(3);
      for (let k = 0; k < 3000; k++) pile.add(Math.floor(Math.random() * W), Math.floor(Math.random() * H));
    }
    sizes.length = 0;
    flash.fill(0);
  };
  reset();
  let frame = 0;
  let dropped = 0;
  const tick = () => {
    const ep0 = pile.epoch;
    for (let k = 0; k < rate; k++) {
      const x = mode === 'centre' ? W >> 1 : Math.floor(Math.random() * W);
      const y = mode === 'centre' ? H >> 1 : Math.floor(Math.random() * H);
      const a = pile.add(x, y, mode === 'centre' ? 4 : 1);
      dropped += mode === 'centre' ? 4 : 1;
      if (a.size > 0 && mode === 'random') {
        sizes.push(a.size);
        if (sizes.length > 60000) sizes.splice(0, 10000);
      }
    }
    for (let i = 0; i < flash.length; i++) flash[i] = pile.stamp[i] > ep0 ? 0.4 : flash[i] * 0.75;
    px.paint((i) => {
      const c = PAL[Math.min(3, pile.h[i])];
      const f = flash[i];
      return [c[0] + (255 - c[0]) * f * 0.8, c[1] + (90 - c[1]) * f * 0.8, c[2] + (60 - c[2]) * f * 0.8];
    });
    if (++frame % 20 === 0) {
      if (mode === 'random' && sizes.length > 200) {
        const { x, y } = logBins(sizes, 6);
        const lx = x.map(Math.log10), ly = y.map(Math.log10);
        // Fit the straight middle part, skipping the smallest sizes and the finite-size cut-off.
        const keep = lx.map((_, i) => i).filter((i) => lx[i] > 0.4 && lx[i] < Math.log10(W * W) - 0.6);
        const fit = linearFit(keep.map((i) => lx[i]), keep.map((i) => ly[i]));
        drawChart(chart, [
          { values: ly, xs: lx, color: '#7df9ff', dots: true, width: 0, label: 'avalanches' },
          { values: [fit.intercept + fit.slope * lx[0], fit.intercept + fit.slope * lx[lx.length - 1]], xs: [lx[0], lx[lx.length - 1]], color: '#ffb020', width: 1.5, dash: [4, 3], label: `slope ${fit.slope.toFixed(2)}` },
        ], { xLabel: 'log₁₀ size', yLabel: 'log₁₀ P', legend: true });
        label.textContent = `${sizes.length.toLocaleString()} avalanches · biggest ${Math.max(...sizes.slice(-5000)).toLocaleString()} topplings`;
      } else label.textContent = `${dropped.toLocaleString()} grains dropped at the centre`;
    }
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    h('label', {}, 'Drop ', select([{ value: 'random', label: 'at random (criticality)' }, { value: 'centre', label: 'at the centre (fractal)' }], mode, (v) => { mode = v; dropped = 0; reset(); })),
    slider('Grains per frame', 1, 400, 1, rate, (v) => (rate = v)).el,
    h('button', { onclick: () => { dropped = 0; reset(); } }, 'Reset'),
    label));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Lattice gas
type Shape = 'plate' | 'cylinder' | 'wing';
export function fluidDemo(): Demo {
  const LW = 480, LH = 200, B = 8;
  const BW = LW / B, BH = LH / B;
  const SY = Math.sqrt(3) / 2; // hex rows are √3/2 apart
  const CW = 600, CH = Math.round((CW * LH * SY) / LW);
  const canvas = h('canvas.demo-canvas.smooth', { width: CW, height: CH });
  const ctx = canvas.getContext('2d')!;
  const field = document.createElement('canvas');
  field.width = BW;
  field.height = BH;
  const fctx = field.getContext('2d')!;
  const fimg = fctx.createImageData(BW, BH);
  const solidCanvas = document.createElement('canvas');
  solidCanvas.width = LW;
  solidCanvas.height = LH;
  let gas: FHP;
  let shape: Shape = 'cylinder';
  let colour: 'speed' | 'vorticity' = 'speed';
  let force = 0.002;
  const ux = new Float32Array(BW * BH), uy = new Float32Array(BW * BH), rho = new Float32Array(BW * BH);
  const ax = new Float32Array(BW * BH), ay = new Float32Array(BW * BH);
  const label = h('span.mono');

  const build = () => {
    gas = new FHP(LW, LH);
    gas.force = force;
    const cx = LW * 0.22, cy = LH / 2;
    for (let y = 0; y < LH; y++)
      for (let x = 0; x < LW; x++) {
        const px = x + (y & 1) * 0.5, py = y * SY;
        const dx = px - cx, dy = py - cy * SY;
        let s = y < 2 || y >= LH - 2;
        if (shape === 'cylinder') s ||= dx * dx + dy * dy < (LH * SY * 0.13) ** 2;
        else if (shape === 'plate') s ||= Math.abs(dx) < 2 && Math.abs(dy) < LH * SY * 0.2;
        else {
          // A thin aerofoil tilted 15° (angle of attack), nose to the left.
          const a = (15 * Math.PI) / 180;
          const u = dx * Math.cos(a) - dy * Math.sin(a), v = dx * Math.sin(a) + dy * Math.cos(a);
          const t = (u + 40) / 80; // 0 at the nose, 1 at the tail
          const half = t >= 0 && t <= 1 ? 9 * Math.sqrt(t) * (1 - t) : -1;
          s ||= Math.abs(v + 3 * Math.sin(Math.PI * t)) < half;
        }
        gas.solid[y * LW + x] = s ? 1 : 0;
      }
    gas.fill(0.3, 0.45); // start near the steady flow speed
    ax.fill(0);
    ay.fill(0);
    const sctx = solidCanvas.getContext('2d')!;
    const simg = sctx.createImageData(LW, LH);
    for (let i = 0; i < LW * LH; i++) {
      const s = gas.solid[i];
      simg.data[i * 4] = 140; simg.data[i * 4 + 1] = 150; simg.data[i * 4 + 2] = 170; simg.data[i * 4 + 3] = s ? 255 : 0;
    }
    sctx.putImageData(simg, 0, 0);
  };
  build();

  let frame = 0;
  const tick = () => {
    gas.force = force;
    gas.step();
    gas.step();
    gas.velocity(B, ux, uy, rho);
    for (let k = 0; k < ax.length; k++) {
      ax[k] += 0.08 * (ux[k] - ax[k]);
      ay[k] += 0.08 * (uy[k] - ay[k]);
    }
    // Colour field
    let mean = 0;
    for (let k = 0; k < ax.length; k++) mean += ax[k];
    mean /= ax.length;
    const d = fimg.data;
    for (let by = 0; by < BH; by++)
      for (let bx = 0; bx < BW; bx++) {
        const k = by * BW + bx;
        let r = 0, g = 0, b = 0;
        if (colour === 'speed') {
          const sp = Math.min(1, Math.hypot(ax[k], ay[k]) / (2.2 * Math.max(0.02, mean)));
          r = 20 + 235 * sp * sp; g = 30 + 200 * sp; b = 90 + 120 * (1 - sp);
        } else {
          const kx1 = by * BW + Math.min(BW - 1, bx + 1), kx0 = by * BW + Math.max(0, bx - 1);
          const ky1 = Math.min(BH - 1, by + 1) * BW + bx, ky0 = Math.max(0, by - 1) * BW + bx;
          const w = (ay[kx1] - ay[kx0]) / 2 - (ax[ky1] - ax[ky0]) / (2 * SY);
          const t = Math.max(-1, Math.min(1, w / (0.5 * Math.max(0.02, mean))));
          r = t > 0 ? 30 + 225 * t : 30; g = 30 + 40 * (1 - Math.abs(t)); b = t < 0 ? 30 - 225 * t : 30;
        }
        d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
      }
    fctx.putImageData(fimg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field, 0, 0, CW, CH);
    ctx.drawImage(solidCanvas, 0, 0, CW, CH);
    // Velocity arrows
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const sx = CW / BW, sy = CH / BH;
    const scale = (0.45 * sx) / Math.max(0.02, mean);
    for (let by = 1; by < BH - 1; by += 2)
      for (let bx = 1; bx < BW; bx += 2) {
        const k = by * BW + bx;
        const x0 = (bx + 0.5) * sx, y0 = (by + 0.5) * sy;
        const vx = ax[k] * scale, vy = ay[k] * scale;
        if (Math.hypot(vx, vy) < 1) continue;
        const x1 = x0 + vx, y1 = y0 + vy;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        const a = Math.atan2(vy, vx);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - 4 * Math.cos(a - 0.5), y1 - 4 * Math.sin(a - 0.5));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - 4 * Math.cos(a + 0.5), y1 - 4 * Math.sin(a + 0.5));
      }
    ctx.stroke();
    if (++frame % 15 === 0) label.textContent = `step ${gas.generation.toLocaleString()} · ${(LW * LH).toLocaleString()} cells · mean flow ${mean.toFixed(3)}`;
  };
  const el = h('div', {}, canvas, h('div.fig-controls', {},
    h('label', {}, 'Obstacle ', select<Shape>([{ value: 'cylinder', label: 'Cylinder' }, { value: 'plate', label: 'Flat plate' }, { value: 'wing', label: 'Wing (15°)' }], shape, (v) => { shape = v; build(); })),
    h('label', {}, 'Colour ', select([{ value: 'speed', label: 'Speed' }, { value: 'vorticity', label: 'Vorticity (spin)' }], colour, (v) => (colour = v))),
    slider('Driving force', 0.0005, 0.01, 0.0005, force, (v) => (force = v), (v) => v.toFixed(4)).el,
    h('button', { onclick: build }, 'Restart'),
    label));
  return { el, tick, reset: build };
}

// ---------------------------------------------------------------- Predator–prey
export function predatorPreyDemo(): Demo {
  const W = 160, H = 100;
  const px = new PixelCanvas(W, H);
  const params = { fishBreed: 3, sharkBreed: 8, sharkStarve: 3 };
  let sea = new Wator(W, H, params);
  const fH: number[] = [], sH: number[] = [];
  const chart = h('canvas.chart.small');
  const phase = h('canvas.chart.small');
  const label = h('span.mono');
  const reset = () => {
    sea = new Wator(W, H, params);
    sea.seed(0.3, 0.03);
    fH.length = sH.length = 0;
  };
  reset();
  let frame = 0, steps = 0;
  const tick = () => {
    if (frame++ % 2) return; // 30 steps per second is plenty
    steps++;
    sea.step();
    if (sea.sharks === 0 || sea.fish === 0) {
      label.textContent = sea.sharks === 0 ? 'Sharks went extinct: reseeding' : 'Fish went extinct: reseeding';
      reset();
      return;
    }
    const T = W * H;
    fH.push(sea.fish / T);
    sH.push(sea.sharks / T);
    if (fH.length > 600) { fH.shift(); sH.shift(); }
    px.paint((i) => {
      const k = sea.kind[i];
      if (k === FISH) return [40, 200, 150];
      if (k === SHARK) return [255, 120, 40];
      return [8, 20, 48];
    });
    if (steps % 6 === 0) {
      drawChart(chart, [
        { values: fH, color: '#38e8a8', label: 'fish' },
        { values: sH, color: '#ff8a3d', label: 'sharks' },
      ], { yMin: 0, legend: true, xLabel: 'time' });
      drawChart(phase, [{ values: sH, xs: fH, color: '#c084fc', width: 1.2, label: 'trajectory' }], { xLabel: 'fish', yLabel: 'sharks', legend: false, yMin: 0, xMin: 0 });
      label.textContent = `fish ${sea.fish.toLocaleString()} · sharks ${sea.sharks.toLocaleString()}`;
    }
  };
  const el = h('div', {}, px.canvas, h('div.chart-pair', {}, chart, phase), h('div.fig-controls', {},
    slider('Fish breed age', 1, 10, 1, params.fishBreed, (v) => (params.fishBreed = v)).el,
    slider('Shark breed age', 2, 20, 1, params.sharkBreed, (v) => (params.sharkBreed = v)).el,
    slider('Shark starve time', 1, 10, 1, params.sharkStarve, (v) => (params.sharkStarve = v)).el,
    h('button', { onclick: reset }, 'Reseed'),
    label));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Heart tissue
export function heartDemo(): Demo {
  const W = 160, H = 110;
  const px = new PixelCanvas(W, H);
  let tissue = new Excitable(W, H, 9, 2, 2);
  let pacemaker = true;
  const period = 70;
  let t = 0;
  const ecg: number[] = [];
  const chart = h('canvas.chart.small');
  const status = h('span.mono');
  const pal: RGB[] = [];
  for (let s = 0; s < 9; s++) {
    if (s === 0) pal.push([40, 10, 22]);
    else if (s === 1) pal.push([255, 245, 200]);
    else {
      const f = (s - 2) / 6;
      pal.push([230 - 170 * f, 70 - 50 * f, 60 - 30 * f]);
    }
  }
  const normal = () => {
    tissue = new Excitable(W, H, 9, 2, 2);
    pacemaker = true;
    pmToggle.checked = true;
    t = 0;
    status.textContent = 'Normal rhythm: the sinus node fires a wave from the left wall';
  };
  const arrhythmia = () => {
    tissue = new Excitable(W, H, 9, 2, 2);
    tissue.stimulateColumn(0);
    for (let k = 0; k < 30; k++) tissue.step();
    tissue.clear(0, H >> 1, W, H); // a premature beat blocks the lower half of the wave
    t = 1;
    status.textContent = 'Re-entry: the broken wave curls into a spiral that outpaces the pacemaker';
  };
  const defib = () => {
    tissue.shock();
    status.textContent = 'Shock delivered: every cell fires at once, then all recover together';
  };
  const pmToggle = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  pmToggle.addEventListener('change', () => (pacemaker = pmToggle.checked));
  px.canvas.addEventListener('pointerdown', (e) => {
    const r = px.canvas.getBoundingClientRect();
    tissue.stimulate(Math.floor(((e.clientX - r.left) / r.width) * W), Math.floor(((e.clientY - r.top) / r.height) * H), 3);
  });
  normal();
  let frame = 0;
  const tick = () => {
    if (frame++ % 2) return;
    if (pacemaker && t % period === 0) for (let y = H * 0.3; y < H * 0.7; y++) tissue.stimulate(0, Math.floor(y), 1);
    t++;
    tissue.step();
    ecg.push(tissue.excited / (W * H));
    if (ecg.length > 400) ecg.shift();
    px.paint((i) => pal[tissue.s[i]]);
    if (t % 4 === 0) drawChart(chart, [{ values: ecg, color: '#ff4f6d', label: 'cells firing (a crude ECG)', width: 1.5 }], { yMin: 0, legend: true });
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    h('button', { onclick: normal }, 'Normal rhythm'),
    h('button', { onclick: arrhythmia }, 'Trigger an arrhythmia'),
    h('button.primary', { onclick: defib }, 'Defibrillate'),
    h('label.toggle', {}, pmToggle, h('span.switch'), h('span', {}, 'Pacemaker')),
    status), h('p.demo-hint', {}, 'Click the tissue to fire an extra beat.'));
  return { el, tick, reset: normal };
}

// ---------------------------------------------------------------- Snowflakes
const SNOW_PRESETS: { id: string; label: string; beta: number; gamma: number }[] = [
  { id: 'stellar', label: 'Stellar dendrite', beta: 0.4, gamma: 0.001 },
  { id: 'fern', label: 'Fernlike star', beta: 0.35, gamma: 0.001 },
  { id: 'needle', label: 'Broad branches', beta: 0.8, gamma: 0.002 },
  { id: 'sectored', label: 'Feathered star', beta: 0.65, gamma: 0.001 },
  { id: 'lace', label: 'Lacy plate', beta: 0.95, gamma: 0 },
];
export function snowflakeDemo(): Demo {
  const N = 90, S = 2;
  const CW = (2 * N + 3) * S, CH = Math.ceil((2 * N + 3) * S * (Math.sqrt(3) / 2));
  const canvas = h('canvas.demo-canvas.square', { width: CW, height: CH });
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(CW, CH);
  let preset = SNOW_PRESETS[0];
  let beta = preset.beta, gamma = preset.gamma;
  let flake = new Reiter(N, 1, beta, gamma);
  // Map every pixel to a lattice cell once.
  const map = new Int32Array(CW * CH).fill(-1);
  for (let Y = 0; Y < CH; Y++)
    for (let X = 0; X < CW; X++) {
      const y = (Y - CH / 2) / S, x = (X - CW / 2) / S;
      const r = y / (Math.sqrt(3) / 2), q = x - r / 2;
      // Cube rounding to the nearest hex.
      let rq = Math.round(q), rr = Math.round(r);
      const rs = Math.round(-q - r);
      const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs + q + r);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      if (Math.abs(rq) > N || Math.abs(rr) > N || Math.abs(rq + rr) > N) continue;
      map[Y * CW + X] = flake.idx(rq, rr);
    }
  const label = h('span.mono');
  const betaCtl = slider('Vapour β', 0.3, 0.95, 0.01, beta, (v) => { beta = v; restart(); }, (v) => v.toFixed(2));
  const gammaCtl = slider('Addition γ', 0, 0.005, 0.0001, gamma, (v) => { gamma = v; restart(); }, (v) => v.toFixed(4));
  const restart = () => {
    flake = new Reiter(N, 1, beta, gamma);
  };
  const tick = () => {
    if (!flake.done) for (let k = 0; k < 8 && !flake.done; k++) flake.step();
    const d = img.data;
    const s = flake.s;
    for (let p = 0; p < map.length; p++) {
      const i = map[p];
      let r = 4, g = 7, b = 18;
      if (i >= 0) {
        const v = s[i];
        if (v >= 1) {
          const t = Math.min(1, (v - 1) / 1.2);
          r = 150 + 105 * t; g = 205 + 50 * t; b = 255;
        } else {
          r = 14 + 40 * v; g = 22 + 50 * v; b = 48 + 80 * v;
        }
      }
      d[p * 4] = r; d[p * 4 + 1] = g; d[p * 4 + 2] = b; d[p * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    label.textContent = flake.done ? `finished after ${flake.steps.toLocaleString()} steps` : `growing… step ${flake.steps.toLocaleString()}`;
  };
  const presetSel = select(SNOW_PRESETS.map((p) => ({ value: p.id, label: p.label })), preset.id, (v) => {
    preset = SNOW_PRESETS.find((p) => p.id === v)!;
    beta = preset.beta;
    gamma = preset.gamma;
    betaCtl.input.value = String(beta);
    betaCtl.input.dispatchEvent(new Event('input'));
    gammaCtl.input.value = String(gamma);
    gammaCtl.input.dispatchEvent(new Event('input'));
  });
  const el = h('div', {}, canvas, h('div.fig-controls', {},
    h('label', {}, 'Preset ', presetSel), betaCtl.el, gammaCtl.el,
    h('button', { onclick: restart }, 'Grow again'), label));
  return { el, tick, reset: restart };
}
