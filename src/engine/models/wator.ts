/**
 * Wa-Tor (A. K. Dewdney, Scientific American, 1984): fish and sharks on a
 * toroidal ocean. Fish move at random and breed; sharks eat fish, starve
 * if they go too long without food, and breed. The two populations cycle
 * like the Lotka–Volterra predator–prey equations.
 */
export const EMPTY = 0, FISH = 1, SHARK = 2;

export interface WatorParams {
  fishBreed: number;
  sharkBreed: number;
  sharkStarve: number;
}

export class Wator {
  kind: Uint8Array;
  age: Uint16Array;
  energy: Uint16Array;
  private moved: Uint32Array;
  private order: Int32Array;
  private tick = 0;
  fish = 0;
  sharks = 0;
  constructor(readonly w: number, readonly h: number, public p: WatorParams, private rng: () => number = Math.random) {
    const n = w * h;
    this.kind = new Uint8Array(n);
    this.age = new Uint16Array(n);
    this.energy = new Uint16Array(n);
    this.moved = new Uint32Array(n);
    this.order = new Int32Array(n);
    for (let i = 0; i < n; i++) this.order[i] = i;
  }

  seed(fishFrac: number, sharkFrac: number) {
    for (let i = 0; i < this.kind.length; i++) {
      const r = this.rng();
      this.kind[i] = r < fishFrac ? FISH : r < fishFrac + sharkFrac ? SHARK : EMPTY;
      this.age[i] = Math.floor(this.rng() * 8);
      this.energy[i] = this.p.sharkStarve;
    }
    this.count();
  }

  private count() {
    let f = 0, s = 0;
    for (let i = 0; i < this.kind.length; i++) {
      if (this.kind[i] === FISH) f++;
      else if (this.kind[i] === SHARK) s++;
    }
    this.fish = f;
    this.sharks = s;
  }

  private neighbours(i: number, out: Int32Array): void {
    const x = i % this.w, y = (i - x) / this.w;
    out[0] = y * this.w + ((x + 1) % this.w);
    out[1] = y * this.w + ((x - 1 + this.w) % this.w);
    out[2] = ((y + 1) % this.h) * this.w + x;
    out[3] = ((y - 1 + this.h) % this.h) * this.w + x;
  }

  step() {
    const { kind, age, energy, moved, order, rng, p } = this;
    const t = ++this.tick;
    // Shuffle the update order (Fisher–Yates) so no direction is favoured.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
    }
    const nb = new Int32Array(4);
    const cand = new Int32Array(4);
    for (let k = 0; k < order.length; k++) {
      const i = order[k];
      const kd = kind[i];
      if (kd === EMPTY || moved[i] === t) continue;
      this.neighbours(i, nb);
      let target = -1;
      if (kd === SHARK) {
        let c = 0;
        for (let d = 0; d < 4; d++) if (kind[nb[d]] === FISH) cand[c++] = nb[d];
        if (c) {
          target = cand[Math.floor(rng() * c)];
          energy[i] = p.sharkStarve + 1;
        }
        if (--energy[i] === 0) {
          kind[i] = EMPTY;
          continue;
        }
      }
      if (target < 0) {
        let c = 0;
        for (let d = 0; d < 4; d++) if (kind[nb[d]] === EMPTY) cand[c++] = nb[d];
        if (c) target = cand[Math.floor(rng() * c)];
      }
      age[i]++;
      const breedAt = kd === FISH ? p.fishBreed : p.sharkBreed;
      if (target < 0) {
        moved[i] = t;
        continue;
      }
      kind[target] = kd;
      age[target] = age[i];
      energy[target] = energy[i];
      moved[target] = t;
      if (age[i] >= breedAt) {
        // Leave a newborn behind.
        age[target] = 0;
        age[i] = 0;
        energy[i] = p.sharkStarve;
        moved[i] = t;
      } else kind[i] = EMPTY;
    }
    this.count();
  }
}
