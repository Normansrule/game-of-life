/**
 * Running Life backwards: search for predecessors ("parents") of a pattern.
 *
 * A parent of a target T is a pattern P with F(P) = T exactly, on the whole
 * plane. We look for parents whose live cells lie in a box B (T's bounding
 * box grown by a margin). Every cell whose neighbourhood touches B gives one
 * constraint: its next state must equal T there. The search assigns B's
 * cells one at a time in row-major order and, after each assignment,
 * checks that every affected constraint can still be met given how many of
 * its neighbours are already alive and how many are still unknown. That
 * pruning makes boxes of 50–100 cells practical.
 *
 * "No parent in the box" is not a proof that T is a Garden of Eden: a parent
 * might need live cells further out (they would have to die, but they can
 * still feed births at the edge). It is a proof for parents of that size.
 */
import type { Cell } from './life';
import { type Rule, parseRule } from './rules';

export interface PredecessorOptions {
  /** How far the search box extends beyond the target's bounding box. */
  margin?: number;
  /** Stop after this many parents. */
  maxSolutions?: number;
  /** Give up after this many search nodes. */
  maxNodes?: number;
  rule?: Rule | string;
}

export interface PredecessorResult {
  parents: Cell[][];
  /** True if the whole box was searched: then `parents` is complete (up to maxSolutions). */
  exhausted: boolean;
  /** True if the search stopped at maxSolutions. */
  capped: boolean;
  nodes: number;
  box: { x0: number; y0: number; w: number; h: number };
}

export function findPredecessors(target: Cell[], o: PredecessorOptions = {}): PredecessorResult {
  const margin = o.margin ?? 1;
  const maxSolutions = o.maxSolutions ?? 50;
  const maxNodes = o.maxNodes ?? 2_000_000;
  const rule = typeof o.rule === 'string' ? parseRule(o.rule) : o.rule ?? parseRule('B3/S23');

  let tx0 = 0, ty0 = 0, tx1 = -1, ty1 = -1;
  if (target.length) {
    tx0 = Math.min(...target.map((c) => c[0])); tx1 = Math.max(...target.map((c) => c[0]));
    ty0 = Math.min(...target.map((c) => c[1])); ty1 = Math.max(...target.map((c) => c[1]));
  }
  // Search box B, and the constraint region E = B grown by one.
  const x0 = tx0 - margin, y0 = ty0 - margin;
  const W = tx1 - tx0 + 1 + 2 * margin, H = ty1 - ty0 + 1 + 2 * margin;
  const box = { x0, y0, w: W, h: H };
  const EW = W + 2, EH = H + 2;
  const live = new Set(target.map(([x, y]) => `${x},${y}`));

  // Constraint k ↔ E cell (ex, ey) = B cell (ex - 1, ey - 1).
  const K = EW * EH;
  const want = new Uint8Array(K);
  const centre = new Int32Array(K).fill(-1);
  const liveN = new Uint8Array(K);
  const unkN = new Uint8Array(K);
  for (let ey = 0; ey < EH; ey++)
    for (let ex = 0; ex < EW; ex++) {
      const k = ey * EW + ex;
      const bx = ex - 1, by = ey - 1;
      want[k] = live.has(`${bx + x0},${by + y0}`) ? 1 : 0;
      if (bx >= 0 && by >= 0 && bx < W && by < H) centre[k] = by * W + bx;
    }
  // For each B cell, the constraints that count it as a neighbour, and the one where it is the centre.
  const nbOf: number[][] = [];
  for (let by = 0; by < H; by++)
    for (let bx = 0; bx < W; bx++) {
      const list: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const k = (by + 1 + dy) * EW + (bx + 1 + dx);
          list.push(k);
          unkN[k]++;
        }
      nbOf.push(list);
    }

  // feas[sState][want][live][unk]: can the constraint still be met? sState: 0 dead, 1 alive, 2 unknown.
  const feas = new Uint8Array(3 * 2 * 9 * 9);
  for (let s = 0; s < 3; s++)
    for (let w = 0; w < 2; w++)
      for (let l = 0; l <= 8; l++)
        for (let u = 0; l + u <= 8; u++) {
          let ok = false;
          for (const sv of s === 2 ? [0, 1] : [s])
            for (let n = l; n <= l + u && !ok; n++) if (((sv ? rule.survive[n] : rule.birth[n]) ? 1 : 0) === w) ok = true;
          feas[((s * 2 + w) * 9 + l) * 9 + u] = ok ? 1 : 0;
        }

  const N = W * H;
  const val = new Int8Array(N).fill(-1);
  const ok = (k: number) => {
    const c = centre[k];
    const s = c < 0 ? 0 : val[c] < 0 ? 2 : val[c];
    return feas[((s * 2 + want[k]) * 9 + liveN[k]) * 9 + unkN[k]] === 1;
  };
  // Check every constraint before starting (catches targets whose births are impossible at all).
  let feasible = true;
  for (let k = 0; k < K; k++) if (!ok(k)) { feasible = false; break; }

  const parents: Cell[][] = [];
  let nodes = 0, aborted = false;

  const centreK = new Int32Array(N);
  for (let k = 0; k < K; k++) if (centre[k] >= 0) centreK[centre[k]] = k;

  function assign(i: number, v: number): boolean {
    val[i] = v;
    let good = ok(centreK[i]);
    for (const k of nbOf[i]) {
      unkN[k]--;
      liveN[k] += v;
      if (good && !ok(k)) good = false;
    }
    return good;
  }
  function unassign(i: number, v: number) {
    for (const k of nbOf[i]) { unkN[k]++; liveN[k] -= v; }
    val[i] = -1;
  }

  function dfs(i: number) {
    if (aborted || parents.length >= maxSolutions) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    if (i === N) {
      const p: Cell[] = [];
      for (let j = 0; j < N; j++) if (val[j]) p.push([(j % W) + x0, Math.floor(j / W) + y0]);
      parents.push(p);
      return;
    }
    for (const v of [0, 1]) {
      if (assign(i, v)) dfs(i + 1);
      unassign(i, v);
      if (aborted || parents.length >= maxSolutions) return;
    }
  }
  if (feasible) dfs(0);
  const capped = parents.length >= maxSolutions;
  return { parents, exhausted: !aborted && !capped, capped, nodes, box };
}

/**
 * For every 3×3 pattern, count the 5×5 patterns whose next generation has
 * that pattern in the middle. 2^25 inputs, so this takes a second or two.
 * Index: bit (3y + x) of the 3×3 pattern.
 */
export function preimageCounts3x3(rule: Rule | string = 'B3/S23', from = 0, to = 1 << 25, counts = new Float64Array(512)): Float64Array {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  // Next state of a 3×3 window's centre, window bit (3y + x).
  const win = new Uint8Array(512);
  for (let w = 0; w < 512; w++) {
    let n = 0;
    for (let b = 0; b < 9; b++) if (b !== 4 && (w >> b) & 1) n++;
    win[w] = (w >> 4) & 1 ? (r.survive[n] ? 1 : 0) : r.birth[n] ? 1 : 0;
  }
  for (let m = from; m < to; m++) {
    let out = 0;
    for (let y = 0; y < 3; y++) {
      const rows = ((m >>> (5 * y)) & 31) | (((m >>> (5 * y + 5)) & 31) << 5) | (((m >>> (5 * y + 10)) & 31) << 10);
      for (let x = 0; x < 3; x++) {
        const w = ((rows >>> x) & 7) | (((rows >>> (x + 5)) & 7) << 3) | (((rows >>> (x + 10)) & 7) << 6);
        out |= win[w] << (3 * y + x);
      }
    }
    counts[out]++;
  }
  return counts;
}
