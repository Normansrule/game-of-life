/**
 * Greenberg–Hastings excitable medium: a cartoon of heart muscle.
 * State 0 is resting, 1 is excited (firing), 2..states-1 are refractory.
 * A resting cell fires when at least `threshold` cells within `radius`
 * are excited; firing cells then recover through the refractory states.
 * Plane waves model a normal heartbeat; a broken wave curls into a
 * rotating spiral, the mechanism of re-entrant arrhythmias.
 */
export class Excitable {
  s: Uint8Array;
  private n: Uint8Array;
  private offs: [number, number][] = [];
  constructor(readonly w: number, readonly h: number, public states = 8, public threshold = 2, radius = 2) {
    this.s = new Uint8Array(w * h);
    this.n = new Uint8Array(w * h);
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++)
        if ((dx || dy) && dx * dx + dy * dy <= radius * radius + radius) this.offs.push([dx, dy]);
  }

  get excited(): number {
    let c = 0;
    for (let i = 0; i < this.s.length; i++) if (this.s[i] === 1) c++;
    return c;
  }

  get active(): number {
    let c = 0;
    for (let i = 0; i < this.s.length; i++) if (this.s[i]) c++;
    return c;
  }

  stimulate(cx: number, cy: number, r: number) {
    for (let y = Math.max(0, cy - r); y <= Math.min(this.h - 1, cy + r); y++)
      for (let x = Math.max(0, cx - r); x <= Math.min(this.w - 1, cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && this.s[y * this.w + x] === 0) this.s[y * this.w + x] = 1;
  }

  /** Excite a whole column (a plane wave starting at the left wall). */
  stimulateColumn(x: number) {
    for (let y = 0; y < this.h; y++) if (this.s[y * this.w + x] === 0) this.s[y * this.w + x] = 1;
  }

  /** Reset a rectangle to rest (breaks a wave front). */
  clear(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.s[y * this.w + x] = 0;
  }

  /** Defibrillation: excite every resting cell at once. */
  shock() {
    for (let i = 0; i < this.s.length; i++) if (this.s[i] === 0) this.s[i] = 1;
  }

  step() {
    const { w, h, s, n, offs, states, threshold } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = s[i];
        if (v) {
          n[i] = v + 1 >= states ? 0 : v + 1;
          continue;
        }
        let c = 0;
        for (let k = 0; k < offs.length && c < threshold; k++) {
          const xx = x + offs[k][0], yy = y + offs[k][1];
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          if (s[yy * w + xx] === 1) c++;
        }
        n[i] = c >= threshold ? 1 : 0;
      }
    this.s = n;
    this.n = s;
  }
}
