import { describe, expect, it } from 'vitest';
import { DAILY_EPOCH, dailyPuzzle, dateKey, dayNumber, previousDay, shareText, streak } from '../src/engine/daily';

const day = (i: number) => new Date(Date.parse(`${DAILY_EPOCH}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);

describe('daily puzzle', () => {
  it('is the same puzzle all day, for everyone', () => {
    const a = dailyPuzzle('2026-12-03'), b = dailyPuzzle('2026-12-03');
    expect(b.goal).toBe(a.goal);
    expect(b.answer).toEqual(a.answer);
    expect(a.id).toBe('daily-2026-12-03');
  });

  it('is always solvable by the pattern it was made from, within par, and varies from day to day', () => {
    const goals = new Set<string>();
    const kinds = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const p = dailyPuzzle(day(i));
      expect(p.number).toBe(i + 1);
      expect(p.answer.length).toBe(p.par);
      expect(p.answer.every(([x, y]) => x >= 0 && y >= 0 && x < 5 && y < 5)).toBe(true);
      expect(p.check(p.answer).ok, `${p.date}: ${p.goal}`).toBe(true);
      goals.add(`${p.goal}|${p.answer.join(';')}`);
      kinds.add(p.kind);
    }
    expect(goals.size).toBe(40);
    expect(kinds).toEqual(new Set(['lasts', 'vanish', 'ends']));
  });

  it('turns down wrong answers with a reason', () => {
    const p = dailyPuzzle(day(0));
    expect(p.check([]).ok).toBe(false);
    const tooMany = Array.from({ length: p.par + 1 }, (_, i) => [i * 3, 0] as [number, number]);
    expect(p.check(tooMany).message).toMatch(/at most/);
    expect(p.check([[0, 0], [1, 0]]).ok).toBe(false);
  });

  it('counts days and streaks', () => {
    expect(dayNumber(DAILY_EPOCH)).toBe(1);
    expect(previousDay('2027-01-01')).toBe('2026-12-31');
    expect(dateKey(new Date(2026, 10, 5))).toBe('2026-11-05');
    const solved = ['daily-2026-12-01', 'daily-2026-12-02', 'daily-2026-12-03', 'still'];
    expect(streak(solved, '2026-12-03')).toBe(3);
    expect(streak(solved, '2026-12-04')).toBe(3); // today not solved yet: the streak still stands
    expect(streak(solved, '2026-12-05')).toBe(0);
  });

  it('shares a result without giving the answer away', () => {
    const p = dailyPuzzle(day(0));
    const t = shareText(p, p.par);
    expect(t).toContain(`#${p.number}`);
    expect(t).not.toMatch(/\d+,\d+/);
  });
});
