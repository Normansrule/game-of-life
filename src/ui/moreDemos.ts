/**
 * Application demos added in v4: Lenia (continuous Life), Schelling's
 * segregation model, the hodgepodge machine (chemical waves) and
 * Nagel–Schreckenberg traffic on a ring road. Models: src/engine/models.
 */
import { h, slider } from './dom';
import { drawChart } from './chart';
import { type Demo, PixelCanvas, type RGB, at, catGround, css, lut, mix, sequential, themed } from './demos';
import { rgb, tok } from './theme';
import { Lenia, ORBIUM, ORBIUM_CELLS, stampPattern } from '../engine/models/lenia';
import { Schelling } from '../engine/models/schelling';
import { Hodgepodge } from '../engine/models/hodgepodge';
import { NaSch } from '../engine/models/nasch';

/** The sequential map for continuous fields: slate (empty) up to clamshell (full). */
const seqLut = themed(() => lut(sequential()));

// ---------------------------------------------------------------- Lenia
export function leniaDemo(): Demo {
  const W = 96, H = 64;
  const px = new PixelCanvas(W, H);
  px.canvas.classList.add('smooth');
  const world = new Lenia(W, H, { ...ORBIUM });
  const mass: number[] = [];
  const chart = h('canvas.chart.small');
  const label = h('span.readout');
  const reset = () => {
    world.A.fill(0);
    // Same orientation means same velocity, so these two never collide.
    stampPattern(world, ORBIUM_CELLS, 8, 6, 0);
    stampPattern(world, ORBIUM_CELLS, 56, 34, 0);
    world.generation = 0;
    mass.length = 0;
  };
  reset();
  px.canvas.addEventListener('pointerdown', (e) => {
    const r = px.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W) - 10, y = Math.floor(((e.clientY - r.top) / r.height) * H) - 10;
    stampPattern(world, ORBIUM_CELLS, x, y, Math.floor(Math.random() * 4));
  });
  let frame = 0;
  const tick = () => {
    world.step();
    mass.push(world.mass);
    if (mass.length > 400) mass.shift();
    const table = seqLut();
    px.paint((i) => at(table, world.A[i]));
    if (++frame % 10 === 0) {
      drawChart(chart, [{ values: mass, color: '--ink', label: 'total mass', width: 1.5 }], { yMin: 0, legend: true });
      label.textContent = `t = ${(world.generation / world.p.T).toFixed(1)} · μ ${world.p.mu.toFixed(3)} · σ ${world.p.sigma.toFixed(4)}`;
    }
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    slider('Growth centre μ', 0.12, 0.18, 0.001, ORBIUM.mu, (v) => (world.p.mu = v), (v) => v.toFixed(3)).el,
    slider('Growth width σ', 0.01, 0.025, 0.0005, ORBIUM.sigma, (v) => (world.p.sigma = v), (v) => v.toFixed(4)).el,
    h('button', { onclick: reset }, 'Two Orbia'),
    h('button', { onclick: () => world.A.fill(0) }, 'Clear'),
    label), h('p.demo-hint', {}, 'Click to release another Orbium. Nudge μ or σ and watch the creatures starve, bloat or explode.'));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Schelling
export function schellingDemo(): Demo {
  const W = 100, H = 70;
  const px = new PixelCanvas(W, H);
  let town = new Schelling(W, H);
  let threshold = 0.34;
  const seg: number[] = [], unhappy: number[] = [];
  const chart = h('canvas.chart.small');
  const label = h('span.readout');
  // Two groups in indigo and ochre; an unhappy agent is drawn faded towards the ground.
  const pal = themed(() => {
    const ground = catGround(), a = rgb('--data-indigo'), b = rgb('--data-ochre');
    return { ground, a, aSad: mix(a, ground, 0.5), b, bSad: mix(b, ground, 0.5) };
  });
  const reset = () => {
    town = new Schelling(W, H);
    town.threshold = threshold;
    town.seed(0.12);
    seg.length = unhappy.length = 0;
  };
  reset();
  let frame = 0, settledAt = -1;
  const tick = () => {
    if (frame++ % 4) return;
    const moved = town.step();
    if (moved === 0 && settledAt < 0) settledAt = seg.length;
    if (moved) settledAt = -1;
    seg.push(town.segregation() * 100);
    unhappy.push((town.unhappyCount() / (W * H)) * 100);
    if (seg.length > 300) { seg.shift(); unhappy.shift(); }
    const p = pal();
    px.paint((i) => {
      const v = town.g[i];
      if (!v) return p.ground;
      const sad = town.unhappy(i);
      return v === 1 ? (sad ? p.aSad : p.a) : sad ? p.bSad : p.b;
    });
    drawChart(chart, [
      { values: seg, color: '--ink', label: 'similar neighbours %' },
      { values: unhappy, color: '--data-shu', label: 'unhappy %' },
    ], { yMin: 0, yMax: 100, legend: true });
    label.textContent = moved ? `${moved} moves this round` : 'Everyone is content: the town has settled';
  };
  const el = h('div', {}, px.canvas, chart, h('div.fig-controls', {},
    slider('Wants at least this share of similar neighbours', 0, 0.8, 0.01, threshold, (v) => { threshold = v; town.threshold = v; }, (v) => `${Math.round(v * 100)}%`).el,
    h('button', { onclick: reset }, 'Mix the town again'),
    label));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Belousov–Zhabotinsky
export function bzDemo(): Demo {
  const W = 150, H = 100;
  const px = new PixelCanvas(W, H);
  let m = new Hodgepodge(W, H);
  let g = 28;
  const reset = () => {
    m = new Hodgepodge(W, H, 200, 3, 3, g);
    m.randomize(Math.random);
  };
  reset();
  // Ferroin colours: red (reduced) through the board to blue (oxidised).
  const pal = themed(() => lut([rgb('--data-shu'), rgb('--board'), rgb('--data-indigo')], 201));
  const tick = () => {
    m.step();
    const p = pal();
    px.paint((i) => p[m.s[i]]);
  };
  const el = h('div', {}, px.canvas, h('div.fig-controls', {},
    slider('Reaction speed g', 5, 60, 1, g, (v) => { g = v; m.g = v; }).el,
    h('button', { onclick: reset }, 'New dish')));
  return { el, tick, reset };
}

// ---------------------------------------------------------------- Ring road
export function ringRoadDemo(): Demo {
  const L = 230;
  const ring = h('canvas.demo-canvas.smooth.ring', { width: 360, height: 360 });
  const rctx = ring.getContext('2d')!;
  const st = new PixelCanvas(L, 160); // space–time diagram
  let cars = 22 * 2, pBrake = 0.25;
  let road = new NaSch(L, cars, 5, pBrake);
  const rows: Uint8Array[] = [];
  const speeds: number[] = [];
  const chart = h('canvas.chart.small');
  const label = h('span.readout');
  const reset = () => {
    road = new NaSch(L, cars, 5, pBrake);
    rows.length = 0;
    speeds.length = 0;
  };
  // Stopped cars vermilion, slow ochre, flowing pine.
  const pal = themed(() => ({ road: catGround(), stop: rgb('--data-shu'), slow: rgb('--data-ochre'), go: rgb('--data-pine') }));
  const speedColour = (v: number): RGB => { const p = pal(); return v <= 0 ? p.stop : v <= 2 ? p.slow : p.go; };
  let frame = 0;
  const tick = () => {
    if (frame++ % 3) return;
    road.p = pBrake;
    road.step();
    const row = new Uint8Array(L).fill(255);
    for (let i = 0; i < road.cars; i++) row[road.pos[i]] = road.vel[i];
    rows.push(row);
    if (rows.length > 160) rows.shift();
    speeds.push(road.meanSpeed());
    if (speeds.length > 300) speeds.shift();
    // Space–time diagram: one row per step, newest at the bottom.
    const off = 160 - rows.length;
    const asphalt = pal().road;
    st.paint((i) => {
      const y = Math.floor(i / L) - off, x = i % L;
      if (y < 0) return asphalt;
      const v = rows[y][x];
      return v === 255 ? asphalt : speedColour(v);
    });
    // Ring
    const S = 360, cx = S / 2, cy = S / 2, R = 140;
    rctx.clearRect(0, 0, S, S);
    rctx.lineWidth = 26;
    rctx.strokeStyle = css(asphalt);
    rctx.beginPath();
    rctx.arc(cx, cy, R, 0, Math.PI * 2);
    rctx.stroke();
    for (let i = 0; i < road.cars; i++) {
      const a = (road.pos[i] / L) * Math.PI * 2 - Math.PI / 2;
      const c = speedColour(road.vel[i]);
      rctx.save();
      rctx.translate(cx + R * Math.cos(a), cy + R * Math.sin(a));
      rctx.rotate(a + Math.PI / 2);
      rctx.fillStyle = css(c);
      rctx.fillRect(-6, -5, 12, 10);
      rctx.restore();
    }
    rctx.fillStyle = tok('--ink');
    rctx.font = `650 24px ${tok('--ui')}`;
    rctx.textAlign = 'center';
    rctx.fillText(`${road.cars} cars`, cx, cy - 8);
    rctx.font = `500 18px ${tok('--ui')}`;
    rctx.fillText(`speed ${road.meanSpeed().toFixed(2)} / 5`, cx, cy + 20);
    if (frame % 15 === 1) drawChart(chart, [{ values: speeds, color: '--ink', label: 'mean speed', width: 1.5 }], { yMin: 0, yMax: 5, legend: true });
    const stopped = [...road.vel].filter((v) => v === 0).length;
    label.textContent = `${stopped} cars stopped`;
  };
  const el = h('div', {}, h('div.ring-wrap', {}, ring, h('div', {}, st.canvas, h('div.demo-hint', {}, 'Space–time: each row is one moment, time runs down. Red streaks are jams; they drift left, backwards against the traffic.'))), chart,
    h('div.fig-controls', {},
      slider('Cars', 5, 120, 1, cars, (v) => { cars = v; reset(); }).el,
      slider('Random braking p', 0, 0.6, 0.01, pBrake, (v) => (pBrake = v), (v) => v.toFixed(2)).el,
      h('button', { onclick: reset }, 'Restart evenly spaced'),
      label));
  return { el, tick, reset };
}

