/**
 * The Abelian sandpile (Bak–Tang–Wiesenfeld, 1987).
 * Each site holds grains; a site with 4 or more topples, sending one grain
 * to each of its 4 neighbours. Grains that fall off the edge are lost.
 * The final stable state does not depend on the order of topplings (the
 * "abelian" property), and repeatedly adding single grains drives the pile
 * to a critical state where avalanche sizes follow a power law.
 */
export interface Avalanche {
  /** Number of topplings. */
  size: number;
  /** Number of distinct sites that toppled. */
  area: number;
  /** Grains lost over the edge. */
  lost: number;
}

export class Sandpile {
  readonly h: Int32Array;
  private stack: Int32Array;
  /** stamp[i] is the number of the last relaxation in which site i toppled. */
  readonly stamp: Uint32Array;
  epoch = 0;
  constructor(readonly w: number, readonly hgt: number) {
    this.h = new Int32Array(w * hgt);
    this.stack = new Int32Array(w * hgt * 4 + 16);
    this.stamp = new Uint32Array(w * hgt);
  }

  get grains(): number {
    let s = 0;
    for (let i = 0; i < this.h.length; i++) s += this.h[i];
    return s;
  }

  /** Add n grains at (x, y) and relax. */
  add(x: number, y: number, n = 1): Avalanche {
    const i = y * this.w + x;
    this.h[i] += n;
    return this.relax([i]);
  }

  /** Relax every unstable site. */
  stabilize(): Avalanche {
    const start: number[] = [];
    for (let i = 0; i < this.h.length; i++) if (this.h[i] >= 4) start.push(i);
    return this.relax(start);
  }

  private relax(start: number[]): Avalanche {
    const { w, hgt, h } = this;
    let stack = this.stack;
    let sp = 0;
    for (const i of start) if (h[i] >= 4) stack[sp++] = i;
    let size = 0, area = 0, lost = 0;
    const ep = ++this.epoch;
    while (sp > 0) {
      const i = stack[--sp];
      const v = h[i];
      if (v < 4) continue;
      const k = v >> 2; // topple k times at once
      h[i] = v & 3;
      size += k;
      if (this.stamp[i] !== ep) {
        this.stamp[i] = ep;
        area++;
      }
      const x = i % w, y = (i - x) / w;
      if (sp + 4 >= stack.length) {
        const bigger = new Int32Array(stack.length * 2);
        bigger.set(stack);
        stack = this.stack = bigger;
      }
      if (x > 0) { if ((h[i - 1] += k) >= 4 && h[i - 1] - k < 4) stack[sp++] = i - 1; } else lost += k;
      if (x < w - 1) { if ((h[i + 1] += k) >= 4 && h[i + 1] - k < 4) stack[sp++] = i + 1; } else lost += k;
      if (y > 0) { if ((h[i - w] += k) >= 4 && h[i - w] - k < 4) stack[sp++] = i - w; } else lost += k;
      if (y < hgt - 1) { if ((h[i + w] += k) >= 4 && h[i + w] - k < 4) stack[sp++] = i + w; } else lost += k;
    }
    return { size, area, lost };
  }
}

/**
 * The identity of the sandpile group on a w×h grid:
 * e = stab(6 − stab(6)), where 6 means 6 grains on every site.
 */
export function sandpileIdentity(w: number, h: number): Int32Array {
  const p = new Sandpile(w, h);
  p.h.fill(6);
  p.stabilize();
  for (let i = 0; i < p.h.length; i++) p.h[i] = 6 - p.h[i];
  p.stabilize();
  return p.h.slice();
}

/** Stable sum a ⊕ b = stab(a + b). */
export function sandpileAdd(a: Int32Array, b: Int32Array, w: number, h: number): Int32Array {
  const p = new Sandpile(w, h);
  for (let i = 0; i < a.length; i++) p.h[i] = a[i] + b[i];
  p.stabilize();
  return p.h.slice();
}

/** Logarithmically binned histogram for power-law data. Returns bin centres and densities. */
export function logBins(values: number[], binsPerDecade = 5): { x: number[]; y: number[] } {
  const pos = values.filter((v) => v > 0);
  if (!pos.length) return { x: [], y: [] };
  let max = 0;
  for (const v of pos) if (v > max) max = v;
  const nb = Math.ceil(Math.log10(max + 1) * binsPerDecade) + 1;
  const counts = new Array(nb).fill(0);
  for (const v of pos) counts[Math.floor(Math.log10(v) * binsPerDecade)]++;
  const x: number[] = [], y: number[] = [];
  for (let b = 0; b < nb; b++) {
    if (!counts[b]) continue;
    const lo = Math.pow(10, b / binsPerDecade), hi = Math.pow(10, (b + 1) / binsPerDecade);
    // Integer-valued data: count how many integers fall in [lo, hi).
    const width = Math.max(1, Math.ceil(hi) - Math.ceil(lo));
    x.push(Math.sqrt(lo * hi));
    y.push(counts[b] / pos.length / width);
  }
  return { x, y };
}

/** Least-squares slope and intercept of y on x. */
export function linearFit(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: y[0] ?? 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * Burning test (Dhar, 1990): a stable configuration is recurrent iff adding
 * one grain per edge to the sink and relaxing makes every site topple
 * exactly once and returns the same configuration.
 */
export function isRecurrent(c: ArrayLike<number>, w: number, h: number): boolean {
  const p = new Sandpile(w, h);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i - x) / w;
    p.h[i] = c[i] + (x === 0 ? 1 : 0) + (x === w - 1 ? 1 : 0) + (y === 0 ? 1 : 0) + (y === h - 1 ? 1 : 0);
  }
  const a = p.stabilize();
  if (a.size !== w * h) return false;
  for (let i = 0; i < w * h; i++) if (p.h[i] !== c[i]) return false;
  return true;
}

/**
 * Order of the sandpile group = det of the reduced Laplacian = number of
 * spanning trees of the grid with a wired boundary (Kirchhoff's matrix-tree
 * theorem). Exact, using fraction-free Bareiss elimination on BigInts.
 */
export function sandpileGroupOrder(w: number, h: number): bigint {
  const n = w * h;
  const m: bigint[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<bigint>(n).fill(0n);
    row[i] = 4n;
    const x = i % w, y = (i - x) / w;
    if (x > 0) row[i - 1] = -1n;
    if (x < w - 1) row[i + 1] = -1n;
    if (y > 0) row[i - w] = -1n;
    if (y < h - 1) row[i + w] = -1n;
    m.push(row);
  }
  let prev = 1n;
  for (let k = 0; k < n - 1; k++) {
    // The reduced Laplacian is diagonally dominant, so pivots never vanish.
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) m[i][j] = (m[i][j] * m[k][k] - m[i][k] * m[k][j]) / prev;
    }
    prev = m[k][k];
  }
  return m[n - 1][n - 1];
}
