import { type Rule, parseRule, ruleTable } from './rules';

/**
 * Exhaustive state-space analysis on a tiny torus.
 *
 * A w x h torus has 2^(wh) configurations and Life is a deterministic map
 * F from that set to itself, so the "state transition graph" is a
 * functional graph: every state has exactly one outgoing edge. Each
 * connected component (a basin of attraction) therefore contains exactly
 * one cycle (the attractor) with trees of transient states hanging off it.
 * States with no predecessor are "Garden of Eden" states.
 *
 * Drawing those in-trees around their cycles gives the basin of attraction
 * field popularised by Andrew Wuensche's DDLab.
 */

export interface Basin {
  id: number;
  cycle: number[];
  size: number;
  maxDepth: number;
  gardens: number;
}

export interface StateSpace {
  w: number;
  h: number;
  count: number;
  succ: Uint32Array;
  indeg: Uint32Array;
  depth: Uint16Array;
  basinOf: Uint32Array;
  onCycle: Uint8Array;
  basins: Basin[];
  gardensOfEden: number;
}

export const MAX_CELLS = 18;

export function successorTable(w: number, h: number, rule: Rule | string = 'B3/S23'): Uint32Array {
  const n = w * h;
  if (n > MAX_CELLS) throw new Error(`Torus too large (${n} cells, max ${MAX_CELLS})`);
  if (w < 3 || h < 3) throw new Error('Torus sides must be at least 3');
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  const table = ruleTable(r);
  const nbrs: number[][] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const list: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          list.push(((y + dy + h) % h) * w + ((x + dx + w) % w));
        }
      nbrs.push(list);
    }
  const count = 1 << n;
  const succ = new Uint32Array(count);
  for (let s = 0; s < count; s++) {
    let out = 0;
    for (let i = 0; i < n; i++) {
      const nb = nbrs[i];
      const c =
        ((s >>> nb[0]) & 1) + ((s >>> nb[1]) & 1) + ((s >>> nb[2]) & 1) + ((s >>> nb[3]) & 1) +
        ((s >>> nb[4]) & 1) + ((s >>> nb[5]) & 1) + ((s >>> nb[6]) & 1) + ((s >>> nb[7]) & 1);
      if (table[(((s >>> i) & 1) << 4) | c]) out |= 1 << i;
    }
    succ[s] = out >>> 0;
  }
  return succ;
}

export function analyzeStateSpace(w: number, h: number, rule: Rule | string = 'B3/S23'): StateSpace {
  const succ = successorTable(w, h, rule);
  const count = succ.length;
  const indeg = new Uint32Array(count);
  for (let s = 0; s < count; s++) indeg[succ[s]]++;

  // Find cycles: walk from every unvisited state, marking the current path.
  const NONE = 0xffffffff;
  const basinOf = new Uint32Array(count).fill(NONE);
  const onCycle = new Uint8Array(count);
  const pathMark = new Uint32Array(count).fill(NONE);
  const basins: Basin[] = [];
  const path: number[] = [];
  for (let s0 = 0; s0 < count; s0++) {
    if (basinOf[s0] !== NONE) continue;
    path.length = 0;
    let s = s0;
    while (basinOf[s] === NONE && pathMark[s] !== s0) {
      pathMark[s] = s0;
      path.push(s);
      s = succ[s];
    }
    let b: number;
    if (basinOf[s] === NONE) {
      // New cycle found starting at s.
      b = basins.length;
      const cycle: number[] = [];
      let c = s;
      do {
        cycle.push(c);
        onCycle[c] = 1;
        c = succ[c];
      } while (c !== s);
      basins.push({ id: b, cycle, size: 0, maxDepth: 0, gardens: 0 });
    } else b = basinOf[s];
    for (const p of path) basinOf[p] = b;
  }

  // Depth = distance to the cycle, computed by BFS backwards from cycles.
  const preds = predecessorLists(succ);
  const depth = new Uint16Array(count);
  const queue = new Uint32Array(count);
  let qh = 0, qt = 0;
  for (let s = 0; s < count; s++) if (onCycle[s]) queue[qt++] = s;
  while (qh < qt) {
    const s = queue[qh++];
    for (let k = preds.start[s]; k < preds.start[s + 1]; k++) {
      const p = preds.list[k];
      if (onCycle[p]) continue;
      depth[p] = depth[s] + 1;
      queue[qt++] = p;
    }
  }

  let gardensOfEden = 0;
  for (let s = 0; s < count; s++) {
    const b = basins[basinOf[s]];
    b.size++;
    if (depth[s] > b.maxDepth) b.maxDepth = depth[s];
    if (!indeg[s]) {
      b.gardens++;
      gardensOfEden++;
    }
  }
  return { w, h, count, succ, indeg, depth, basinOf, onCycle, basins, gardensOfEden };
}

export interface PredLists {
  start: Uint32Array;
  list: Uint32Array;
}

/** Compressed predecessor lists (CSR format). */
export function predecessorLists(succ: Uint32Array): PredLists {
  const count = succ.length;
  const start = new Uint32Array(count + 1);
  for (let s = 0; s < count; s++) start[succ[s] + 1]++;
  for (let i = 0; i < count; i++) start[i + 1] += start[i];
  const fill = start.slice(0, count);
  const list = new Uint32Array(count);
  for (let s = 0; s < count; s++) list[fill[succ[s]]++] = s;
  return { start, list };
}

export interface BasinLayout {
  nodes: Uint32Array;
  x: Float32Array;
  y: Float32Array;
  parentIndex: Int32Array; // index into nodes of the successor, -1 none
  maxDepth: number;
}

/**
 * Radial layout of one basin: cycle states on an inner ring, each transient
 * tree fanned out in an angular wedge proportional to its number of leaves.
 */
export function layoutBasin(space: StateSpace, basinId: number, preds?: PredLists): BasinLayout {
  const P = preds ?? predecessorLists(space.succ);
  const basin = space.basins[basinId];
  const nodes: number[] = [];
  const index = new Map<number, number>();
  const leaves = new Map<number, number>();

  // Post-order leaf counting without recursion.
  const countLeaves = (root: number): number => {
    const stack: [number, boolean][] = [[root, false]];
    while (stack.length) {
      const [s, expanded] = stack.pop()!;
      const kids: number[] = [];
      for (let k = P.start[s]; k < P.start[s + 1]; k++) if (!space.onCycle[P.list[k]]) kids.push(P.list[k]);
      if (!expanded) {
        stack.push([s, true]);
        for (const c of kids) stack.push([c, false]);
      } else {
        leaves.set(s, kids.length ? kids.reduce((a, c) => a + leaves.get(c)!, 0) : 1);
      }
    }
    return leaves.get(root)!;
  };

  const cyc = basin.cycle;
  const weights = cyc.map((c) => countLeaves(c));
  const total = weights.reduce((a, b) => a + b, 0);
  const xs: number[] = [];
  const ys: number[] = [];
  const parents: number[] = [];
  const r0 = cyc.length > 1 ? 0.12 : 0.0;
  const dr = (1 - r0) / Math.max(1, basin.maxDepth);

  let angle = -Math.PI / 2;
  cyc.forEach((c, ci) => {
    const span = (weights[ci] / total) * Math.PI * 2;
    const stack: { s: number; a0: number; a1: number; d: number; parent: number }[] = [
      { s: c, a0: angle, a1: angle + span, d: 0, parent: -1 },
    ];
    while (stack.length) {
      const { s, a0, a1, d, parent } = stack.pop()!;
      const mid = cyc.length > 1 && d === 0 ? angle + span / 2 : (a0 + a1) / 2;
      const r = r0 + d * dr;
      const idx = nodes.length;
      nodes.push(s);
      index.set(s, idx);
      xs.push(Math.cos(mid) * r);
      ys.push(Math.sin(mid) * r);
      parents.push(parent);
      const kids: number[] = [];
      for (let k = P.start[s]; k < P.start[s + 1]; k++) if (!space.onCycle[P.list[k]]) kids.push(P.list[k]);
      const lw = leaves.get(s)!;
      let a = a0;
      for (const k of kids) {
        const sp = ((a1 - a0) * leaves.get(k)!) / lw;
        stack.push({ s: k, a0: a, a1: a + sp, d: d + 1, parent: idx });
        a += sp;
      }
    }
    angle += span;
  });
  // Cycle nodes point to their successor on the cycle.
  cyc.forEach((c) => {
    parents[index.get(c)!] = cyc.length > 1 ? index.get(space.succ[c])! : -1;
  });
  return {
    nodes: Uint32Array.from(nodes),
    x: Float32Array.from(xs),
    y: Float32Array.from(ys),
    parentIndex: Int32Array.from(parents),
    maxDepth: basin.maxDepth,
  };
}

export function stateToGrid(s: number, w: number, h: number): number[][] {
  const g: number[][] = [];
  for (let y = 0; y < h; y++) {
    const row: number[] = [];
    for (let x = 0; x < w; x++) row.push((s >>> (y * w + x)) & 1);
    g.push(row);
  }
  return g;
}

export function popcount(s: number): number {
  s = s - ((s >>> 1) & 0x55555555);
  s = (s & 0x33333333) + ((s >>> 2) & 0x33333333);
  return (((s + (s >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
