import { describe, expect, it } from 'vitest';
import type { Cell } from '../src/engine/life';
import { patternCells } from '../src/engine/patterns';
import { PUZZLES, getPuzzle } from '../src/engine/puzzles';

const solutions: Record<string, Cell[]> = {
  still: patternCells('block'),
  blink: patternCells('blinker'),
  seven: patternCells('loaf'),
  hive: [[0, 0], [1, 0], [2, 0], [3, 0]],
  move: patternCells('glider'),
  vanish: [[1, 0], [2, 0], [1, 1], [0, 2]],
  tiny: patternCells('rpentomino'),
  diehard: patternCells('diehard'),
  'big-ship': patternCells('lwss'),
  p3: patternCells('pulsar'),
};

describe('puzzles', () => {
  it('every puzzle has a known solution that fits its grid', () => {
    for (const p of PUZZLES) {
      const s = solutions[p.id];
      expect(s, p.id).toBeDefined();
      expect(Math.max(...s.map((c) => c[0])), p.id).toBeLessThan(p.w);
      expect(Math.max(...s.map((c) => c[1])), p.id).toBeLessThan(p.h);
      expect(p.check(s).ok, `${p.id}: ${p.check(s).message}`).toBe(true);
    }
  });

  it('rejects wrong answers with a useful description', () => {
    expect(getPuzzle('still')!.check(patternCells('blinker'))).toEqual({ ok: false, message: 'That is an oscillator (period 2): the blinker.' });
    expect(getPuzzle('big-ship')!.check(patternCells('glider')).ok).toBe(false);
    expect(getPuzzle('seven')!.check(patternCells('beehive')).message).toMatch(/exactly 7/);
    expect(getPuzzle('tiny')!.check(patternCells('acorn')).message).toMatch(/at most 5/);
    expect(getPuzzle('vanish')!.check([[0, 0], [1, 1]]).message).toMatch(/dies out after 1 generation\./);
    expect(getPuzzle('move')!.check([]).ok).toBe(false);
  });
});
