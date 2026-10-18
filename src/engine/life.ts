import { type Rule, parseRule, ruleTable } from './rules';

export type Cell = [number, number];

export interface StepStats {
  births: number;
  deaths: number;
  population: number;
}

/**
 * A finite Life universe: a w x h grid that is either toroidal (edges wrap)
 * or bounded (cells beyond the edge are permanently dead).
 *
 * Besides the binary state it keeps two per-cell channels for rendering:
 *  - `age`:   how many generations a live cell has been alive (saturates at 255)
 *  - `trail`: a fading "afterglow" left where a cell died (255 -> 0)
 */
export class Life {
  readonly w: number;
  readonly h: number;
  cells: Uint8Array;
  age: Uint8Array;
  trail: Uint8Array;
  generation = 0;
  wrap = true;
  trailDecay = 10;
  private next: Uint8Array;
  private table: Uint8Array;
  private _rule: Rule;

  constructor(w: number, h: number, rule: Rule | string = 'B3/S23') {
    this.w = w;
    this.h = h;
    const n = w * h;
    this.cells = new Uint8Array(n);
    this.next = new Uint8Array(n);
    this.age = new Uint8Array(n);
    this.trail = new Uint8Array(n);
    this._rule = typeof rule === 'string' ? parseRule(rule) : rule;
    this.table = ruleTable(this._rule);
  }

  get rule(): Rule {
    return this._rule;
  }

  set rule(r: Rule) {
    this._rule = r;
    this.table = ruleTable(r);
  }

  get(x: number, y: number): number {
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.cells[y * this.w + x];
  }

  set(x: number, y: number, v: number): void {
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.cells[i] = v ? 1 : 0;
    if (v) {
      if (!this.age[i]) this.age[i] = 1;
    } else this.age[i] = 0;
  }

  clear(): void {
    this.cells.fill(0);
    this.age.fill(0);
    this.trail.fill(0);
    this.generation = 0;
  }

  randomize(density: number, rng: () => number = Math.random): void {
    this.clear();
    for (let i = 0; i < this.cells.length; i++) {
      if (rng() < density) {
        this.cells[i] = 1;
        this.age[i] = 1;
      }
    }
  }

  population(): number {
    let p = 0;
    for (let i = 0; i < this.cells.length; i++) p += this.cells[i];
    return p;
  }

  /** Place cells relative to (ox, oy). */
  stamp(cells: Cell[], ox: number, oy: number, value = 1): void {
    for (const [x, y] of cells) this.set(ox + x, oy + y, value);
  }

  liveCells(): Cell[] {
    const out: Cell[] = [];
    for (let y = 0; y < this.h; y++) {
      const row = y * this.w;
      for (let x = 0; x < this.w; x++) if (this.cells[row + x]) out.push([x, y]);
    }
    return out;
  }

  /**
   * Advance one generation. The neighbour sum is computed with a sliding
   * window over three rows, so each cell costs a handful of additions.
   */
  step(): StepStats {
    const { w, h, cells, next, table, age, trail, wrap } = this;
    let births = 0;
    let deaths = 0;
    let population = 0;
    for (let y = 0; y < h; y++) {
      const yu = y === 0 ? (wrap ? h - 1 : -1) : y - 1;
      const yd = y === h - 1 ? (wrap ? 0 : -1) : y + 1;
      const rU = yu * w;
      const rC = y * w;
      const rD = yd * w;
      const colSum = (x: number): number => {
        if (x < 0 || x >= w) {
          if (!wrap) return 0;
          x = (x + w) % w;
        }
        return (yu >= 0 ? cells[rU + x] : 0) + cells[rC + x] + (yd >= 0 ? cells[rD + x] : 0);
      };
      let left = colSum(-1);
      let mid = colSum(0);
      for (let x = 0; x < w; x++) {
        const right = colSum(x + 1);
        const i = rC + x;
        const alive = cells[i];
        const n = left + mid + right - alive;
        const v = table[(alive << 4) | n];
        next[i] = v;
        if (v) {
          population++;
          if (alive) {
            if (age[i] < 255) age[i]++;
          } else {
            births++;
            age[i] = 1;
            trail[i] = 0;
          }
        } else {
          if (alive) {
            deaths++;
            trail[i] = 255;
            age[i] = 0;
          } else if (trail[i]) {
            trail[i] = trail[i] > this.trailDecay ? trail[i] - this.trailDecay : 0;
          }
        }
        left = mid;
        mid = right;
      }
    }
    this.next = cells;
    this.cells = next;
    this.generation++;
    return { births, deaths, population };
  }

  /** 32-bit FNV-1a hash of the live cells, used for cycle detection. */
  hash(): number {
    let h = 0x811c9dc5;
    const c = this.cells;
    for (let i = 0; i < c.length; i++) {
      if (c[i]) {
        h ^= i;
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  }

  snapshot(): Uint8Array {
    return this.cells.slice();
  }

  restore(snap: Uint8Array, generation = 0): void {
    this.cells.set(snap);
    this.trail.fill(0);
    for (let i = 0; i < snap.length; i++) this.age[i] = snap[i] ? 1 : 0;
    this.generation = generation;
  }
}

/** Bounding box of a set of cells, or null when empty. */
export function bounds(cells: Cell[]): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!cells.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cells) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

/** Translate cells so the bounding box starts at (0, 0). */
export function normalize(cells: Cell[]): Cell[] {
  const b = bounds(cells);
  if (!b) return [];
  return cells.map(([x, y]) => [x - b.x0, y - b.y0] as Cell);
}

/**
 * Evolve a finite pattern on an effectively unbounded plane for `gens`
 * generations using a sparse set. Useful for tests and small analyses.
 */
export function evolveSparse(cells: Cell[], gens: number, rule: Rule | string = 'B3/S23'): Cell[] {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  if (r.birth[0]) throw new Error('B0 rules are not supported on an infinite plane');
  let live = new Set(cells.map(([x, y]) => key(x, y)));
  for (let g = 0; g < gens; g++) {
    const counts = new Map<number, number>();
    for (const k of live) {
      const [x, y] = unkey(k);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nk = key(x + dx, y + dy);
          counts.set(nk, (counts.get(nk) ?? 0) + 1);
        }
    }
    const nxt = new Set<number>();
    for (const [k, n] of counts) if (live.has(k) ? r.survive[n] : r.birth[n]) nxt.add(k);
    if (r.survive[0]) for (const k of live) if (!counts.has(k)) nxt.add(k);
    live = nxt;
  }
  return [...live].map(unkey);
}

const OFF = 1 << 15;
function key(x: number, y: number): number {
  return (x + OFF) * 65536 + (y + OFF);
}
function unkey(k: number): Cell {
  return [Math.floor(k / 65536) - OFF, (k % 65536) - OFF];
}
