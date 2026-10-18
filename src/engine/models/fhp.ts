/**
 * FHP lattice gas (Frisch, Hasslacher & Pomeau, 1986).
 * Particles live on a hexagonal lattice with at most one particle per cell
 * per direction (6 bits). Each step they collide (conserving mass and
 * momentum) and then stream to the neighbouring cell. Averaged over many
 * cells, the gas obeys the Navier–Stokes equations of fluid flow.
 *
 * The hex lattice is stored as offset rows: odd rows are shifted half a
 * cell to the right. Directions: 0 E, 1 NE, 2 NW, 3 W, 4 SW, 5 SE
 * (screen coordinates, y down).
 */
export const DIR_X = [1, 0.5, -0.5, -1, -0.5, 0.5];
export const DIR_Y = [0, -Math.sqrt(3) / 2, -Math.sqrt(3) / 2, 0, Math.sqrt(3) / 2, Math.sqrt(3) / 2];

const rot = (s: number, k: number) => ((s << k) | (s >> (6 - k))) & 63;

/** Two collision tables, one per chirality (rotate +60° or −60°). */
export function collisionTables(): [Uint8Array, Uint8Array] {
  const a = new Uint8Array(64), b = new Uint8Array(64);
  for (let s = 0; s < 64; s++) {
    a[s] = b[s] = s;
  }
  for (let d = 0; d < 3; d++) {
    const pair = (1 << d) | (1 << (d + 3));
    // Head-on pair: rotate the pair by ±60°.
    a[pair] = rot(pair, 1);
    b[pair] = rot(pair, 5);
    // Two head-on pairs (4 particles, zero momentum): rotate likewise.
    const quad = 63 ^ pair;
    a[quad] = rot(quad, 1);
    b[quad] = rot(quad, 5);
  }
  // Symmetric triples swap.
  a[0b010101] = b[0b010101] = 0b101010;
  a[0b101010] = b[0b101010] = 0b010101;
  return [a, b];
}

export function momentum(s: number): [number, number] {
  let x = 0, y = 0;
  for (let d = 0; d < 6; d++) if (s & (1 << d)) { x += DIR_X[d]; y += DIR_Y[d]; }
  return [x, y];
}

export function bits(s: number): number {
  let n = 0;
  while (s) { n += s & 1; s >>= 1; }
  return n;
}

export class FHP {
  cells: Uint8Array;
  private next: Uint8Array;
  readonly solid: Uint8Array;
  private nb: Int32Array[];
  private tables = collisionTables();
  /** Probability per cell per step of turning a W-mover into an E-mover. */
  force = 0.02;
  generation = 0;
  constructor(readonly w: number, readonly h: number, private rng: () => number = Math.random) {
    this.cells = new Uint8Array(w * h);
    this.next = new Uint8Array(w * h);
    this.solid = new Uint8Array(w * h);
    this.nb = [];
    for (let d = 0; d < 6; d++) this.nb.push(new Int32Array(w * h));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const odd = y & 1;
        const wrapX = (v: number) => (v + w) % w;
        const wrapY = (v: number) => (v + h) % h;
        this.nb[0][i] = y * w + wrapX(x + 1);
        this.nb[3][i] = y * w + wrapX(x - 1);
        this.nb[1][i] = wrapY(y - 1) * w + wrapX(odd ? x + 1 : x);
        this.nb[2][i] = wrapY(y - 1) * w + wrapX(odd ? x : x - 1);
        this.nb[4][i] = wrapY(y + 1) * w + wrapX(odd ? x : x - 1);
        this.nb[5][i] = wrapY(y + 1) * w + wrapX(odd ? x + 1 : x);
      }
  }

  /** Fill fluid cells with density rho per channel and a slight eastward bias. */
  fill(rho: number, bias = 0) {
    for (let i = 0; i < this.cells.length; i++) {
      if (this.solid[i]) { this.cells[i] = 0; continue; }
      let s = 0;
      for (let d = 0; d < 6; d++) {
        const p = rho * (1 + bias * DIR_X[d]);
        if (this.rng() < p) s |= 1 << d;
      }
      this.cells[i] = s;
    }
  }

  get mass(): number {
    let m = 0;
    for (let i = 0; i < this.cells.length; i++) m += bits(this.cells[i]);
    return m;
  }

  step() {
    const { cells, next, solid, rng, force } = this;
    const [ta, tb] = this.tables;
    const n = cells.length;
    next.fill(0);
    const nb0 = this.nb[0], nb1 = this.nb[1], nb2 = this.nb[2], nb3 = this.nb[3], nb4 = this.nb[4], nb5 = this.nb[5];
    for (let i = 0; i < n; i++) {
      let s = cells[i];
      if (!s) continue;
      if (solid[i]) s = rot(s, 3); // bounce back
      else {
        s = rng() < 0.5 ? ta[s] : tb[s];
        if (force > 0 && (s & 8) && !(s & 1) && rng() < force) s = (s & ~8) | 1;
      }
      if (s & 1) next[nb0[i]] |= 1;
      if (s & 2) next[nb1[i]] |= 2;
      if (s & 4) next[nb2[i]] |= 4;
      if (s & 8) next[nb3[i]] |= 8;
      if (s & 16) next[nb4[i]] |= 16;
      if (s & 32) next[nb5[i]] |= 32;
    }
    this.next = cells;
    this.cells = next;
    this.generation++;
  }

  /** Coarse-grained velocity field over b×b blocks (fluid cells only). */
  velocity(b: number, ux: Float32Array, uy: Float32Array, rho: Float32Array) {
    const bw = Math.floor(this.w / b), bh = Math.floor(this.h / b);
    ux.fill(0); uy.fill(0); rho.fill(0);
    const cnt = new Uint16Array(bw * bh);
    for (let y = 0; y < bh * b; y++)
      for (let x = 0; x < bw * b; x++) {
        const i = y * this.w + x;
        if (this.solid[i]) continue;
        const k = ((y / b) | 0) * bw + ((x / b) | 0);
        const s = this.cells[i];
        cnt[k]++;
        if (!s) continue;
        for (let d = 0; d < 6; d++) if (s & (1 << d)) { ux[k] += DIR_X[d]; uy[k] += DIR_Y[d]; rho[k]++; }
      }
    for (let k = 0; k < bw * bh; k++) if (cnt[k]) { ux[k] /= cnt[k]; uy[k] /= cnt[k]; rho[k] /= cnt[k]; }
  }
}
