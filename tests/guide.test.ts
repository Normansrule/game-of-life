import { describe, expect, it } from 'vitest';
import { measure, measureGrowth, measureRun } from '../src/engine/guide';
import { PATTERNS, getPattern, patternCells } from '../src/engine/patterns';

const facts = (id: string) => measure(getPattern(id)!);

describe('field guide facts', () => {
  it('measures the cycle of still lifes, oscillators and spaceships', () => {
    expect(facts('block').cycle).toMatchObject({ period: 1, heat: 0, stator: 4, rotor: 0 });
    expect(facts('blinker').cycle).toMatchObject({ period: 2, heat: 4, rotor: 4, stator: 1 });
    expect(facts('beacon').cycle).toMatchObject({ period: 2, minPop: 6, maxPop: 8, rotor: 2, stator: 6 });
    expect(facts('pentadecathlon').cycle).toMatchObject({ period: 15, stator: 0 });
    expect(facts('glider').cycle).toMatchObject({ period: 4, speed: 'c/4 diagonal', heat: 4 });
    expect(facts('lwss').cycle).toMatchObject({ speed: 'c/2 orthogonal', heat: 11 });
    expect(facts('mwss').cycle?.heat).toBe(15);
    expect(facts('hwss').cycle?.heat).toBe(19);
    expect(facts('copperhead').cycle).toMatchObject({ period: 10, speed: 'c/10 orthogonal' });
  });

  it('agrees with the period and speed written in the pattern library', () => {
    for (const p of PATTERNS) {
      const f = measure(p);
      expect(f.cells).toBe(patternCells(p).length);
      if (p.category === 'Still life') expect(f.cycle?.period, p.id).toBe(1);
      if (p.period && f.cycle) expect(f.cycle.period, p.id).toBe(p.period);
      if (p.period && f.gun) expect(f.gun.period, p.id).toBe(p.period);
      if (p.speed) expect(f.cycle?.speed, p.id).toBe(p.speed);
    }
  });

  it('counts the gliders a gun fires', () => {
    expect(facts('gosper').gun).toEqual({ period: 30, perPeriod: 1 });
    expect(facts('simkin').gun).toEqual({ period: 120, perPeriod: 1 });
    expect(facts('simkin').cells).toBe(36);
  });

  it('runs methuselahs to the end, ignoring the gliders that fly off', () => {
    expect(measureRun(patternCells('diehard'), { size: 192 })).toMatchObject({ ending: 'dies', lifespan: 130, escapes: 0 });
    expect(measureRun(patternCells('piheptomino'), { size: 256 })).toMatchObject({ lifespan: 173, escapes: 0 });
    expect(measureRun(patternCells('bheptomino'), { size: 256 })).toMatchObject({ lifespan: 148 });
    const r = measureRun(patternCells('rpentomino'), { size: 512 });
    expect(r).toMatchObject({ lifespan: 1103, endPeriod: 2, escapes: 6, finalPop: 116 - 6 * 5 });
    const a = measureRun(patternCells('acorn'), { size: 640 });
    expect(a).toMatchObject({ lifespan: 5206, escapes: 13 });
    // 633 cells at the end, counting the 13 gliders still in flight.
    expect(a.finalPop + a.escapes * 5).toBe(633);
  });

  it('follows growth patterns for 2,000 generations', () => {
    const g = measureGrowth(patternCells('switchengine'));
    expect(g.trace).toHaveLength(21);
    expect(g.final).toBeGreaterThan(200);
  });
});
