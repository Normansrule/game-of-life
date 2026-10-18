import { describe, expect, it } from 'vitest';
import { Hashlife } from '../src/engine/hashlife';
import { evolveSparse } from '../src/engine/life';
import { patternCells } from '../src/engine/patterns';
import { translationKey } from '../src/engine/objects';

const sameCells = (a: [number, number][], b: [number, number][]) => {
  const k = (c: [number, number][]) => c.map(([x, y]) => `${x},${y}`).sort().join(';');
  return k(a) === k(b);
};

describe('Hashlife', () => {
  it('matches the direct engine exactly, cell for cell', () => {
    for (const id of ['rpentomino', 'glider', 'acorn', 'gosper']) {
      for (const g of [1, 2, 5, 13, 64, 100, 377]) {
        const h = new Hashlife();
        h.load(patternCells(id));
        h.advance(g);
        expect(h.generation).toBe(g);
        expect(sameCells(h.cells(), evolveSparse(patternCells(id), g)), `${id} @ ${g}`).toBe(true);
      }
    }
  });
  it('step-by-step and one jump agree', () => {
    const a = new Hashlife();
    const b = new Hashlife();
    a.load(patternCells('rpentomino'));
    b.load(patternCells('rpentomino'));
    for (let i = 0; i < 50; i++) a.advance(1);
    b.advance(50);
    expect(translationKey(a.cells())).toBe(translationKey(b.cells()));
  });
  it('the R-pentomino ends with 116 cells, including its 6 gliders', () => {
    const h = new Hashlife();
    h.load(patternCells('rpentomino'));
    h.advance(2000);
    expect(h.population).toBe(116);
  });
  it('jumps a glider gun a billion generations', () => {
    const h = new Hashlife();
    h.load(patternCells('gosper'));
    const t0 = performance.now();
    h.advance(2 ** 30);
    expect(performance.now() - t0).toBeLessThan(5000);
    // One 5-cell glider per 30 generations.
    const expected = 2 ** 30 / 6;
    expect(h.population / expected).toBeGreaterThan(0.99);
    expect(h.population / expected).toBeLessThan(1.01);
  });
  it('reports bounds that grow at glider speed', () => {
    const h = new Hashlife();
    h.load(patternCells('glider'));
    h.advance(4000);
    const b = h.bounds()!;
    expect(b.x1 - b.x0).toBe(2);
    expect(Math.abs(b.x0)).toBeGreaterThan(990);
  });
});
