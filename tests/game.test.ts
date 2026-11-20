import { describe, expect, it } from 'vitest';
import {
  CHAPTERS, STAMPS, ashStars, checkPrediction, collide, collisionTable, censusText, isStill, judgeParent, judgeRace, judgeRule,
  measuredAsh, meanField, meanFieldFixedPoint, neighbourCounts, rotate, sameCensus, starsFor,
} from '../src/engine/game';
import { evolveSparse, type Cell } from '../src/engine/life';
import { findPeriod } from '../src/engine/objects';
import { patternCells } from '../src/engine/patterns';

const level = <K extends string>(chapter: string, kind: K) => CHAPTERS.find((c) => c.id === chapter)!.levels.filter((l) => l.kind === kind) as any[];

describe('the game', () => {
  it('has eight chapters, each with an idea, a formula, hints for every level and an application', () => {
    expect(CHAPTERS).toHaveLength(8);
    for (const c of CHAPTERS) {
      expect(c.levels.length).toBeGreaterThan(0);
      expect(c.hints).toHaveLength(c.levels.length);
      expect(c.formula.length).toBeGreaterThan(3);
      expect(c.application.route).toMatch(/^[a-z]+$/);
    }
  });

  it('chapter 1: the true next generation is the only right prediction', () => {
    for (const l of level('rule', 'predict')) {
      const next = evolveSparse(l.start, 1);
      expect(checkPrediction(l.start, next).ok).toBe(true);
      const wrong = checkPrediction(l.start, l.start);
      expect(wrong.ok).toBe(false);
    }
    const counts = neighbourCounts([[0, 0], [1, 0], [2, 0]]);
    expect(counts.get('1,1')).toBe(3);
    expect(counts.get('1,0')).toBe(2);
  });

  it('chapter 2: every broken still life is broken, and one stone mends it', () => {
    const shapes = { 'A broken beehive': 'beehive', 'A broken loaf': 'loaf', 'A broken pond': 'pond' } as Record<string, string>;
    for (const l of level('fixed', 'repair')) {
      expect(isStill(l.given)).toBe(false);
      let fixes = 0;
      for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) {
        if (l.given.some(([a, b]: Cell) => a === x && b === y)) continue;
        if (isStill([...l.given, [x, y]])) fixes++;
      }
      expect(fixes, l.title).toBeGreaterThan(0);
      expect(shapes[l.title]).toBeTruthy();
    }
  });

  it('chapter 3: the answer to every period level is among its options', () => {
    const want = [2, 3, 15];
    level('cycles', 'period').forEach((l, i) => {
      const p = findPeriod(l.pattern, 30)!;
      expect(p.period).toBe(want[i]);
      expect(l.options).toContain(p.period);
    });
  });

  it('chapter 4: each race can be won, and the sprint only by the faster ship', () => {
    const [diag, sprint] = level('light', 'race');
    const g = rotate(STAMPS.glider.cells(), 0); // flies down and to the right
    expect(judgeRace(g.map(([x, y]) => [x + 2, y + 2] as Cell), diag.race).ok).toBe(true);
    // Every orientation of the glider loses the sprint; the lightweight spaceship pointing right wins it.
    for (let t = 0; t < 4; t++) for (const y of [1, 3, 5]) expect(judgeRace(rotate(STAMPS.glider.cells(), t).map(([x, yy]) => [x + 4, yy + y] as Cell), sprint.race).ok).toBe(false);
    const wins = [0, 1, 2, 3].filter((t) => judgeRace(rotate(STAMPS.lwss.cells(), t).map(([x, y]) => [x + 2, y + 2] as Cell), sprint.race).ok);
    expect(wins.length).toBeGreaterThan(0);
    expect(judgeRace([[20, 2]], sprint.race).message).toMatch(/start area/);
  });

  it('chapter 5: every collision goal has at least one solution among the 36', () => {
    const table = collisionTable();
    expect(table).toHaveLength(36);
    for (const l of level('logic', 'collide')) expect(table.filter((r) => sameCensus(r.result, l.target)).length, l.title).toBeGreaterThan(0);
    expect(table.filter((r) => sameCensus(r.result, new Map([['Glider', 1]])))).toHaveLength(2);
    expect(censusText(collide(-4, 0))).toBe('2 gliders');
    expect(censusText(collide(0, 0))).toBe('nothing at all');
  });

  it('chapter 6: every target has a parent within the stone limit', () => {
    const answers: Cell[][] = [[[2, 3], [3, 3], [4, 3]], [[2, 2], [3, 2], [2, 3]]];
    const [blinker, block, glider] = level('backwards', 'parent');
    expect(judgeParent(answers[0], blinker.target, blinker.maxStones).ok).toBe(true);
    expect(judgeParent(answers[1], block.target, block.maxStones).ok).toBe(true);
    // A glider one phase back: run a glider three generations, then one more lands on the target shape; shift it into place.
    const g = patternCells('glider');
    const prev = evolveSparse(g, 3), now = evolveSparse(prev, 1);
    const dx = Math.min(...glider.target.map((c: Cell) => c[0])) - Math.min(...now.map((c) => c[0]));
    const dy = Math.min(...glider.target.map((c: Cell) => c[1])) - Math.min(...now.map((c) => c[1]));
    expect(judgeParent(prev.map(([x, y]) => [x + dx, y + dy] as Cell), glider.target, 5).ok).toBe(true);
    expect(judgeParent([[0, 0]], block.target, 3).message).toMatch(/nothing/);
  });

  it('chapter 7: mean field predicts about 37%, and real soups leave far less', () => {
    expect(meanFieldFixedPoint()).toBeCloseTo(0.37, 1);
    expect(meanField(0)).toBe(0);
    const ash = level('ash', 'ash').map((l) => measuredAsh(l.start));
    expect(ash[0]).toBeGreaterThan(0.01);
    expect(ash[0]).toBeLessThan(0.1);
    expect(ash[2]).toBeLessThan(0.01);
    expect(ashStars(ash[0], ash[0])).toBe(3);
    expect(ashStars(0.37, ash[0])).toBe(0);
  });

  it('chapter 8: chaos and complexity can both be found, and Life itself is the complex one', () => {
    expect(judgeRule('B2/S').cls).toBe('III');
    expect(judgeRule('B36/S23').cls).toBe('IV');
    expect(judgeRule('B3/S23').cls).toBe('IV');
    expect(judgeRule('B3/S23').lambda).toBeCloseTo(0.27, 2);
  });

  it('scores: clean solves earn three stars, hints one', () => {
    expect(starsFor(1, false)).toBe(3);
    expect(starsFor(5, false)).toBe(2);
    expect(starsFor(1, true)).toBe(1);
  });
});
