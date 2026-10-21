import {
  type BasinLayout,
  type PredLists,
  type StateSpace,
  analyzeStateSpace,
  layoutBasin,
  popcount,
  predecessorLists,
  stateToGrid,
} from '../engine/basins';
import { RULE_PRESETS } from '../engine/rules';
import { fitCanvas, fmt, h, select } from './dom';
import { alpha, onTheme, rgb, tok } from './theme';

interface Group {
  key: string;
  basins: number[];
  size: number;
  cycleLen: number;
  maxDepth: number;
  gardens: number;
}

const SIZES = ['3x3', '3x4', '4x4', '3x5', '3x6'];

/**
 * Node colours by meaning, shared by the canvas and the legend:
 * the attractor cycle is ink, Gardens of Eden (no predecessor) are shu red,
 * and transient states run from indigo (next to the cycle) to ochre (far out).
 */
const NODE_TOKENS = { cycle: '--ink', eden: '--data-shu', near: '--data-indigo', far: '--data-ochre' };

function depthColor(d: number, max: number): string {
  const t = max ? d / max : 0;
  const a = rgb(NODE_TOKENS.near), b = rgb(NODE_TOKENS.far);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export function createBasinView(root: HTMLElement) {
  let size = '4x4';
  let rule = 'B3/S23';
  let space: StateSpace | null = null;
  let preds: PredLists | null = null;
  let groups: Group[] = [];
  let mode: 'field' | 'single' = 'field';
  let current = 0; // group index for single mode
  let single: BasinLayout | null = null;
  const fieldLayouts = new Map<number, BasinLayout>();
  let hoverState = -1;
  let active = false;
  let dirty = true;

  const canvas = h('canvas.basin-canvas');
  const statsEl = h('div.summary');
  const listEl = h('div.basin-list');
  const stateEl = h('div.state-info');
  const backBtn = h('button', { onclick: () => { mode = 'field'; dirty = true; backBtn.hidden = true; } }, 'Back to all basins');
  backBtn.hidden = true;
  const title = h('div.basin-title');

  const controls = h(
    'div.controls',
    {},
    h('label', {}, 'Torus ', select(SIZES.map((s) => ({ value: s, label: s.replace('x', ' × ') + ` (${2 ** (+s[0] * +s[2])} states)` })), size, (v) => { size = v; compute(); })),
    h('label', {}, 'Rule ', select(RULE_PRESETS.filter((r) => !r.rule.startsWith('B0')).map((r) => ({ value: r.rule, label: `${r.name} (${r.rule})` })), rule, (v) => { rule = v; compute(); })),
    backBtn,
    title,
    h('div.legend', {},
      ...([['cycle', 'Attractor cycle'], ['near', 'Close to the cycle'], ['far', 'Far from it'], ['eden', 'Garden of Eden']] as const).map(([k, label]) =>
        h('span', {}, h('i', { style: `background:var(${NODE_TOKENS[k]})` }), label),
      ),
    ),
  );

  root.append(
    h(
      'div.basins',
      {},
      h('div.lineage-main', {}, controls, h('div.tree-wrap', {}, canvas)),
      h(
        'aside.side',
        {},
        h('section.panel', {}, h('h3', {}, 'State space'), statsEl),
        h('section.panel', {}, h('h3', {}, 'Hovered state'), stateEl),
        h('section.panel', {}, h('h3', {}, 'Basins of attraction'), h('p.blurb', {}, 'Grouped when they have the same size, cycle and depth (usually translated or rotated copies of each other). Click one to open it.'), listEl),
      ),
    ),
  );

  function compute() {
    const [w, hh] = size.split('x').map(Number);
    space = analyzeStateSpace(w, hh, rule);
    preds = predecessorLists(space.succ);
    const map = new Map<string, Group>();
    for (const b of space.basins) {
      const key = `${b.size}|${b.cycle.length}|${b.maxDepth}|${b.gardens}`;
      const g = map.get(key) ?? { key, basins: [], size: b.size, cycleLen: b.cycle.length, maxDepth: b.maxDepth, gardens: b.gardens };
      g.basins.push(b.id);
      map.set(key, g);
    }
    groups = [...map.values()].sort((a, b) => b.size - a.size);
    fieldLayouts.clear();
    mode = 'field';
    backBtn.hidden = true;
    renderStats();
    renderList();
    dirty = true;
  }

  function renderStats() {
    if (!space) return;
    const s = space;
    const cyc = new Map<number, number>();
    for (const b of s.basins) cyc.set(b.cycle.length, (cyc.get(b.cycle.length) ?? 0) + 1);
    const maxDepth = Math.max(...s.basins.map((b) => b.maxDepth));
    const rows: [string, string][] = [
      ['Configurations', `2^${s.w * s.h} = ${fmt(s.count)}`],
      ['Basins (attractors)', fmt(s.basins.length)],
      ['Distinct basin shapes', fmt(groups.length)],
      ['Garden of Eden states', `${fmt(s.gardensOfEden)} (${((s.gardensOfEden / s.count) * 100).toFixed(1)}%)`],
      ['Longest transient', `${maxDepth} steps`],
      ['Attractor periods', [...cyc.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p${p}×${n}`).join(', ')],
      ['Basin of the empty grid', `${fmt(s.basins[s.basinOf[0]].size)} states (${((s.basins[s.basinOf[0]].size / s.count) * 100).toFixed(1)}%)`],
    ];
    statsEl.replaceChildren(h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
  }

  function renderList() {
    listEl.replaceChildren(
      ...groups.slice(0, 80).map((g, i) =>
        h(
          'button.basin-item',
          { onclick: () => openGroup(i) },
          h('b', {}, `${fmt(g.size)} states`),
          h('span', {}, `cycle ${g.cycleLen} · depth ${g.maxDepth} · ${fmt(g.gardens)} GoE`),
          g.basins.length > 1 ? h('i', {}, `× ${g.basins.length}`) : null,
        ),
      ),
    );
  }

  function openGroup(i: number) {
    if (!space) return;
    current = i;
    mode = 'single';
    backBtn.hidden = false;
    single = layoutBasin(space, groups[i].basins[0], preds!);
    dirty = true;
  }

  function fieldLayout(id: number): BasinLayout {
    let l = fieldLayouts.get(id);
    if (!l) fieldLayouts.set(id, (l = layoutBasin(space!, id, preds!)));
    return l;
  }

  // Cells of the field grid in screen space, for picking.
  let fieldCells: { gi: number; x: number; y: number; r: number }[] = [];

  function draw() {
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!space) return;
    if (mode === 'single' && single) {
      const g = groups[current];
      title.textContent = `Basin of ${fmt(g.size)} states · attractor period ${g.cycleLen} · ${g.basins.length > 1 ? `one of ${g.basins.length} equivalent basins` : 'unique'}`;
      const R = Math.min(W, H) / 2 - 24;
      drawBasin(ctx, single, W / 2, H / 2, R, true);
    } else {
      title.textContent = 'Every basin of attraction, largest first. Each is a cycle (centre) with trees of states that flow into it.';
      const show = groups.slice(0, 48);
      // Area roughly proportional to log(size).
      const n = show.length;
      const cols = Math.ceil(Math.sqrt((n * W) / H));
      const rows = Math.ceil(n / cols);
      const cw = W / cols, ch = H / rows;
      fieldCells = [];
      show.forEach((g, i) => {
        const cx = (i % cols) * cw + cw / 2;
        const cy = Math.floor(i / cols) * ch + ch / 2;
        const maxLog = Math.log(groups[0].size + 1);
        const r = (Math.min(cw, ch) / 2 - 14) * (0.35 + 0.65 * (Math.log(g.size + 1) / maxLog));
        fieldCells.push({ gi: i, x: cx, y: cy, r: Math.min(cw, ch) / 2 });
        drawBasin(ctx, fieldLayout(g.basins[0]), cx, cy, r, false);
        ctx.fillStyle = tok('--muted');
        ctx.font = `11px ${tok('--ui')}`;
        ctx.textAlign = 'center';
        ctx.fillText(`${fmt(g.size)}${g.basins.length > 1 ? ` ×${g.basins.length}` : ''}`, cx, cy + Math.min(cw, ch) / 2 - 3);
      });
    }
  }

  let lastPositions: { l: BasinLayout; cx: number; cy: number; R: number } | null = null;

  function drawBasin(ctx: CanvasRenderingContext2D, l: BasinLayout, cx: number, cy: number, R: number, detailed: boolean) {
    const s = space!;
    const n = l.nodes.length;
    const max = Math.max(1, l.maxDepth);
    // Edges in ink, all in one path.
    ctx.lineWidth = detailed ? (n > 5000 ? 0.5 : 1) : 0.6;
    ctx.strokeStyle = alpha('--ink', n > 5000 ? 0.22 : 0.38);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = l.parentIndex[i];
      if (p < 0) continue;
      ctx.moveTo(cx + l.x[i] * R, cy + l.y[i] * R);
      ctx.lineTo(cx + l.x[p] * R, cy + l.y[p] * R);
    }
    ctx.stroke();
    // Depth colours are computed once per draw, not per node.
    const ramp = Array.from({ length: max + 1 }, (_, d) => depthColor(d, max));
    const cycleCol = tok(NODE_TOKENS.cycle), edenCol = tok(NODE_TOKENS.eden);
    // Nodes.
    const dot = detailed ? (n > 5000 ? 0.9 : n > 500 ? 1.6 : 3) : n > 500 ? 0.6 : 1.2;
    for (let i = 0; i < n; i++) {
      const st = l.nodes[i];
      const goe = !s.indeg[st];
      ctx.fillStyle = s.onCycle[st] ? cycleCol : goe ? edenCol : ramp[s.depth[st]];
      const r = s.onCycle[st] ? dot * 2.2 + 1 : dot;
      ctx.beginPath();
      ctx.arc(cx + l.x[i] * R, cy + l.y[i] * R, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (detailed) {
      lastPositions = { l, cx, cy, R };
      if (hoverState >= 0) {
        // Highlight the trajectory from the hovered state to its attractor.
        const idx = new Map<number, number>();
        l.nodes.forEach((st, i) => idx.set(st, i));
        let st = hoverState;
        ctx.strokeStyle = tok('--ink');
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let i = idx.get(st);
        if (i !== undefined) ctx.moveTo(cx + l.x[i] * R, cy + l.y[i] * R);
        const seen = new Set<number>();
        while (i !== undefined && !seen.has(st)) {
          seen.add(st);
          st = s.succ[st];
          i = idx.get(st);
          if (i !== undefined) ctx.lineTo(cx + l.x[i] * R, cy + l.y[i] * R);
        }
        ctx.stroke();
      }
    }
  }

  function showState(st: number) {
    if (!space || st < 0) {
      stateEl.replaceChildren(h('p.blurb', {}, 'Hover a dot. The big ink dots are the attractor cycle, red ones are Gardens of Eden (no predecessor). The thick line shows where that state goes.'));
      return;
    }
    const s = space;
    const traj: number[] = [];
    let x = st;
    const seen = new Set<number>();
    while (!seen.has(x) && traj.length < 14) {
      seen.add(x);
      traj.push(x);
      x = s.succ[x];
    }
    const mini = (state: number) => {
      const g = stateToGrid(state, s.w, s.h);
      return h('div.mini', { style: `grid-template-columns: repeat(${s.w}, 1fr)` }, ...g.flat().map((v) => h(v ? 'i.on' : 'i')));
    };
    let pre = 0;
    for (let k = preds!.start[st]; k < preds!.start[st + 1]; k++) pre++;
    stateEl.replaceChildren(
      h('dl', {},
        h('dt', {}, 'State'), h('dd', {}, `#${st} (${popcount(st)} live)`),
        h('dt', {}, 'Predecessors'), h('dd', {}, pre ? String(pre) : '0, Garden of Eden'),
        h('dt', {}, 'Steps to attractor'), h('dd', {}, String(s.depth[st])),
      ),
      h('div.traj', {}, ...traj.flatMap((t, i) => [mini(t), i < traj.length - 1 ? h('span', {}, '→') : null])),
    );
  }

  canvas.addEventListener('pointermove', (e) => {
    if (mode === 'single' && lastPositions && space) {
      const { l, cx, cy, R } = lastPositions;
      let best = -1, bd = 10 * 10;
      for (let i = 0; i < l.nodes.length; i++) {
        const dx = cx + l.x[i] * R - e.offsetX, dy = cy + l.y[i] * R - e.offsetY;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
      const st = best >= 0 ? l.nodes[best] : -1;
      if (st !== hoverState) {
        hoverState = st;
        showState(st);
        dirty = true;
      }
    } else {
      const c = fieldCells.find((f) => Math.abs(f.x - e.offsetX) < f.r && Math.abs(f.y - e.offsetY) < f.r);
      canvas.style.cursor = c ? 'zoom-in' : 'default';
    }
  });
  canvas.addEventListener('click', (e) => {
    if (mode !== 'field') return;
    const c = fieldCells.find((f) => Math.abs(f.x - e.offsetX) < f.r && Math.abs(f.y - e.offsetY) < f.r);
    if (c) openGroup(c.gi);
  });
  window.addEventListener('resize', () => (dirty = true));
  onTheme(() => (dirty = true));

  function frame() {
    requestAnimationFrame(frame);
    if (!active || !dirty) return;
    dirty = false;
    draw();
  }
  requestAnimationFrame(frame);

  return {
    activate() {
      active = true;
      if (!space) {
        compute();
        showState(-1);
      }
      dirty = true;
    },
    deactivate() {
      active = false;
    },
  };
}
