import { describe, expect, it } from 'vitest';
import { Life, evolveSparse, normalize } from '../src/engine/life';
import { parseRule, ruleToString } from '../src/engine/rules';
import { parseRLE, toRLE } from '../src/engine/rle';
import { PATTERNS, patternCells } from '../src/engine/patterns';
import { canonicalKey, components, findPeriod, identify, translationKey } from '../src/engine/objects';

describe('rules', () => {
  it('parses B/S, S/B and legacy notation', () => {
    expect(ruleToString(parseRule('B3/S23'))).toBe('B3/S23');
    expect(ruleToString(parseRule('s23/b36'))).toBe('B36/S23');
    expect(ruleToString(parseRule('23/3'))).toBe('B3/S23');
    expect(ruleToString(parseRule('B2/S'))).toBe('B2/S');
  });
  it('rejects garbage', () => {
    expect(() => parseRule('hello')).toThrow();
  });
});

describe('Life grid', () => {
  it('blinker oscillates with period 2', () => {
    const g = new Life(10, 10);
    g.stamp([[0, 0], [1, 0], [2, 0]], 3, 4);
    const h0 = g.hash();
    g.step();
    expect(g.hash()).not.toBe(h0);
    expect(g.get(4, 3) && g.get(4, 4) && g.get(4, 5)).toBeTruthy();
    g.step();
    expect(g.hash()).toBe(h0);
  });
  it('glider wraps around a torus and returns home', () => {
    const g = new Life(8, 8);
    g.stamp(patternCells('glider'), 1, 1);
    const h0 = g.hash();
    for (let i = 0; i < 32; i++) g.step(); // 8 cells diagonally at c/4
    expect(g.hash()).toBe(h0);
    expect(g.population()).toBe(5);
  });
  it('bounded grid kills cells at the edge', () => {
    const g = new Life(8, 8);
    g.wrap = false;
    g.stamp(patternCells('glider'), 1, 1);
    for (let i = 0; i < 40; i++) g.step();
    expect(g.population()).toBeLessThan(5);
  });
  it('grid and sparse engines agree on a methuselah', () => {
    const g = new Life(200, 200);
    g.wrap = false;
    g.stamp(patternCells('rpentomino'), 100, 100);
    for (let i = 0; i < 60; i++) g.step();
    const sparse = evolveSparse(patternCells('rpentomino'), 60);
    expect(g.population()).toBe(sparse.length);
  });
  it('tracks births and deaths', () => {
    const g = new Life(10, 10);
    g.stamp([[0, 0], [1, 0], [2, 0]], 3, 4);
    const s = g.step();
    expect(s).toEqual({ births: 2, deaths: 2, population: 3 });
  });
});

describe('RLE', () => {
  it('round-trips every library pattern', () => {
    for (const p of PATTERNS) {
      const cells = patternCells(p);
      const back = parseRLE(toRLE(cells)).cells;
      expect(translationKey(back)).toBe(translationKey(cells));
    }
  });
  it('reads headers and names', () => {
    const r = parseRLE('#N Glider\n#C a comment\nx = 3, y = 3, rule = B3/S23\nbob$2bo$3o!');
    expect(r.name).toBe('Glider');
    expect(r.rule).toBe('B3/S23');
    expect(r.cells.length).toBe(5);
    expect(r.width).toBe(3);
  });
});

describe('pattern library facts', () => {
  const period = (id: string) => findPeriod(patternCells(id), 130);
  it('still lifes have period 1', () => {
    for (const p of PATTERNS.filter((q) => q.category === 'Still life')) expect(period(p.id)?.period).toBe(1);
  });
  it('oscillators and spaceships have their documented periods', () => {
    for (const p of PATTERNS.filter((q) => q.category === 'Oscillator' || q.category === 'Spaceship')) {
      const r = period(p.id);
      expect(r?.period, p.id).toBe(p.period);
      if (p.category === 'Spaceship') expect(Math.abs(r!.dx) + Math.abs(r!.dy), p.id).toBeGreaterThan(0);
      else expect([r!.dx, r!.dy], p.id).toEqual([0, 0]);
    }
  });
  it('diehard vanishes at generation 130', () => {
    expect(evolveSparse(patternCells('diehard'), 129).length).toBeGreaterThan(0);
    expect(evolveSparse(patternCells('diehard'), 130).length).toBe(0);
  });
  it('guns emit a glider every period', () => {
    for (const id of ['gosper', 'simkin']) {
      const p = PATTERNS.find((q) => q.id === id)!;
      const c0 = patternCells(id);
      const c1 = evolveSparse(c0, p.period! * 2);
      const c2 = evolveSparse(c0, p.period! * 4);
      // Population grows by 5 cells (one glider) per period, once the first glider is clear.
      expect(c2.length - c1.length, id).toBe(10);
    }
  });
  it('growth patterns keep growing', () => {
    for (const id of ['switchengine', 'line']) {
      const a = evolveSparse(patternCells(id), 1000).length;
      const b = evolveSparse(patternCells(id), 2000).length;
      expect(b, id).toBeGreaterThan(a);
    }
  });
});

describe('object recognition', () => {
  it('is invariant under rotation, reflection and translation', () => {
    const g = patternCells('glider');
    const moved = g.map(([x, y]) => [y + 7, -x + 3] as [number, number]);
    expect(canonicalKey(moved)).toBe(canonicalKey(g));
  });
  it('identifies every phase of a glider', () => {
    let c = patternCells('glider');
    for (let i = 0; i < 4; i++) {
      expect(identify(c)?.name).toBe('Glider');
      c = evolveSparse(c, 1);
    }
  });
  it('splits cells into objects at radius 2', () => {
    const cells = [...patternCells('block'), ...normalize(patternCells('blinker')).map(([x, y]) => [x + 10, y] as [number, number])];
    expect(components(cells).length).toBe(2);
  });
});
