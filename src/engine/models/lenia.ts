/**
 * Lenia (Bert Chan, 2019): a continuous Game of Life. Cells hold real
 * values in [0, 1]; each step convolves the world with a smooth ring
 * kernel K of radius R, maps the result through a bell-shaped growth
 * function G and adds G/T:
 *   A ← clip(A + (1/T)·G(K * A), 0, 1),  G(u) = 2·exp(−(u−μ)²/2σ²) − 1.
 * With μ = 0.15, σ = 0.015, R = 13 it supports "Orbium", a gliding
 * creature that looks and behaves like a microorganism.
 */
export interface LeniaParams {
  R: number;
  T: number;
  mu: number;
  sigma: number;
}

export const ORBIUM: LeniaParams = { R: 13, T: 10, mu: 0.15, sigma: 0.015 };

export class Lenia {
  A: Float32Array;
  private U: Float32Array;
  private kx: Int16Array;
  private ky: Int16Array;
  private kw: Float32Array;
  generation = 0;
  constructor(readonly w: number, readonly h: number, public p: LeniaParams = ORBIUM) {
    this.A = new Float32Array(w * h);
    this.U = new Float32Array(w * h);
    const xs: number[] = [], ys: number[] = [], ws: number[] = [];
    let sum = 0;
    for (let dy = -p.R; dy <= p.R; dy++)
      for (let dx = -p.R; dx <= p.R; dx++) {
        const r = Math.sqrt(dx * dx + dy * dy) / p.R;
        if (r <= 0 || r >= 1) continue;
        const k = Math.exp(4 - 1 / (r * (1 - r)));
        if (k < 1e-4) continue;
        xs.push(dx); ys.push(dy); ws.push(k); sum += k;
      }
    this.kx = Int16Array.from(xs);
    this.ky = Int16Array.from(ys);
    this.kw = Float32Array.from(ws.map((k) => k / sum));
  }

  get mass(): number {
    let m = 0;
    for (let i = 0; i < this.A.length; i++) m += this.A[i];
    return m;
  }

  /** Centre of mass on the torus (circular mean), or null for an empty world. */
  centre(): [number, number] | null {
    let cx = 0, sx = 0, cy = 0, sy = 0, m = 0;
    const { w, h } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const a = this.A[y * w + x];
        if (!a) continue;
        m += a;
        cx += a * Math.cos((2 * Math.PI * x) / w); sx += a * Math.sin((2 * Math.PI * x) / w);
        cy += a * Math.cos((2 * Math.PI * y) / h); sy += a * Math.sin((2 * Math.PI * y) / h);
      }
    if (m < 1e-6) return null;
    const ang = (s: number, c: number) => ((Math.atan2(s, c) / (2 * Math.PI)) + 1) % 1;
    return [ang(sx, cx) * w, ang(sy, cy) * h];
  }

  step() {
    const { w, h, A, U, kx, ky, kw, p } = this;
    const nk = kw.length;
    // Convolution (direct; the kernel has a few hundred taps).
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let u = 0;
        for (let k = 0; k < nk; k++) {
          let xx = x + kx[k], yy = y + ky[k];
          if (xx < 0) xx += w; else if (xx >= w) xx -= w;
          if (yy < 0) yy += h; else if (yy >= h) yy -= h;
          u += kw[k] * A[yy * w + xx];
        }
        U[y * w + x] = u;
      }
    const s2 = 2 * p.sigma * p.sigma, dt = 1 / p.T;
    for (let i = 0; i < A.length; i++) {
      const d = U[i] - p.mu;
      const g = 2 * Math.exp(-(d * d) / s2) - 1;
      const v = A[i] + dt * g;
      A[i] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    this.generation++;
  }

  /** Paint a patch of random values (seeded) centred at (cx, cy). */
  seedPatch(cx: number, cy: number, size: number, rng: () => number, density = 1, amp = 1) {
    for (let y = -size; y <= size; y++)
      for (let x = -size; x <= size; x++) {
        if (x * x + y * y > size * size || rng() > density) continue;
        const i = ((cy + y + this.h) % this.h) * this.w + ((cx + x + this.w) % this.w);
        this.A[i] = rng() * amp;
      }
  }
}

/** Orbium unicaudatus (Chan, 2019), 20×20 cells at R = 13. */
export const ORBIUM_CELLS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0.1, 0.14, 0.1, 0, 0, 0.03, 0.03, 0, 0, 0.3, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0.08, 0.24, 0.3, 0.3, 0.18, 0.14, 0.15, 0.16, 0.15, 0.09, 0.2, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0.15, 0.34, 0.44, 0.46, 0.38, 0.18, 0.14, 0.11, 0.13, 0.19, 0.18, 0.45, 0, 0, 0],
  [0, 0, 0, 0, 0.06, 0.13, 0.39, 0.5, 0.5, 0.37, 0.06, 0, 0, 0, 0.02, 0.16, 0.68, 0, 0, 0],
  [0, 0, 0, 0.11, 0.17, 0.17, 0.33, 0.4, 0.38, 0.28, 0.14, 0, 0, 0, 0, 0, 0.18, 0.42, 0, 0],
  [0, 0, 0.09, 0.18, 0.13, 0.06, 0.08, 0.26, 0.32, 0.32, 0.27, 0, 0, 0, 0, 0, 0, 0.82, 0, 0],
  [0.27, 0, 0.16, 0.12, 0, 0, 0, 0.25, 0.38, 0.44, 0.45, 0.34, 0, 0, 0, 0, 0, 0.22, 0.17, 0],
  [0, 0.07, 0.2, 0.02, 0, 0, 0, 0.31, 0.48, 0.57, 0.6, 0.57, 0, 0, 0, 0, 0, 0, 0.49, 0],
  [0, 0.59, 0.19, 0, 0, 0, 0, 0.2, 0.57, 0.69, 0.76, 0.76, 0.49, 0, 0, 0, 0, 0, 0.36, 0],
  [0, 0.58, 0.19, 0, 0, 0, 0, 0, 0.67, 0.83, 0.9, 0.92, 0.87, 0.12, 0, 0, 0, 0, 0.22, 0.07],
  [0, 0, 0.46, 0, 0, 0, 0, 0, 0.7, 0.93, 1, 1, 1, 0.61, 0, 0, 0, 0, 0.18, 0.11],
  [0, 0, 0.82, 0, 0, 0, 0, 0, 0.47, 1, 1, 0.98, 1, 0.96, 0.27, 0, 0, 0, 0.19, 0.1],
  [0, 0, 0.46, 0, 0, 0, 0, 0, 0.25, 1, 1, 0.84, 0.92, 0.97, 0.54, 0.14, 0.04, 0.1, 0.21, 0.05],
  [0, 0, 0, 0.4, 0, 0, 0, 0, 0.09, 0.8, 1, 0.82, 0.8, 0.85, 0.63, 0.31, 0.18, 0.19, 0.2, 0.01],
  [0, 0, 0, 0.36, 0.1, 0, 0, 0, 0.05, 0.54, 0.86, 0.79, 0.74, 0.72, 0.6, 0.39, 0.28, 0.24, 0.13, 0],
  [0, 0, 0, 0.01, 0.3, 0.07, 0, 0, 0.08, 0.36, 0.64, 0.7, 0.64, 0.6, 0.51, 0.39, 0.29, 0.19, 0.04, 0],
  [0, 0, 0, 0, 0.1, 0.24, 0.14, 0.1, 0.15, 0.29, 0.45, 0.53, 0.52, 0.46, 0.4, 0.31, 0.21, 0.08, 0, 0],
  [0, 0, 0, 0, 0, 0.08, 0.21, 0.21, 0.22, 0.29, 0.36, 0.39, 0.37, 0.33, 0.26, 0.18, 0.09, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0.03, 0.13, 0.19, 0.22, 0.24, 0.24, 0.23, 0.18, 0.13, 0.05, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.06, 0.08, 0.09, 0.07, 0.05, 0.01, 0, 0, 0, 0, 0],
];

/** Stamp a pattern (rows of values) with its top-left corner at (x0, y0), optionally rotated by quarter turns. */
export function stampPattern(L: Lenia, cells: number[][], x0: number, y0: number, quarterTurns = 0) {
  const n = cells.length, m = cells[0].length;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < m; c++) {
      let x = c, y = r;
      for (let q = 0; q < (quarterTurns & 3); q++) [x, y] = [n - 1 - y, x];
      const i = (((y0 + y) % L.h) + L.h) % L.h * L.w + ((((x0 + x) % L.w) + L.w) % L.w);
      L.A[i] = cells[r][c];
    }
}
