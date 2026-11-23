import { describe, expect, it } from 'vitest';
import {
  DIRS, HEADING, RECIPES, aim, build, census, censusKey, gliderCells, outcomeCounts, recipeLength, recipeStages, recipeStart, settleTime, soleObject, twoGliderCatalogue,
} from '../src/engine/synthesis';
import { evolveSparse } from '../src/engine/life';
import { translationKey } from '../src/engine/objects';

const cat = twoGliderCatalogue();

describe('glider synthesis', () => {
  it('points each glider the way it says, and aims it through the target', () => {
    for (const dir of DIRS) {
      const g = gliderCells(dir);
      const [hx, hy] = HEADING[dir];
      expect(translationKey(evolveSparse(g, 4))).toBe(translationKey(g));
      expect(evolveSparse(g, 4).map(([x, y]) => [x - hx, y - hy]).sort().join()).toBe([...g].sort().join());
      // With lane 0 and no delay the glider covers the target cell on its way past.
      const shot = aim({ dir, lane: 0, delay: 0 }, [5, 7], 6);
      let hit = false;
      for (let t = 0, c = shot; t < 40 && !hit; t++, c = evolveSparse(c, 1)) hit = c.some(([x, y]) => Math.abs(x - 5) <= 1 && Math.abs(y - 7) <= 1);
      expect(hit, dir).toBe(true);
    }
  });

  it('catalogues every two-glider collision', () => {
    expect(cat).toHaveLength(126);
    const counts = new Map(outcomeCounts(cat));
    expect(counts.get('nothing')).toBe(49);
    expect(counts.get('1 Block')).toBe(8);
    expect(counts.get('4 Beehive')).toBe(10);
    // Beyond the lanes tried, every crash is a miss, so the catalogue is complete.
    for (const dir of ['NW', 'SW', 'NE'] as const) for (const lane of [-12, -11, 11, 12]) for (let delay = 0; delay < 4; delay++)
      expect(build([], [{ dir: 'SE', lane: 0, delay: 0 }, { dir, lane, delay }]).missed, `${dir} ${lane} ${delay}`).toBe(true);
    // Two gliders that miss are not in the catalogue.
    expect(build([], [{ dir: 'SE', lane: 0, delay: 0 }, { dir: 'NW', lane: 12, delay: 0 }]).missed).toBe(true);
  });

  it('every recipe in the book builds its object, with all its gliders in flight at once', () => {
    expect(RECIPES).toHaveLength(11);
    for (const r of RECIPES) {
      expect(r.shots).toHaveLength(r.gliders);
      const end = evolveSparse(recipeStart(r), recipeLength(r));
      expect(censusKey(census(end)), r.name).toBe(`1 ${r.name}`);
    }
  });

  it('two-glider recipes are in the catalogue, and nothing in the book that needs three can be made with two', () => {
    const two = new Set(cat.map((c) => soleObject(c.census)).filter(Boolean));
    for (const r of RECIPES) expect(two.has(r.name), r.name).toBe(r.gliders === 2);
  });
});

describe('watching a recipe', () => {
  it('ends each stage where the next one starts, and the last on the finished object', () => {
    for (const r of RECIPES) {
      const st = recipeStages(r);
      expect(st).toHaveLength(r.gliders - 1);
      for (let i = 1; i < st.length; i++) expect(st[i].before).toEqual(st[i - 1].after);
      expect(censusKey(census(st.at(-1)!.after)), r.name).toBe(`1 ${r.name}`);
      for (const s of st) expect(s.settles).toBeLessThan(300);
    }
    expect(settleTime([[0, 0], [1, 0], [2, 0]])).toBe(0);
  });
});
