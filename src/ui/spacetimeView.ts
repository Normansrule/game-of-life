import type { Cell } from '../engine/life';
import { LineageRun } from '../engine/lineage';
import { getPattern, patternCells } from '../engine/patterns';
import { SpacetimeRenderer, lookAt, multiply, perspective } from '../render/spacetime';
import { fitCanvas, fmt, h, select, slider, toggle } from './dom';
import { on } from './bus';

const SEEDS = ['gosper', 'rpentomino', 'acorn', 'piheptomino', 'pulsar', 'pentadecathlon', 'glider', 'lwss', 'copperhead', 'switchengine', 'diehard'];

export function createSpacetimeView(root: HTMLElement) {
  let seedCells: Cell[] = patternCells('gosper');
  let gens = 150;
  let reveal = 0;
  let tMax = 1;
  let playing = true;
  let autoRotate = true;
  let colorMode = 0;
  let layerGap = 1;
  let active = false;
  let renderer: SpacetimeRenderer | null = null;
  let extent = 40;
  const cam = { yaw: 0.8, pitch: 0.7, dist: 120 };
  let instanceCount = 0;

  const canvas = h('canvas.space-canvas');
  const countEl = h('span.mono');
  const genEl = h('span.mono');
  const scrub = h('input.scrub', { type: 'range', min: 0, max: 150, value: 0, step: 1 }) as HTMLInputElement;
  scrub.addEventListener('input', () => {
    reveal = +scrub.value;
    playing = false;
  });
  const patternSel = select(
    [...SEEDS.map((id) => ({ value: id, label: getPattern(id)!.name })), { value: 'custom', label: 'From the simulator' }],
    'gosper',
    (v) => {
      if (v === 'custom') return;
      seedCells = patternCells(v);
      build();
    },
  );
  const controls = h(
    'div.controls',
    {},
    h('label', {}, 'Pattern ', patternSel),
    h('label', {}, 'Generations ', select(['60', '150', '300', '500'].map((v) => ({ value: v, label: v })), '150', (v) => { gens = +v; build(); })),
    h('label', {}, 'Colour ', select([{ value: '0', label: 'by time' }, { value: '1', label: 'by object' }], '0', (v) => (colorMode = +v))),
    h('button', { onclick: () => { reveal = 0; playing = true; } }, 'Replay'),
    toggle('Auto-rotate', true, (v) => (autoRotate = v)).el,
    h('div.space-slider', {}, slider('Layer spacing', 0.3, 3, 0.1, layerGap, (v) => (layerGap = v), (v) => v.toFixed(1)).el),
  );
  const footer = h('div.space-footer', {}, scrub, genEl, countEl);
  const wrap = h('div.tree-wrap', {}, canvas, h('div.tree-help', {}, 'Drag to orbit · scroll to zoom · time runs upward'));
  root.append(h('div.spacetime', {}, controls, wrap, footer));

  function build() {
    const run = new LineageRun(seedCells, { maxGen: gens, size: 384 });
    run.advance(gens + 1);
    const r = run.result();
    const N = r.size;
    let x0 = N, x1 = 0, y0 = N, y1 = 0, total = 0;
    for (const f of r.frames) {
      total += f.cells.length;
      for (const c of f.cells) {
        const x = c % N, y = (c - x) / N;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const data = new Float32Array(total * 4);
    let k = 0;
    r.frames.forEach((f, t) => {
      for (let i = 0; i < f.cells.length; i++) {
        const c = f.cells[i];
        const x = c % N, y = (c - x) / N;
        data[k++] = x - cx;
        data[k++] = t;
        data[k++] = y - cy;
        data[k++] = (f.seg[i] * 0.618034) % 1;
      }
    });
    instanceCount = total;
    tMax = r.frames.length - 1;
    extent = Math.max(x1 - x0, y1 - y0, 10);
    cam.dist = Math.max(extent * 1.2, tMax * layerGap) + 15;
    scrub.max = String(tMax);
    reveal = 0;
    playing = true;
    renderer?.setInstances(data);
    countEl.textContent = `${fmt(instanceCount)} cubes`;
  }

  let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cam.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
    cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + (e.clientY - drag.y) * 0.006));
  });
  canvas.addEventListener('pointerup', () => (drag = null));
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.dist = Math.max(10, Math.min(3000, cam.dist * Math.exp(e.deltaY * 0.0012)));
  }, { passive: false });

  let last = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!active || !renderer) return;
    if (playing) {
      reveal = Math.min(tMax, reveal + dt * Math.max(20, tMax / 6));
      if (reveal >= tMax) playing = false;
      scrub.value = String(Math.floor(reveal));
    }
    if (autoRotate && !drag) cam.yaw += dt * 0.15;
    fitCanvas(canvas);
    const midY = (Math.min(reveal, tMax) * layerGap) / 2;
    const eye = [
      Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      midY + Math.sin(cam.pitch) * cam.dist,
      Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    ];
    const proj = perspective(0.8, canvas.width / Math.max(1, canvas.height), 0.5, cam.dist * 4 + 500);
    const viewM = lookAt(eye, [0, midY, 0], [0, 1, 0]);
    renderer.draw(multiply(proj, viewM), { reveal, tMax, layerGap, fogFar: cam.dist * 2.2 + extent, colorMode });
    genEl.textContent = `generation ${Math.floor(reveal)} / ${tMax}`;
  }
  requestAnimationFrame(frame);

  on('space:load', ({ cells }) => {
    seedCells = cells;
    patternSel.value = 'custom';
    if (renderer) build();
  });

  return {
    activate() {
      active = true;
      if (!renderer) {
        try {
          renderer = new SpacetimeRenderer(canvas);
          build();
        } catch (e) {
          wrap.append(h('p.blurb', {}, `3D view unavailable: ${(e as Error).message}`));
        }
      }
    },
    deactivate() {
      active = false;
    },
  };
}
