import { describe, expect, it } from 'vitest';
import { DensityGA, TABLE, gklRule, localMajorityRule, performance, randomIC, ruleHex, stepRing } from '../src/engine/evolve';
import { mulberry32 } from '../src/engine/census';

describe('density classification', () => {
  it('stepRing matches a direct radius-3 update', () => {
    const rng = mulberry32(1);
    const rule = new Uint8Array(TABLE).map(() => (rng() < 0.5 ? 1 : 0));
    const a = randomIC(37, rng), b = new Uint8Array(37);
    stepRing(a, b, rule);
    for (let i = 0; i < 37; i++) {
      let idx = 0;
      for (let k = -3; k <= 3; k++) idx = idx * 2 + a[(i + k + 37) % 37];
      expect(b[i]).toBe(rule[idx]);
    }
  });

  it('GKL classifies about 80% of unbiased N=149 rings; local majority almost none', () => {
    const gkl = performance(gklRule(), 400, 149, 3);
    expect(gkl).toBeGreaterThan(0.75);
    expect(gkl).toBeLessThan(0.88);
    expect(performance(localMajorityRule(), 200, 149, 3)).toBeLessThan(0.05);
  });

  it('local majority freezes: any run of 4 equal cells is stable forever', () => {
    const maj = localMajorityRule();
    const rng = mulberry32(5);
    for (let k = 0; k < 50; k++) {
      const ic = randomIC(41, rng);
      ic.set([1, 1, 1, 1], 5);
      ic.set([0, 0, 0, 0], 20);
      let a: Uint8Array = ic, b: Uint8Array = new Uint8Array(41);
      for (let t = 0; t < 60; t++) { stepRing(a, b, maj); [a, b] = [b, a]; }
      expect(Array.from(a.subarray(5, 9))).toEqual([1, 1, 1, 1]);
      expect(Array.from(a.subarray(20, 24))).toEqual([0, 0, 0, 0]);
    }
  });

  it('GKL is a 0/1-symmetric rule (complementing and mirroring)', () => {
    const r = gklRule();
    const rev = (i: number) => { let o = 0; for (let k = 0; k < 7; k++) o |= ((i >> k) & 1) << (6 - k); return o; };
    for (let i = 0; i < TABLE; i++) expect(r[i]).toBe(1 - r[rev(i ^ 127)]);
    expect(ruleHex(r)).toHaveLength(32);
  });

  it('the GA improves the population and records parents', () => {
    const ga = new DensityGA({ seed: 2, popSize: 40, icCount: 40, n: 79, maxSteps: 90 });
    ga.evaluate();
    const mean0 = ga.pop.reduce((a, b) => a + b.fitness, 0) / ga.pop.length;
    const ids = new Set(ga.pop.map((p) => p.id));
    for (let g = 0; g < 25; g++) { ga.breed(); ga.evaluate(); }
    const mean = ga.pop.reduce((a, b) => a + b.fitness, 0) / ga.pop.length;
    expect(mean).toBeGreaterThan(mean0 + 0.1);
    for (const p of ga.pop) {
      expect(ids.has(p.id)).toBe(false);
      expect(p.parents.length).toBe(p.elite ? 1 : 2);
    }
    expect(ga.pop.filter((p) => p.elite)).toHaveLength(8);
  });
});
