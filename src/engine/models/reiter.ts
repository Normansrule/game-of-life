/**
 * Reiter's snowflake model (C. A. Reiter, 2005) on a hexagonal lattice.
 * Each cell holds a water amount s. Cells with s ≥ 1 are ice. A cell is
 * receptive if it is ice or touches ice; receptive cells keep their water
 * and gain γ from the vapour, the rest diffuse with rate α. The boundary
 * holds vapour at level β. Changing (α, β, γ) gives plates, dendrites,
 * sectored stars and needles, much like Nakaya's diagram of real snow.
 *
 * Cells use axial coordinates (q, r) with |q|, |r|, |q + r| ≤ n.
 */
const NQ = [1, -1, 0, 0, 1, -1];
const NR = [0, 0, 1, -1, -1, 1];

export class Reiter {
  readonly size: number;
  s: Float64Array;
  private u: Float64Array;
  private next: Float64Array;
  private recv: Uint8Array;
  readonly inside: Uint8Array;
  steps = 0;
  /** Largest hex distance from the centre reached by ice. */
  radius = 0;
  constructor(readonly n: number, public alpha = 1, public beta = 0.4, public gamma = 0.001) {
    this.size = 2 * n + 1;
    const N = this.size * this.size;
    this.s = new Float64Array(N);
    this.u = new Float64Array(N);
    this.next = new Float64Array(N);
    this.recv = new Uint8Array(N);
    this.inside = new Uint8Array(N);
    for (let r = -n; r <= n; r++)
      for (let q = -n; q <= n; q++) if (Math.abs(q + r) <= n) this.inside[this.idx(q, r)] = 1;
    this.reset();
  }

  idx(q: number, r: number): number {
    return (r + this.n) * this.size + (q + this.n);
  }

  get(q: number, r: number): number {
    if (Math.abs(q) > this.n || Math.abs(r) > this.n || Math.abs(q + r) > this.n) return this.beta;
    return this.s[this.idx(q, r)];
  }

  reset() {
    for (let i = 0; i < this.s.length; i++) this.s[i] = this.inside[i] ? this.beta : 0;
    this.s[this.idx(0, 0)] = 1;
    this.steps = 0;
    this.radius = 0;
  }

  step() {
    const { n, s, u, next, recv, inside, size } = this;
    for (let r = -n; r <= n; r++)
      for (let q = -n; q <= n; q++) {
        const i = this.idx(q, r);
        if (!inside[i]) continue;
        let rc = s[i] >= 1 ? 1 : 0;
        for (let d = 0; d < 6 && !rc; d++) if (this.get(q + NQ[d], r + NR[d]) >= 1) rc = 1;
        recv[i] = rc;
        u[i] = rc ? 0 : s[i];
      }
    for (let r = -n; r <= n; r++)
      for (let q = -n; q <= n; q++) {
        const i = this.idx(q, r);
        if (!inside[i]) continue;
        // Boundary cells are held at beta.
        if (Math.abs(q) === n || Math.abs(r) === n || Math.abs(q + r) === n) {
          next[i] = this.beta;
          continue;
        }
        let sum = 0;
        for (let d = 0; d < 6; d++) sum += u[(r + NR[d] + n) * size + (q + NQ[d] + n)];
        const uu = u[i] + (this.alpha / 2) * (sum / 6 - u[i]);
        const v = recv[i] ? s[i] + this.gamma : 0;
        next[i] = uu + v;
        if (next[i] >= 1) {
          const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
          if (dist > this.radius) this.radius = dist;
        }
      }
    this.s = next;
    this.next = s;
    this.steps++;
  }

  get done(): boolean {
    return this.radius >= this.n - 2;
  }
}
