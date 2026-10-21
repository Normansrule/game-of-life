import type { Cell } from '../engine/life';
import { type LineageResult, LineageRun, type Segment } from '../engine/lineage';
import { getPattern, patternCells } from '../engine/patterns';
import { drawChart } from './chart';
import { fitCanvas, fmt, h, select, toast } from './dom';
import { icon, setIcon } from './icons';
import { emit, on } from './bus';
import { CellPainter, drawBoardLines, drawThumb } from './thumb';
import { alpha, onTheme, tok } from './theme';

type Mode = 'tree' | 'radial' | 'timeline';
type Scale = 'linear' | 'sqrt' | 'log';

interface Layout {
  u: Float64Array; // lineage coordinate 0..1 per segment
  tMax: number;
}

const SEEDS = ['rpentomino', 'acorn', 'piheptomino', 'bheptomino', 'diehard', 'gosper', 'switchengine', 'rabbits'];

/** Token for each kind of object; the legend, the tree and the thumbnails all use these. */
const KIND_TOKENS: Record<string, string> = {
  'still life': '--data-pine',
  oscillator: '--data-ochre',
  spaceship: '--data-indigo',
  unknown: '--data-plum',
  died: '--data-shu',
  reaction: '--ink',
};
const kindColor = (k: string) => tok(KIND_TOKENS[k] ?? KIND_TOKENS.unknown);

export function createLineageView(root: HTMLElement) {
  let result: LineageResult | null = null;
  let layout: Layout | null = null;
  let mode: Mode = 'tree';
  let scale: Scale = 'sqrt';
  let seedCells: Cell[] = patternCells('rpentomino');
  let seedName = 'R-pentomino';
  let maxGen = 2500;
  let hoverSeg = -1;
  let selected = -1;
  let highlight = new Set<number>();
  let gen = 0;
  let playing = false;
  let active = false;
  let building: LineageRun | null = null;
  // Camera for the tree canvas (screen = world * k + offset).
  const cam = { k: 1, x: 0, y: 0 };

  // ---------- DOM ----------
  const seedSel = select(
    [...SEEDS.map((id) => ({ value: id, label: getPattern(id)!.name })), { value: 'custom', label: 'From the simulator' }],
    'rpentomino',
    (v) => {
      if (v === 'custom') return toast('Draw something in the Simulator, then press "Grow a lineage tree".');
      seedCells = patternCells(v);
      seedName = getPattern(v)!.name;
      build();
    },
  );
  const genSel = select(
    ['500', '1000', '2500', '6000'].map((v) => ({ value: v, label: `${v} gens max` })),
    String(maxGen),
    (v) => {
      maxGen = +v;
      build();
    },
  );
  const modeSel = select(
    [
      { value: 'tree', label: 'Tree (grows upward)' },
      { value: 'radial', label: 'Radial' },
      { value: 'timeline', label: 'Timeline' },
    ],
    mode,
    (v) => {
      mode = v as Mode;
      resetCam();
    },
  );
  const scaleSel = select(
    [
      { value: 'linear', label: 'Linear time' },
      { value: 'sqrt', label: '√ time' },
      { value: 'log', label: 'Log time' },
    ],
    scale,
    (v) => (scale = v as Scale),
  );
  const progress = h('div.progress', {}, h('div.bar'));
  const treeCanvas = h('canvas.tree-canvas');
  const tooltip = h('div.tree-tip');
  const treeWrap = h('div.tree-wrap', {}, treeCanvas, tooltip, progress, h('div.tree-help', {}, 'Scroll to zoom · drag to pan · click a branch to trace its family'));

  const preview = h('canvas.preview');
  const scrub = h('input.scrub', { type: 'range', min: 0, max: 0, value: 0, step: 1 }) as HTMLInputElement;
  scrub.addEventListener('input', () => {
    gen = +scrub.value;
    playing = false;
    setIcon(playBtn, 'play');
  });
  const playBtn = h('button.icon', { title: 'Play the evolution', 'aria-label': 'Play the evolution', onclick: () => {
    playing = !playing;
    if (playing && result && gen >= result.generations) gen = 0;
    setIcon(playBtn, playing ? 'pause' : 'play');
  } }, icon('play'));
  const genLabel = h('span.readout');
  const popChart = h('canvas.chart.small');
  const info = h('div.seg-info');
  const summary = h('div.summary');
  const census = h('div.census');
  const openBtn = h('button', {
    onclick: () => {
      if (!result) return;
      emit('sim:load', { cells: frameCells(gen), name: `${seedName} at generation ${gen}` });
      emit('navigate', { route: 'sim' });
    },
  }, 'Open this generation in the simulator');

  const side = h(
    'aside.side.lineage-side',
    {},
    h('section.panel', {}, h('h3', {}, 'Playback'), preview, h('div.row', {}, playBtn, scrub, genLabel), popChart, openBtn),
    h('section.panel', {}, h('h3', {}, 'Selected branch'), info),
    h('section.panel', {}, h('h3', {}, 'Summary'), summary),
    h('section.panel', {}, h('h3', {}, 'Final census'), census),
  );
  const controls = h(
    'div.controls',
    {},
    h('label', {}, 'Seed ', seedSel),
    genSel,
    modeSel,
    scaleSel,
    h('div.legend', {},
      ...Object.entries({ reaction: 'Reaction', 'still life': 'Still life', oscillator: 'Oscillator', spaceship: 'Spaceship', died: 'Died', unknown: 'Unclassified' }).map(([k, label]) =>
        h('span', {}, h('i', { style: `background:var(${KIND_TOKENS[k]})` }), label),
      ),
    ),
  );
  root.append(
    h(
      'div.lineage',
      {},
      h('div.lineage-main', {}, controls, treeWrap),
      side,
    ),
  );

  on('lineage:load', ({ cells, name }) => {
    seedCells = cells;
    seedName = name;
    seedSel.value = 'custom';
    build();
  });

  // ---------- build ----------
  function build() {
    building = new LineageRun(seedCells, { maxGen, size: 512 });
    result = null;
    layout = null;
    selected = hoverSeg = -1;
    highlight.clear();
    progress.classList.add('show');
  }

  function finishBuild() {
    result = building!.result();
    building = null;
    progress.classList.remove('show');
    layout = computeLayout(result);
    scrub.max = String(result.generations);
    gen = 0;
    playing = true;
    setIcon(playBtn, 'pause');
    computeBounds();
    resetCam();
    renderSummary();
  }

  // ---------- layout ----------
  function computeLayout(r: LineageResult): Layout {
    const segs = r.segments;
    const kids: number[][] = segs.map(() => []);
    for (const s of segs) if (s.parents.length) kids[s.parents[0]].push(s.id);
    const u = new Float64Array(segs.length);
    let cursor = 0;
    const weight = (s: Segment) => (s.fate === 'died' && s.end - s.start < 12 ? 0.3 : 1);
    // Iterative post-order DFS so deep trees don't blow the stack.
    const roots = segs.filter((s) => !s.parents.length).map((s) => s.id);
    for (const root of roots) {
      const stack: [number, number][] = [[root, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const [id, i] = top;
        const ch = kids[id];
        if (i < ch.length) {
          top[1]++;
          stack.push([ch[i], 0]);
        } else {
          stack.pop();
          if (!ch.length) {
            const w = weight(segs[id]);
            u[id] = cursor + w / 2;
            cursor += w;
          } else u[id] = (u[ch[0]] + u[ch[ch.length - 1]]) / 2;
        }
      }
      cursor += 0.5;
    }
    const total = Math.max(cursor, 1);
    for (let i = 0; i < u.length; i++) u[i] = u[i] / total;
    return { u, tMax: Math.max(1, r.generations) };
  }

  function tf(t: number): number {
    const T = layout!.tMax;
    if (scale === 'linear') return t / T;
    if (scale === 'sqrt') return Math.sqrt(t / T);
    return Math.log1p(t) / Math.log1p(T);
  }

  /** Map (time, lineage) to world coordinates in a unit-ish box. */
  function pt(t: number, u: number): [number, number] {
    const f = tf(t);
    if (mode === 'tree') return [u, 1 - f];
    if (mode === 'timeline') return [f, u];
    const a = u * Math.PI * 2 - Math.PI / 2;
    return [0.5 + Math.cos(a) * f * 0.5, 0.5 + Math.sin(a) * f * 0.5];
  }

  function resetCam() {
    fitCanvas(treeCanvas);
    const W = treeCanvas.clientWidth, H = treeCanvas.clientHeight;
    const pad = 36;
    if (mode === 'radial') {
      cam.k = Math.min(W, H) - pad * 2;
      cam.x = (W - cam.k) / 2;
      cam.y = (H - cam.k) / 2;
    } else {
      cam.k = 1;
      cam.x = pad;
      cam.y = topPad();
    }
  }

  /** Tree mode writes leaf names slanting up from the top edge, so it needs headroom for them. */
  const topPad = () => (mode === 'tree' ? 104 : 36);

  function toScreen(p: [number, number]): [number, number] {
    const W = treeCanvas.clientWidth - 72, H = treeCanvas.clientHeight - 36 - topPad();
    if (mode === 'radial') return [p[0] * cam.k + cam.x, p[1] * cam.k + cam.y];
    return [p[0] * W * cam.k + cam.x, p[1] * H * cam.k + cam.y];
  }

  function segColor(s: Segment): string {
    if (s.fate === 'died') return kindColor('died');
    if (s.fate === 'running' || s.fate === 'escaped') return kindColor(s.kind ?? 'unknown');
    // Internal (split/merged) segments are the reaction itself: plain ink.
    return kindColor('reaction');
  }

  // ---------- drawing ----------
  function drawTree() {
    fitCanvas(treeCanvas);
    const ctx = treeCanvas.getContext('2d')!;
    const dpr = treeCanvas.width / Math.max(1, treeCanvas.clientWidth);
    const W = treeCanvas.clientWidth, H = treeCanvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!result || !layout) return;
    const segs = result.segments;
    const u = layout.u;

    // Time rings / gridlines.
    const ui = tok('--ui');
    ctx.strokeStyle = tok('--rule');
    ctx.fillStyle = tok('--muted');
    ctx.font = `11px ${ui}`;
    ctx.lineWidth = 1;
    let lastTick = -Infinity;
    for (const t of timeTicks(layout.tMax)) {
      const tp = toScreen(pt(t, 0.25));
      const along = mode === 'tree' ? -tp[1] : mode === 'timeline' ? tp[0] : Math.hypot(tp[0] - toScreen(pt(0, 0))[0], tp[1] - toScreen(pt(0, 0))[1]);
      if (along - lastTick < 18) continue;
      lastTick = along;
      ctx.beginPath();
      if (mode === 'radial') {
        const c = toScreen(pt(0, 0));
        const e = toScreen(pt(t, 0.25));
        ctx.arc(c[0], c[1], Math.hypot(e[0] - c[0], e[1] - c[1]), 0, Math.PI * 2);
        ctx.stroke();
        const lab = toScreen(pt(t, 0));
        ctx.fillText(String(t), lab[0] + 3, lab[1] - 3);
      } else {
        const a = toScreen(pt(t, 0));
        const b = toScreen(pt(t, 1));
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
        ctx.fillText(String(t), mode === 'tree' ? 4 : a[0] + 3, mode === 'tree' ? a[1] - 3 : 12);
      }
    }

    const dim = highlight.size > 0;
    const drawSeg = (s: Segment, emph: boolean) => {
      const a = toScreen(pt(s.start, u[s.id]));
      const b = toScreen(pt(s.end + 1, u[s.id]));
      const col = segColor(s);
      const wdt = Math.min(4, 0.5 + Math.log2(1 + s.peak) * 0.45) * (emph ? 1.6 : 1);
      ctx.strokeStyle = col;
      const internal = s.fate === 'split' || s.fate === 'merged';
      ctx.globalAlpha = dim && !emph ? 0.12 : s.fate === 'died' ? 0.55 : internal && !emph ? 0.6 : 0.95;
      ctx.lineWidth = wdt;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      // Connectors to parents (curves along constant time).
      ctx.lineWidth = Math.max(0.6, wdt * 0.7);
      ctx.strokeStyle = tok('--ink');
      s.parents.forEach((pid, i) => {
        const pu = u[pid];
        ctx.globalAlpha = (dim && !emph ? 0.08 : i === 0 ? 0.5 : 0.25) * (s.fate === 'died' ? 0.7 : 1);
        ctx.setLineDash(i === 0 ? [] : [2, 3]);
        ctx.beginPath();
        const steps = mode === 'radial' ? 12 : 1;
        for (let k = 0; k <= steps; k++) {
          const p = toScreen(pt(s.start, pu + ((u[s.id] - pu) * k) / steps));
          if (k === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
      // Leaf markers.
      if (!s.children.length && s.fate !== 'died') {
        ctx.globalAlpha = dim && !emph ? 0.2 : 1;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(b[0], b[1], s.fate === 'escaped' ? 3.2 : 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ctx.lineCap = 'round';
    for (const s of segs) if (!highlight.has(s.id)) drawSeg(s, false);
    for (const id of highlight) drawSeg(segs[id], true);
    ctx.globalAlpha = 1;

    // Leaf labels when there is room.
    const leaves = segs.filter((s) => !s.children.length && s.fate !== 'died' && s.label);
    {
      ctx.font = `12px ${ui}`;
      ctx.fillStyle = tok('--ink');
      const placed: [number, number][] = [];
      leaves.sort((a, b) => u[a.id] - u[b.id]);
      for (const s of leaves) {
        const b = toScreen(pt(s.end + 1, u[s.id]));
        if (b[0] < -20 || b[1] < -20 || b[0] > W + 20 || b[1] > H + 20) continue;
        if (placed.some(([px, py]) => Math.abs(px - b[0]) < 12 && Math.abs(py - b[1]) < 12)) continue;
        placed.push(b);
        const text = s.label! + (s.fate === 'escaped' ? ' (flew off)' : '');
        ctx.save();
        ctx.translate(b[0], b[1]);
        if (mode === 'tree') ctx.rotate(-Math.PI / 2.6);
        else if (mode === 'radial') {
          const ang = u[s.id] * Math.PI * 2 - Math.PI / 2;
          const flip = Math.cos(ang) < 0;
          ctx.rotate(flip ? ang + Math.PI : ang);
          ctx.textAlign = flip ? 'right' : 'left';
          ctx.fillText(text, flip ? -6 : 6, 3);
          ctx.restore();
          continue;
        }
        ctx.fillText(text, 6, 3);
        ctx.restore();
      }
    }

    // Current-generation cursor.
    ctx.strokeStyle = alpha('--ink', 0.55);
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (mode === 'radial') {
      const c = toScreen(pt(0, 0));
      const e = toScreen(pt(gen, 0.25));
      ctx.arc(c[0], c[1], Math.max(0.5, Math.hypot(e[0] - c[0], e[1] - c[1])), 0, Math.PI * 2);
    } else {
      const a = toScreen(pt(gen, 0));
      const b = toScreen(pt(gen, 1));
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function timeTicks(T: number): number[] {
    const out: number[] = [];
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    if (scale === 'linear') {
      const st = steps.find((s) => T / s <= 8) ?? 1000;
      for (let t = st; t < T; t += st) out.push(t);
    } else {
      for (const t of steps) if (t < T) out.push(t);
    }
    return out;
  }

  // Preview of the world at the current generation.
  let pb = { x0: 0, y0: 0, x1: 1, y1: 1 };
  function computeBounds() {
    if (!result) return;
    const N = result.size;
    let x0 = N, y0 = N, x1 = 0, y1 = 0;
    for (const f of result.frames.slice(0, 1))
      for (const c of f.cells) {
        const x = c % N, y = (c - x) / N;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    // Start the preview camera on the seed.
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    pb = { x0: cx - 14, y0: cy - 14, x1: cx + 14, y1: cy + 14 };
  }

  function frameCells(g: number): Cell[] {
    if (!result) return [];
    const N = result.size;
    const f = result.frames[Math.min(g, result.frames.length - 1)];
    return Array.from(f.cells, (c) => [c % N, Math.floor(c / N)] as Cell);
  }

  function drawPreview() {
    fitCanvas(preview);
    const ctx = preview.getContext('2d')!;
    const dpr = preview.width / Math.max(1, preview.clientWidth);
    const W = preview.clientWidth, H = preview.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, W, H);
    if (!result) return;
    const N = result.size;
    const f = result.frames[Math.min(gen, result.frames.length - 1)];
    // Smoothly follow the live cells (gliders fly away, so a fixed box is too big).
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of f.cells) {
      const x = c % N, y = (c - x) / N;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x1 >= x0) {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      const half = Math.max(14, (x1 - x0) / 2 + 4, (y1 - y0) / 2 + 4);
      const k = 0.15;
      pb = {
        x0: pb.x0 + (cx - half - pb.x0) * k, y0: pb.y0 + (cy - half - pb.y0) * k,
        x1: pb.x1 + (cx + half - pb.x1) * k, y1: pb.y1 + (cy + half - pb.y1) * k,
      };
    }
    const s = Math.min(W / (pb.x1 - pb.x0), H / (pb.y1 - pb.y0));
    const ox = (W - (pb.x1 - pb.x0) * s) / 2 - pb.x0 * s;
    const oy = (H - (pb.y1 - pb.y0) * s) / 2 - pb.y0 * s;
    drawBoardLines(ctx, W, H, s, ox, oy);
    // Stones of the traced family stay slate; the rest fade back when a branch is selected.
    const dim = highlight.size > 0;
    const on = new CellPainter(s);
    const off = new CellPainter(s);
    for (let i = 0; i < f.cells.length; i++) {
      const c = f.cells[i];
      const x = c % N, y = (c - x) / N;
      (dim && !highlight.has(f.seg[i]) ? off : on).add(ox + x * s, oy + y * s);
    }
    off.fill(ctx, alpha('--slate', 0.25), false);
    on.fill(ctx);
    genLabel.textContent = `Generation ${gen}`;
  }

  function renderSummary() {
    if (!result) return;
    const r = result;
    const rows: [string, string][] = [
      ['Seed', `${seedName} (${seedCells.length} cells)`],
      ['Generations run', fmt(r.generations)],
      ['Reaction settles at', `generation ${fmt(r.settledAt)}`],
      ['World stable at', r.stabilizedAt !== null ? `generation ${fmt(r.stabilizedAt)} (period ${r.finalPeriod})` : 'still evolving'],
      ['Branches (segments)', fmt(r.segments.length)],
      ['Splits', fmt(r.splits)],
      ['Merges (collisions)', fmt(r.merges)],
      ['Deaths', fmt(r.deaths)],
      ['Escaped to infinity', fmt(r.escapes)],
      ['Peak population', fmt(Math.max(...r.populations))],
    ];
    summary.replaceChildren(h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    // Census of survivors and escapees.
    const groups = new Map<string, { count: number; cells: Cell[]; kind: string }>();
    for (const s of r.segments) {
      if (s.fate !== 'running' && s.fate !== 'escaped') continue;
      const name = (s.label ?? 'unclassified') + (s.fate === 'escaped' ? ' (flew off)' : '');
      const g = groups.get(name) ?? { count: 0, cells: s.endCells, kind: s.kind ?? 'unknown' };
      g.count++;
      groups.set(name, g);
    }
    census.replaceChildren(
      ...[...groups.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, g]) => {
          const c = h('canvas.thumb.small');
          requestAnimationFrame(() => drawThumb(c, g.cells, kindColor(g.kind)));
          return h('div.census-item', {}, c, h('span', {}, name), h('b', {}, `× ${g.count}`));
        }),
    );
    if (!groups.size) census.textContent = 'Nothing survives.';
    showInfo(-1);
  }

  function showInfo(id: number) {
    if (!result) return;
    if (id < 0) {
      info.replaceChildren(h('p.blurb', {}, 'Hover or click a branch. Each horizontal run is one object living through time; forks are splits, joins are collisions.'));
      return;
    }
    const s = result.segments[id];
    const c = h('canvas.thumb.big');
    const fateText: Record<string, string> = {
      running: 'survives to the end',
      died: 'dies out',
      split: `splits into ${s.children.length}`,
      merged: 'collides and merges',
      escaped: 'flies off to infinity',
    };
    info.replaceChildren(
      c,
      h(
        'dl',
        {},
        h('dt', {}, 'Object'), h('dd', {}, s.label ?? (s.fate === 'split' || s.fate === 'merged' ? 'active reaction' : 'unclassified')),
        h('dt', {}, 'Lifetime'), h('dd', {}, `generations ${s.start} to ${s.end} (${s.end - s.start + 1})`),
        h('dt', {}, 'Fate'), h('dd', {}, fateText[s.fate]),
        h('dt', {}, 'Cells'), h('dd', {}, `${s.startCells.length} → ${s.endCells.length} (peak ${s.peak})`),
        h('dt', {}, 'Parents'), h('dd', {}, s.parents.length ? String(s.parents.length) : 'root'),
        h('dt', {}, 'Children'), h('dd', {}, String(s.children.length)),
      ),
    );
    requestAnimationFrame(() => drawThumb(c, s.endCells, segColor(s)));
  }

  function lineageOf(id: number): Set<number> {
    const segs = result!.segments;
    const out = new Set<number>([id]);
    const up = [id];
    while (up.length) for (const p of segs[up.pop()!].parents) if (!out.has(p)) { out.add(p); up.push(p); }
    const down = [id];
    while (down.length) for (const c of segs[down.pop()!].children) if (!out.has(c)) { out.add(c); down.push(c); }
    return out;
  }

  // ---------- interaction ----------
  function pick(mx: number, my: number): number {
    if (!result || !layout) return -1;
    let best = -1;
    let bd = 10 * 10;
    for (const s of result.segments) {
      const a = toScreen(pt(s.start, layout.u[s.id]));
      const b = toScreen(pt(s.end + 1, layout.u[s.id]));
      const d = distSq(mx, my, a, b);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
    return best;
  }

  let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
  treeCanvas.addEventListener('pointerdown', (e) => {
    treeCanvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, cx: cam.x, cy: cam.y, moved: false };
  });
  treeCanvas.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      cam.x = drag.cx + dx;
      cam.y = drag.cy + dy;
      return;
    }
    hoverSeg = pick(e.offsetX, e.offsetY);
    if (hoverSeg >= 0 && result) {
      const s = result.segments[hoverSeg];
      tooltip.textContent = `${s.label ?? (s.fate === 'died' ? 'dies' : 'reaction')} · generations ${s.start}–${s.end} · ${s.endCells.length} cells`;
      tooltip.style.transform = `translate(${e.offsetX + 14}px, ${e.offsetY + 10}px)`;
      tooltip.classList.add('show');
      if (selected < 0) showInfo(hoverSeg);
    } else tooltip.classList.remove('show');
  });
  treeCanvas.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) {
      const id = pick(e.offsetX, e.offsetY);
      selected = id;
      highlight = id >= 0 ? lineageOf(id) : new Set();
      showInfo(id);
      if (id >= 0 && result) {
        gen = result.segments[id].start;
        scrub.value = String(gen);
        playing = false;
        setIcon(playBtn, 'play');
      }
    }
    drag = null;
  });
  treeCanvas.addEventListener('pointerleave', () => tooltip.classList.remove('show'));
  treeCanvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * 0.0015);
      const nk = Math.min(60, Math.max(0.3, cam.k * f));
      const r = nk / cam.k;
      cam.x = e.offsetX - (e.offsetX - cam.x) * r;
      cam.y = e.offsetY - (e.offsetY - cam.y) * r;
      cam.k = nk;
    },
    { passive: false },
  );

  // ---------- loop ----------
  let lastFrame = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!active) return;
    if (building) {
      const t0 = performance.now();
      while (!building.done && performance.now() - t0 < 25) building.advance(5);
      (progress.firstChild as HTMLElement).style.width = `${(building.generation / building.maxGen) * 100}%`;
      if (building.done) finishBuild();
      return;
    }
    if (!result) return;
    if (playing && now - lastFrame > 1000 / 60) {
      lastFrame = now;
      const stepSize = Math.max(1, Math.round(result.generations / 900));
      gen = Math.min(result.generations, gen + stepSize);
      scrub.value = String(gen);
      if (gen >= result.generations) {
        playing = false;
        setIcon(playBtn, 'play');
      }
    }
    drawTree();
    drawPreview();
    drawChart(popChart, [{ values: result.populations, color: '--ink', fill: true }], { marker: gen, xLabel: 'generation' });
  }
  requestAnimationFrame(frame);

  // The tree and preview read tokens every frame; the thumbnails are static, so redraw them.
  onTheme(() => {
    if (!result) return;
    renderSummary();
    if (selected >= 0) showInfo(selected);
  });

  return {
    activate() {
      active = true;
      if (!result && !building) build();
      else requestAnimationFrame(() => resetCam());
    },
    deactivate() {
      active = false;
    },
  };
}

function distSq(px: number, py: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l = dx * dx + dy * dy;
  let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0;
  t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx - px, y = a[1] + t * dy - py;
  return x * x + y * y;
}
