import { describe, expect, it } from 'vitest';
import { chooseMove, run, score, step } from '../src/engine/immigration';

const W = 7, H = 7;
const board = (stones: [number, number, number][]) => {
  const b = new Uint8Array(W * H);
  for (const [x, y, v] of stones) b[y * W + x] = v;
  return b;
};

describe('Immigration', () => {
  it('keeps the colour of surviving stones (a mixed block is still)', () => {
    const b = board([[2, 2, 1], [3, 2, 2], [2, 3, 2], [3, 3, 1]]);
    expect(step(b, W, H)).toEqual(b);
  });

  it('gives a newborn the colour of most of its parents', () => {
    // A blinker of two blacks and one white: the two births next to the middle are black.
    const b = board([[2, 3, 1], [3, 3, 2], [4, 3, 1]]);
    const n = step(b, W, H);
    expect(n[2 * W + 3]).toBe(1);
    expect(n[4 * W + 3]).toBe(1);
    expect(n[3 * W + 3]).toBe(2);
    expect(score(n)).toEqual([2, 1]);
  });

  it('matches plain Life when colours are ignored', () => {
    const b = board([[1, 0, 1], [2, 1, 2], [0, 2, 1], [1, 2, 2], [2, 2, 1]]);
    const live = (x: Uint8Array) => [...x].map((v) => (v ? 1 : 0));
    // A glider runs four generations and moves one point down-right.
    const after = run(b, W, H, 4);
    expect(live(after)).toEqual(live(board([[2, 1, 1], [3, 2, 1], [1, 3, 1], [2, 3, 1], [3, 3, 1]])));
  });

  it('picks an empty point that helps its own side', () => {
    // Two white stones in a row: a third makes a blinker, which keeps white alive.
    const b = board([[2, 3, 2], [3, 3, 2]]);
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const i = chooseMove(b, W, H, 2, 6, 'hard', rnd);
    expect(b[i]).toBe(0);
    const t = new Uint8Array(b);
    t[i] = 2;
    expect(score(run(t, W, H, 6))[1]).toBeGreaterThan(0);
  });
});
