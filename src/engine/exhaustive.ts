/**
 * Exhaustive study of every pattern that fits in an n×n box.
 *
 * Two patterns that differ by a rotation or reflection behave the same way,
 * so we keep one representative per orbit of the dihedral group D4 (the 8
 * symmetries of the square). Burnside's lemma counts the orbits:
 *   |orbits| = (1/|G|) Σ_g |Fix(g)|,  |Fix(g)| = 2^(number of cycles of g on the cells).
 * Each representative is then run to its fate on an open plane.
 */
import { type Cell, evolveSparse } from './life';

/** The 8 symmetries of the n×n square as index permutations. */
export function squareSymmetries(n: number): Int32Array[] {
  const maps: ((x: number, y: number) => [number, number])[] = [
    (x, y) => [x, y],
    (x, y) => [n - 1 - y, x],
    (x, y) => [n - 1 - x, n - 1 - y],
    (x, y) => [y, n - 1 - x],
    (x, y) => [n - 1 - x, y],
    (x, y) => [x, n - 1 - y],
    (x, y) => [y, x],
    (x, y) => [n - 1 - y, n - 1 - x],
  ];
  return maps.map((f) => {
    const p = new Int32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const [u, v] = f(x, y); p[y * n + x] = v * n + u; }
    return p;
  });
}

/** Burnside's count of n×n binary patterns up to rotation and reflection. */
export function burnsideCount(n: number): bigint {
  let total = 0n;
  for (const p of squareSymmetries(n)) {
    const seen = new Uint8Array(n * n);
    let cycles = 0;
    for (let i = 0; i < n * n; i++) {
      if (seen[i]) continue;
      cycles++;
      for (let j = i; !seen[j]; j = p[j]) seen[j] = 1;
    }
    total += 1n << BigInt(cycles);
  }
  return total / 8n;
}

/** One representative bitmask (the smallest in its orbit) per orbit, for n ≤ 5. */
export function orbitRepresentatives(n: number): number[] {
  if (n > 5) throw new Error('n ≤ 5 only');
  const syms = squareSymmetries(n);
  const N = n * n;
  const reps: number[] = [];
  for (let m = 0; m < 2 ** N; m++) {
    let isMin = true;
    for (let s = 1; s < 8 && isMin; s++) {
      let t = 0;
      for (let i = 0; i < N; i++) if ((m >>> i) & 1) t |= 1 << syms[s][i];
      if ((t >>> 0) < m) isMin = false;
    }
    if (isMin) reps.push(m);
  }
  return reps;
}

export function maskToCells(mask: number, n: number): Cell[] {
  const cells: Cell[] = [];
  for (let i = 0; i < n * n; i++) if ((mask >>> i) & 1) cells.push([i % n, Math.floor(i / n)]);
  return cells;
}

export type Fate = 'dies' | 'still' | 'oscillates' | 'unsettled';

export interface FateResult {
  fate: Fate;
  /** Generation at which the final cycle (or extinction) begins. */
  lifespan: number;
  period: number;
  finalPopulation: number;
  maxPopulation: number;
  /** Whether anything (gliders) flew off and was removed at the edge. */
  escaped: boolean;
  /** How many objects flew off (not kept in the 4×4 census cache). */
  escapes?: number;
}

/**
 * Run a small pattern on a bounded 192×192 field. Cells that reach the
 * edge zone are removed (they are escaping spaceships), so the rest
 * eventually repeats exactly; the repeat is found by hashing every state.
 */

export class FateRunner {
  private readonly M = 5;
  private a: Uint8Array;
  private b: Uint8Array;

  /**
   * `S` is the side of the field; big methuselahs need more room than the 4×4
   * census. With `cull`, a spaceship is removed as soon as nothing lies ahead
   * of it, instead of when it reaches the edge. Then a glider still in flight
   * doesn't hold up the repeat, so the lifespan is the generation the rest
   * settles, and the field's box stays small, so long runs stay fast.
   */
  constructor(private readonly S = 192, private readonly cull = false) {
    this.a = new Uint8Array(S * S);
    this.b = new Uint8Array(S * S);
  }

  /**
   * `onProgress(g)` is called every 500 generations, for long runs in a
   * worker. `pops`, when given, collects the population of each generation.
   */
  run(cells: Cell[], maxGen = 3000, onProgress?: (gen: number) => void, pops?: number[]): FateResult {
    const { S, M } = this;
    // Both buffers must start empty (an earlier run may have returned mid-swap).
    this.a.fill(0);
    this.b.fill(0);
    let a = this.a, b = this.b;
    // Centre the pattern; it must fit well inside the edge margin.
    let mx = Infinity, my = Infinity, Mx = -Infinity, My = -Infinity;
    for (const [x, y] of cells) { mx = Math.min(mx, x); my = Math.min(my, y); Mx = Math.max(Mx, x); My = Math.max(My, y); }
    if (!cells.length) { mx = my = Mx = My = 0; }
    if (Mx - mx > S / 2 || My - my > S / 2) throw new Error('pattern too large for FateRunner');
    const ox = S / 2 - 2 - Math.floor((Mx - mx) / 2) - mx, oy = S / 2 - 2 - Math.floor((My - my) / 2) - my;
    for (const [x, y] of cells) a[(y + oy) * S + x + ox] = 1;
    let x0 = mx + ox, y0 = my + oy, x1 = Mx + ox, y1 = My + oy;
    const seen = new Map<number, number>();
    let pop = cells.length, maxPop = pop, escaped = false, escapes = 0;
    const hashState = () => {
      let h = 2166136261 ^ pop;
      let mx = S, my = S;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (a[y * S + x]) { if (y < my) my = y; if (x < mx) mx = x; }
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          if (a[y * S + x]) h = Math.imul(h ^ ((y - my) * 1024 + (x - mx) + y * 7919 + x * 104729), 16777619);
      return h >>> 0;
    };
    for (let g = 0; g <= maxGen; g++) {
      if (pop === 0) return { fate: 'dies', lifespan: g, period: 0, finalPopulation: 0, maxPopulation: maxPop, escaped, escapes };
      // Ships already flying clear (by a small margin) are left out of the
      // state, so the repeat is found when the rest settles, not when they are removed.
      let h: number, flying = 0, flyingCells = 0;
      if (this.cull && pop) {
        const ships = freeShips(a, S, x0, y0, x1, y1, HASH_MARGIN);
        let out = 0;
        for (const comp of ships) for (const i of comp) { a[i] = 0; out++; }
        pop -= out;
        h = hashState();
        pop += out;
        flying = ships.length;
        flyingCells = out;
        for (const comp of ships) for (const i of comp) a[i] = 1;
      } else h = hashState();
      const prev = seen.get(h);
      if (prev !== undefined) {
        const period = g - prev;
        // Ships still in flight have escaped too.
        return { fate: period === 1 ? 'still' : 'oscillates', lifespan: prev, period, finalPopulation: pop - flyingCells, maxPopulation: maxPop, escaped: escaped || flying > 0, escapes: escapes + flying };
      }
      seen.set(h, g);
      pops?.push(pop);
      if (g === maxGen) break;
      if (onProgress && g % 500 === 0) onProgress(g);
      // Step the bounding box plus one.
      const nx0 = Math.max(1, x0 - 1), ny0 = Math.max(1, y0 - 1), nx1 = Math.min(S - 2, x1 + 1), ny1 = Math.min(S - 2, y1 + 1);
      let bx0 = S, by0 = S, bx1 = -1, by1 = -1;
      let hitEdge = -1;
      pop = 0;
      for (let y = ny0; y <= ny1; y++)
        for (let x = nx0; x <= nx1; x++) {
          const i = y * S + x;
          const n = a[i - S - 1] + a[i - S] + a[i - S + 1] + a[i - 1] + a[i + 1] + a[i + S - 1] + a[i + S] + a[i + S + 1];
          const v = n === 3 || (n === 2 && a[i]) ? 1 : 0;
          b[i] = v;
          if (v) {
            pop++;
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
            if (hitEdge < 0 && (x < M || y < M || x >= S - M || y >= S - M)) hitEdge = i;
          }
        }
      // Every live cell of `a` is inside its box, so this leaves `a` all zero for reuse.
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * S + x] = 0;
      [a, b] = [b, a];
      if (hitEdge >= 0) {
        // Something reached the edge: remove its whole object (cells linked within distance 2), a departing spaceship.
        escaped = true;
        escapes++;
        const stack = [hitEdge];
        a[hitEdge] = 0;
        let removed = 1;
        while (stack.length) {
          const i = stack.pop()!;
          const cx = i % S, cy = (i - cx) / S;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const xx = cx + dx, yy = cy + dy;
              if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
              const j = yy * S + xx;
              if (a[j]) { a[j] = 0; removed++; stack.push(j); }
            }
        }
        pop -= removed;
        bx0 = S; by0 = S; bx1 = -1; by1 = -1;
        for (let y = ny0; y <= ny1; y++)
          for (let x = nx0; x <= nx1; x++)
            if (a[y * S + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      }
      if (pop) { x0 = bx0; y0 = by0; x1 = bx1; y1 = by1; }
      if (this.cull && pop && g % CULL_EVERY === 0) {
        const gone = freeShips(a, S, x0, y0, x1, y1, CULL_MARGIN);
        if (gone.length) {
          escaped = true;
          escapes += gone.length;
          for (const comp of gone) { for (const i of comp) a[i] = 0; pop -= comp.length; }
          bx0 = S; by0 = S; bx1 = -1; by1 = -1;
          for (let y = y0; y <= y1; y++)
            for (let x = x0; x <= x1; x++)
              if (a[y * S + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
          if (pop) { x0 = bx0; y0 = by0; x1 = bx1; y1 = by1; }
        }
      }
      if (pop > maxPop) maxPop = pop;
    }
    this.a = a; this.b = b;
    return { fate: 'unsettled', lifespan: maxGen, period: 0, finalPopulation: pop, maxPopulation: maxPop, escaped, escapes };
  }
}

// Ships are removed once nothing is within 16 cells ahead of them (a smaller
// margin lets growing debris catch a glider that was taken away too soon, and
// the R-pentomino then ends early), but left out of the state from 4 cells.
const CULL_EVERY = 2, CULL_MARGIN = 16, HASH_MARGIN = 4;
/** Shapes seen before (relative to their corner) and how far they move in 4 generations, or null if they aren't a spaceship. */
const moves = new Map<string, [number, number] | null>();
function shipMove(cells: Cell[]): [number, number] | null {
  let ax = Infinity, ay = Infinity;
  for (const [x, y] of cells) { if (x < ax) ax = x; if (y < ay) ay = y; }
  const shape = cells.map(([x, y]) => (y - ay) * 256 + (x - ax)).sort((p, q) => p - q).join(',');
  const known = moves.get(shape);
  if (known !== undefined) return known;
  let move: [number, number] | null = null;
  const later = evolveSparse(cells, 4);
  if (later.length === cells.length) {
    let bx = Infinity, by = Infinity;
    for (const [x, y] of later) { if (x < bx) bx = x; if (y < by) by = y; }
    const mx = bx - ax, my = by - ay;
    const before = new Set(cells.map(([x, y]) => `${x + mx},${y + my}`));
    if ((mx || my) && later.every(([x, y]) => before.has(`${x},${y}`))) move = [mx, my];
  }
  if (moves.size < 20000) moves.set(shape, move);
  return move;
}

/**
 * Removes small spaceships near the edge of the box that are flying away with
 * nothing ahead of them. A component (cells linked within distance 2) of at
 * most 40 cells that is back in its own shape four generations later, moved,
 * is a spaceship. It can only ever hit a cell that is ahead of it on every
 * axis it moves along (with a margin of 4), so when no other cell is, it is
 * gone for good.
 */
function freeShips(a: Uint8Array, S: number, x0: number, y0: number, x1: number, y1: number, MARGIN: number): number[][] {
  const EDGE = 6;
  const seen = new Set<number>();
  const found: number[][] = [];
  let live: number[] | null = null;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x - x0 >= EDGE && x1 - x >= EDGE && y - y0 >= EDGE && y1 - y >= EDGE) continue;
      const i0 = y * S + x;
      if (!a[i0] || seen.has(i0)) continue;
      // Flood the component.
      const comp: number[] = [i0];
      seen.add(i0);
      for (let k = 0; k < comp.length && comp.length <= 40; k++) {
        const i = comp[k], cx = i % S, cy = (i - cx) / S;
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = cx + dx, yy = cy + dy;
            if (xx < x0 || yy < y0 || xx > x1 || yy > y1) continue;
            const j = yy * S + xx;
            if (a[j] && !seen.has(j)) { seen.add(j); comp.push(j); }
          }
      }
      if (comp.length > 40) continue;
      const cells: Cell[] = comp.map((i) => [i % S, (i - (i % S)) / S]);
      const move = shipMove(cells);
      if (!move) continue;
      const [mx, my] = move;
      const min = (cs: Cell[], d: 0 | 1) => cs.reduce((m, c) => Math.min(m, c[d]), Infinity);
      // Anything ahead of it on every axis it moves along?
      const sx = Math.sign(mx), sy = Math.sign(my);
      const lo = (d: 0 | 1) => min(cells, d), hi = (d: 0 | 1) => -min(cells.map((c) => [-c[0], -c[1]] as Cell), d);
      const front = [sx > 0 ? hi(0) : lo(0), sy > 0 ? hi(1) : lo(1)];
      const band = [lo(0) - MARGIN, hi(0) + MARGIN, lo(1) - MARGIN, hi(1) + MARGIN];
      if (!live) {
        live = [];
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (a[yy * S + xx]) live.push(yy * S + xx);
      }
      const mine = new Set(comp);
      let blocked = false;
      for (const j of live) {
        if (mine.has(j)) continue;
        const xx = j % S, yy = (j - xx) / S;
        const aheadX = sx ? (xx - front[0]) * sx >= -MARGIN : xx >= band[0] && xx <= band[1];
        const aheadY = sy ? (yy - front[1]) * sy >= -MARGIN : yy >= band[2] && yy <= band[3];
        if (aheadX && aheadY) { blocked = true; break; }
      }
      if (!blocked) found.push(comp);
    }
  return found;
}

/** How a pattern ends, in words a reader would use. */
export type Outcome = 'vanishes' | 'flies' | 'still' | 'oscillator' | 'gliders' | 'unsettled';

export const OUTCOME_INFO: Record<Outcome, { label: string; colour: string }> = {
  vanishes: { label: 'Vanishes', colour: '--muted' },
  flies: { label: 'Flies away', colour: '--data-indigo' },
  still: { label: 'Settles to still lifes', colour: '--data-pine' },
  oscillator: { label: 'Settles to oscillators', colour: '--data-plum' },
  gliders: { label: 'Settles and fires gliders', colour: '--data-ochre' },
  unsettled: { label: 'Not settled yet', colour: '--data-shu' },
};

export function outcomeOf(r: FateResult): Outcome {
  if (r.fate === 'unsettled') return 'unsettled';
  if (r.fate === 'dies') return r.escaped ? 'flies' : 'vanishes';
  if (r.escaped) return 'gliders';
  return r.fate === 'still' ? 'still' : 'oscillator';
}

export interface BoxRecord extends FateResult {
  mask: number;
  cells: number;
  outcome: Outcome;
}

/** Run every orbit representative of the n×n box (in [from, to)) to its fate. */
export function boxCensus(reps: number[], n: number, from: number, to: number, maxGen = 6000, runner = new FateRunner()): BoxRecord[] {
  const out: BoxRecord[] = [];
  for (let k = from; k < Math.min(to, reps.length); k++) {
    const mask = reps[k];
    const cells = maskToCells(mask, n);
    const r = runner.run(cells, maxGen);
    out.push({ ...r, mask, cells: cells.length, outcome: outcomeOf(r) });
  }
  return out;
}
