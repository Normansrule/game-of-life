/**
 * The hodgepodge machine (Gerhardt & Schuster, 1989), a cellular automaton
 * model of the Belousov–Zhabotinsky reaction. Each cell has a level
 * 0..n: 0 is "healthy", n is "ill", anything between is "infected".
 *   healthy:  ⌊a/k1⌋ + ⌊b/k2⌋        (a infected, b ill neighbours)
 *   infected: ⌊S/(a+b+1)⌋ + g, capped at n   (S = sum of own and neighbour levels)
 *   ill:      0
 * The result is target rings and rotating spirals like those seen in a
 * dish of BZ reagent.
 */
export class Hodgepodge {
  s: Uint16Array;
  private t: Uint16Array;
  generation = 0;
  constructor(readonly w: number, readonly h: number, public n = 200, public k1 = 3, public k2 = 3, public g = 28) {
    this.s = new Uint16Array(w * h);
    this.t = new Uint16Array(w * h);
  }

  randomize(rng: () => number) {
    for (let i = 0; i < this.s.length; i++) this.s[i] = Math.floor(rng() * (this.n + 1));
  }

  step() {
    const { w, h, s, t, n, k1, k2, g } = this;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const v = s[i];
        if (v === n) { t[i] = 0; continue; }
        let a = 0, b = 0, sum = v;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const u = s[((y + dy + h) % h) * w + ((x + dx + w) % w)];
            sum += u;
            if (u === n) b++;
            else if (u > 0) a++;
          }
        if (v === 0) t[i] = Math.min(n, Math.floor(a / k1) + Math.floor(b / k2));
        else t[i] = Math.min(n, Math.floor(sum / (a + b + 1)) + g);
      }
    this.s = t;
    this.t = s;
    this.generation++;
  }
}
