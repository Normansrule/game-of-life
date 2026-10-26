/**
 * Immigration: Life for two players (Don Woods, 1971). The rules are Conway's,
 * B3/S23, but every stone belongs to a side. A stone that survives keeps its
 * colour; a new stone takes the colour of the majority of its three parents.
 *
 * Boards are bounded (nothing lives past the edge), w × h, stored row by row:
 * 0 is an empty point, 1 black, 2 white.
 */
export type Side = 1 | 2;

export function step(b: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, blacks = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const v = b[yy * w + xx];
      if (v) { n++; if (v === 1) blacks++; }
    }
    const i = y * w + x;
    if (b[i]) { if (n === 2 || n === 3) out[i] = b[i]; }
    else if (n === 3) out[i] = blacks >= 2 ? 1 : 2;
  }
  return out;
}

export function run(b: Uint8Array, w: number, h: number, gens: number): Uint8Array {
  let c = b;
  for (let g = 0; g < gens; g++) c = step(c, w, h);
  return c;
}

/** Stones of each side: [black, white]. */
export function score(b: Uint8Array): [number, number] {
  let k = 0, s = 0;
  for (const v of b) { if (v === 1) k++; else if (v === 2) s++; }
  return [k, s];
}

export type Level = 'easy' | 'normal' | 'hard';

/**
 * Where `side` should put its next stone, judged by how the board stands
 * after `gens` generations. Candidates are the empty points within two lines
 * of a stone (or near the middle of an empty board). Easy picks loosely from
 * the better half, normal from a sample, and hard tries every candidate.
 * `rnd` returns numbers in [0, 1); pass a seeded one for repeatable games.
 */
export function chooseMove(b: Uint8Array, w: number, h: number, side: Side, gens: number, level: Level, rnd: () => number = Math.random): number {
  const near = new Uint8Array(w * h);
  let any = false;
  for (let i = 0; i < w * h; i++) {
    if (!b[i]) continue;
    any = true;
    const x = i % w, y = (i / w) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = 1;
    }
  }
  let cands: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (b[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if (any ? near[i] : Math.abs(x - (w - 1) / 2) <= 2 && Math.abs(y - (h - 1) / 2) <= 2) cands.push(i);
  }
  if (!cands.length) for (let i = 0; i < w * h; i++) if (!b[i]) cands.push(i);
  if (!cands.length) return -1;
  if (level === 'normal' && cands.length > 36) {
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    cands = cands.slice(0, 36);
  }
  const scored = cands.map((i) => {
    const t = new Uint8Array(b);
    t[i] = side;
    const [k, s] = score(run(t, w, h, gens));
    const mine = side === 1 ? k : s, theirs = side === 1 ? s : k;
    // Small random tie-break so equal moves don't always go to the top-left.
    return { i, v: mine - theirs + rnd() * 0.01 };
  });
  scored.sort((a, c) => c.v - a.v);
  if (level === 'easy') return scored[Math.floor(rnd() * Math.max(1, Math.ceil(scored.length / 2)))].i;
  return scored[0].i;
}
