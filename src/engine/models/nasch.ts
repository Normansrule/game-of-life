/**
 * The Nagel–Schreckenberg traffic model (1992) on a ring road. Each step,
 * every car (1) accelerates by 1 up to vmax, (2) slows to avoid the car
 * ahead, (3) with probability p brakes by 1 for no reason, then (4) moves.
 * Step 3 is all it takes to create "phantom" jams that travel backwards,
 * as Sugiyama et al. (2008) showed with 22 real cars on a circular track.
 */
export class NaSch {
  pos: Int32Array; // sorted positions around the ring
  vel: Int32Array;
  generation = 0;
  /** Number of cars that crossed position 0 in the last step. */
  flowCount = 0;
  constructor(readonly length: number, cars: number, public vmax = 5, public p = 0.3, private rng: () => number = Math.random) {
    this.pos = new Int32Array(cars);
    this.vel = new Int32Array(cars);
    // Evenly spaced start: perfectly smooth traffic, until someone brakes.
    for (let i = 0; i < cars; i++) this.pos[i] = Math.floor((i * length) / cars);
  }

  get cars(): number {
    return this.pos.length;
  }

  step() {
    const { pos, vel, length: L, vmax, p, rng } = this;
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      const ahead = pos[(i + 1) % n];
      const gap = n === 1 ? L - 1 : (ahead - pos[i] - 1 + L) % L;
      let v = Math.min(vel[i] + 1, vmax);
      v = Math.min(v, gap);
      if (v > 0 && rng() < p) v--;
      vel[i] = v;
    }
    let crossed = 0;
    for (let i = 0; i < n; i++) {
      const np = pos[i] + vel[i];
      if (np >= L) crossed++;
      pos[i] = np % L;
    }
    // Keep cars sorted by position: rotate so the array starts at the smallest.
    let k = 0;
    for (let i = 1; i < n; i++) if (pos[i] < pos[k]) k = i;
    if (k) {
      const p2 = Int32Array.from({ length: n }, (_, j) => pos[(j + k) % n]);
      const v2 = Int32Array.from({ length: n }, (_, j) => vel[(j + k) % n]);
      this.pos = p2;
      this.vel = v2;
    }
    this.flowCount = crossed;
    this.generation++;
  }

  meanSpeed(): number {
    let s = 0;
    for (let i = 0; i < this.vel.length; i++) s += this.vel[i];
    return this.vel.length ? s / this.vel.length : 0;
  }
}

/** Long-run flow (cars per cell per step) at a given density, averaged over a run. */
export function naschFlow(density: number, opts: { length?: number; vmax?: number; p?: number; steps?: number; rng?: () => number } = {}): number {
  const L = opts.length ?? 400;
  const n = Math.max(1, Math.round(density * L));
  const road = new NaSch(L, n, opts.vmax ?? 5, opts.p ?? 0.3, opts.rng);
  const warm = 200, steps = opts.steps ?? 400;
  for (let t = 0; t < warm; t++) road.step();
  let total = 0;
  for (let t = 0; t < steps; t++) { road.step(); total += road.meanSpeed() * n; }
  return total / steps / L;
}
