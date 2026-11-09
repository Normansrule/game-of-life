import { describe, expect, it } from 'vitest';
import { normalize } from '../src/engine/life';
import { SHARE_LIMIT, parseShare, shareFragment } from '../src/engine/share';

const glider: [number, number][] = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];

describe('board links', () => {
  it('writes a short, readable fragment', () => {
    expect(shareFragment(glider, 'B3/S23', 'Glider')).toBe('sim/b3s23/bo$2bo$3o!/Glider');
  });

  it('reads back the same pattern, rule and name', () => {
    const f = shareFragment(glider.map(([x, y]) => [x + 40, y - 7]), 'B36/S23', 'My glider, v2')!;
    const s = parseShare(`#${f}`)!;
    expect(normalize(s.cells)).toEqual(normalize(glider));
    expect(s.rule).toBe('B36/S23');
    expect(s.name).toBe('My glider, v2');
  });

  it('ignores ordinary routes and broken links', () => {
    expect(parseShare('#sim')).toBeNull();
    expect(parseShare('#space')).toBeNull();
    expect(parseShare('#sim/b3s23/!')).toBeNull();
    expect(parseShare('#sim/q9/bo$2bo$3o!')).toBeNull();
    expect(parseShare('#sim/b3s23/bo$2bo$3o!/%E0%A4%A')?.name).toBeUndefined();
  });

  it('refuses patterns too big for a link', () => {
    // A checkerboard has no runs to compress, so its RLE is long.
    const big: [number, number][] = [];
    for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x += 2) big.push([x + (y % 2), y]);
    expect(shareFragment(big, 'B3/S23')).toBeNull();
    expect(SHARE_LIMIT).toBeGreaterThan(1000);
  });
});
