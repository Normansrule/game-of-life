import { describe, expect, it } from 'vitest';
import { type Cell, evolveSparse } from '../src/engine/life';
import { translationKey } from '../src/engine/objects';
import { patternCells } from '../src/engine/patterns';
import { findPredecessors, preimageCounts3x3 } from '../src/engine/predecessors';

const key = (c: Cell[]) => (c.length ? translationKey(c) + `@${Math.min(...c.map((p) => p[0]))},${Math.min(...c.map((p) => p[1]))}` : 'empty');

describe('predecessor search', () => {
  it('finds exactly the parents that brute force finds (small targets, every pattern in the box)', () => {
    const targets: Cell[][] = [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 1]], [[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0], [0, 1]]];
    for (const t of targets) {
      const want = key(t);
      const r = findPredecessors(t, { margin: 1, maxSolutions: 1e6 });
      const { x0, y0, w, h } = r.box;
      let brute = 0;
      for (let m = 0; m < 1 << (w * h); m++) {
        const p: Cell[] = [];
        for (let i = 0; i < w * h; i++) if ((m >> i) & 1) p.push([(i % w) + x0, Math.floor(i / w) + y0]);
        if (key(evolveSparse(p, 1)) === want) brute++;
      }
      expect(r.exhausted).toBe(true);
      expect(r.parents.length, JSON.stringify(t)).toBe(brute);
    }
  });

  it('every parent found really evolves into the target', () => {
    for (const name of ['blinker', 'glider', 'beehive']) {
      const t = patternCells(name);
      const r = findPredecessors(t, { maxSolutions: 20 });
      expect(r.parents.length).toBeGreaterThan(0);
      for (const p of r.parents) expect(key(evolveSparse(p, 1))).toBe(key(t));
    }
  });

  it('3×3 preimage counts add up to 2^25', () => {
    const c = preimageCounts3x3();
    expect(c.reduce((a, b) => a + b, 0)).toBe(2 ** 25);
    // Symmetry: a pattern and its mirror image have the same number of pasts.
    const mirror = (m: number) => { let o = 0; for (let i = 0; i < 9; i++) if ((m >> i) & 1) o |= 1 << (3 * Math.floor(i / 3) + 2 - (i % 3)); return o; };
    for (let m = 0; m < 512; m++) expect(c[mirror(m)]).toBe(c[m]);
  });
});
