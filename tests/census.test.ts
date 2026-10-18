import { describe, expect, it } from 'vitest';
import { diversity, mulberry32, randomSoup, runSoup } from '../src/engine/census';

describe('soup census', () => {
  it('is reproducible for a given seed', () => {
    const a = runSoup(randomSoup(16, 0.5, mulberry32(42)));
    const b = runSoup(randomSoup(16, 0.5, mulberry32(42)));
    expect([...a.objects]).toEqual([...b.objects]);
    expect(a.settledAt).toBe(b.settledAt);
  });
  it('finds mostly common, recognised objects', () => {
    const rng = mulberry32(7);
    const total = new Map<string, number>();
    for (let i = 0; i < 8; i++) {
      const r = runSoup(randomSoup(16, 0.5, rng));
      for (const [k, v] of r.objects) total.set(k, (total.get(k) ?? 0) + v);
    }
    const all = [...total.values()].reduce((a, b) => a + b, 0);
    expect(all).toBeGreaterThan(10);
    expect((total.get('Block') ?? 0) + (total.get('Blinker') ?? 0)).toBeGreaterThan(all * 0.3);
    expect(diversity(total)).toBeGreaterThan(1);
  });
});
