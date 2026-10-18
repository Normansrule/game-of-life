/**
 * Schelling's segregation model (Thomas Schelling, 1971): two groups of
 * agents on a grid. An agent is unhappy if fewer than a fraction
 * `threshold` of its occupied neighbours belong to its own group, and
 * unhappy agents move to random empty cells. Even mild preferences
 * (wanting just a third of one's neighbours to be similar) produce
 * strongly segregated neighbourhoods: a classic example of a macro
 * pattern that no individual intended.
 */
export class Schelling {
  g: Uint8Array; // 0 empty, 1 or 2 = group
  threshold = 0.34;
  moves = 0;
  constructor(readonly w: number, readonly h: number, private rng: () => number = Math.random) {
    this.g = new Uint8Array(w * h);
  }

  seed(vacancy = 0.1, share = 0.5) {
    for (let i = 0; i < this.g.length; i++) {
      const r = this.rng();
      this.g[i] = r < vacancy ? 0 : this.rng() < share ? 1 : 2;
    }
  }

  /** Fraction of occupied neighbours in the same group, or −1 if no neighbours. */
  similarity(i: number): number {
    const { w, h, g } = this;
    const me = g[i];
    const x = i % w, y = (i - x) / w;
    let same = 0, occ = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const v = g[((y + dy + h) % h) * w + ((x + dx + w) % w)];
        if (!v) continue;
        occ++;
        if (v === me) same++;
      }
    return occ ? same / occ : -1;
  }

  unhappy(i: number): boolean {
    if (!this.g[i]) return false;
    const s = this.similarity(i);
    return s >= 0 && s < this.threshold;
  }

  /** Mean similarity over agents with neighbours: the segregation index. */
  segregation(): number {
    let sum = 0, n = 0;
    for (let i = 0; i < this.g.length; i++) {
      if (!this.g[i]) continue;
      const s = this.similarity(i);
      if (s >= 0) { sum += s; n++; }
    }
    return n ? sum / n : 0;
  }

  unhappyCount(): number {
    let n = 0;
    for (let i = 0; i < this.g.length; i++) if (this.unhappy(i)) n++;
    return n;
  }

  /** Move every currently unhappy agent (in random order) to a random empty cell. Returns moves made. */
  step(): number {
    const { g, rng } = this;
    const movers: number[] = [];
    const empty: number[] = [];
    for (let i = 0; i < g.length; i++) {
      if (!g[i]) empty.push(i);
      else if (this.unhappy(i)) movers.push(i);
    }
    for (let k = movers.length - 1; k > 0; k--) {
      const j = Math.floor(rng() * (k + 1));
      [movers[k], movers[j]] = [movers[j], movers[k]];
    }
    let moved = 0;
    for (const i of movers) {
      if (!empty.length) break;
      const e = Math.floor(rng() * empty.length);
      const dst = empty[e];
      g[dst] = g[i];
      g[i] = 0;
      empty[e] = i; // the vacated cell becomes available
      moved++;
    }
    this.moves += moved;
    return moved;
  }
}
