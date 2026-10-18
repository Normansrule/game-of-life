import { describe, expect, it } from 'vitest';
import { RuleRun, classifyRule, langtonLambda, randomRule, ruleNeighbours } from '../src/engine/classify';
import { mulberry32 } from '../src/engine/census';
import { parseRule } from '../src/engine/rules';

describe('rule classification', () => {
  it("computes Langton's lambda", () => {
    expect(langtonLambda(parseRule('B3/S23'))).toBeCloseTo(140 / 512, 12);
    expect(langtonLambda(parseRule('B/S'))).toBe(0);
    expect(langtonLambda(parseRule('B12345678/S012345678'))).toBeCloseTo(511 / 512, 12);
  });

  it('puts well-known rules in the expected classes', () => {
    for (const seed of [1, 2, 3]) {
      expect(classifyRule('B/S', { seed }).cls).toBe('I');
      expect(classifyRule('B3/S23', { seed }).cls).toBe('IV');
      expect(classifyRule('B2/S', { seed }).cls).toBe('III');
      expect(classifyRule('B34/S34', { seed }).cls).toBe('III');
      expect(classifyRule('B3/S012345678', { seed }).cls).toBe('II');
    }
  });

  it('lists the 17 one-bit neighbours of Life in rule space', () => {
    const nb = ruleNeighbours('B3/S23');
    expect(nb).toHaveLength(17);
    expect(new Set(nb).size).toBe(17);
    expect(nb).toContain('B36/S23');
    expect(nb).toContain('B3/S238');
    expect(nb).not.toContain('B3/S23');
  });

  it('random rules never use B0', () => {
    const rng = mulberry32(9);
    for (let k = 0; k < 200; k++) expect(parseRule(randomRule(rng)).birth[0]).toBe(false);
  });

  it('the replicator wipes out any pattern on a 2^k torus within 2^k steps', () => {
    // Over GF(2), T = (1+x+x⁻¹)(1+y+y⁻¹) − 1 and T^(2^k) = (x^(2^k)+1+x^(-2^k))(…) − 1 = 1 − 1 = 0.
    const run = new RuleRun('B1357/S1357', 32, 0.5, 4);
    expect(run.population).toBeGreaterThan(0);
    for (let g = 0; g < 32; g++) run.step();
    expect(run.population).toBe(0);
  });
});
