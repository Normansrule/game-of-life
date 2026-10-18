import { describe, expect, it } from 'vitest';
import { FateRunner, burnsideCount, maskToCells, orbitRepresentatives } from '../src/engine/exhaustive';
import { patternCells } from '../src/engine/patterns';

describe('every pattern in a box', () => {
  it("Burnside's lemma matches brute-force orbit counting", () => {
    for (const n of [1, 2, 3, 4]) expect(BigInt(orbitRepresentatives(n).length)).toBe(burnsideCount(n));
    expect(burnsideCount(4)).toBe(8548n);
    expect(burnsideCount(5)).toBe(4211744n);
  });

  it('finds the known fates of classic patterns', () => {
    const fr = new FateRunner();
    const r = fr.run(patternCells('rpentomino'), 3000);
    expect(r).toMatchObject({ fate: 'oscillates', lifespan: 1103, period: 2, escaped: true });
    expect(r.finalPopulation).toBe(116 - 6 * 5); // the 6 gliders fly off
    expect(fr.run(patternCells('glider'))).toMatchObject({ fate: 'dies', escaped: true });
    expect(fr.run([[0, 0], [1, 0], [0, 1], [1, 1]])).toMatchObject({ fate: 'still', lifespan: 0 });
    expect(fr.run([[0, 0], [1, 0], [2, 0]])).toMatchObject({ fate: 'oscillates', period: 2, lifespan: 0 });
    expect(fr.run([[0, 0], [1, 1]])).toMatchObject({ fate: 'dies', lifespan: 1, escaped: false });
  });

  it('symmetric images have identical fates', () => {
    const fr = new FateRunner();
    const m = orbitRepresentatives(4)[1234];
    const cells = maskToCells(m, 4);
    const flipped = cells.map(([x, y]) => [3 - x, y] as [number, number]);
    const a = fr.run(cells), b = fr.run(flipped);
    expect(b.fate).toBe(a.fate);
    expect(b.lifespan).toBe(a.lifespan);
    expect(b.finalPopulation).toBe(a.finalPopulation);
  });
});
