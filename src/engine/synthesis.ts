/**
 * Glider synthesis: building objects by crashing gliders together.
 *
 * Every glider here is aimed at a point. Its heading is one of the four
 * diagonals, its lane is how far it is shifted sideways (in whole cells,
 * along x or y) from a path straight through that point, and its delay holds it
 * back by 0 to 3 generations. Together, lane and delay reach every way a
 * glider can arrive. A recipe is a list of aimed gliders, plus optionally
 * something already on the board, and the engine decides what it builds.
 */
import { type Cell, evolveSparse } from './life';
import { components, identify, canonicalKey } from './objects';
import { patternCells } from './patterns';

export type Dir = 'SE' | 'SW' | 'NE' | 'NW';
export const DIRS: Dir[] = ['SE', 'SW', 'NE', 'NW'];
export const HEADING: Record<Dir, [number, number]> = { SE: [1, 1], SW: [-1, 1], NE: [1, -1], NW: [-1, -1] };
export const DIR_NAME: Record<Dir, string> = { SE: 'down and right', SW: 'down and left', NE: 'up and right', NW: 'up and left' };

/** A glider heading `dir`, in its standard phase, with its 3×3 box at (0, 0). */
export function gliderCells(dir: Dir): Cell[] {
  const [hx, hy] = HEADING[dir];
  // The library glider (bo$2bo$3o!) heads down and right; mirror it for the other three.
  return patternCells('glider').map(([x, y]) => [hx > 0 ? x : 2 - x, hy > 0 ? y : 2 - y] as Cell);
}

export interface Shot { dir: Dir; lane: number; delay: number }

/**
 * A glider aimed at `at` (a cell), starting `dist` diagonal steps away.
 * With lane 0 and delay 0 its centre would pass over `at` after 4·dist generations.
 */
export function aim(shot: Shot, at: Cell, dist = 10): Cell[] {
  const [hx, hy] = HEADING[shot.dir];
  // Put the glider one step further back than asked, then let it fly 4 − delay generations.
  const back = dist + 1;
  // Only a glider flying down and left is shifted along y; the rest along x. Then the second glider of
  // a pair is always shifted across the line along which it closes on the first (which flies down and right).
  const across = shot.dir !== 'SW';
  const ox = at[0] - 1 - hx * back + (across ? shot.lane : 0), oy = at[1] - 1 - hy * back + (across ? 0 : shot.lane);
  const start = gliderCells(shot.dir).map(([x, y]) => [x + ox, y + oy] as Cell);
  return evolveSparse(start, 4 - shot.delay);
}

/** The centre cell of a set of cells (rounded down). */
export function centreOf(cells: Cell[]): Cell {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  return [Math.floor((Math.min(...xs) + Math.max(...xs)) / 2), Math.floor((Math.min(...ys) + Math.max(...ys)) / 2)];
}

/** Count the named objects in a board ("?" for anything unnamed). */
export function census(cells: Cell[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const comp of components(cells)) {
    const k = identify(comp)?.name ?? '?';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export const censusKey = (m: Map<string, number>) => [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing';

/** Long enough for every reaction in this module to finish and its leftovers to fly apart. */
export const SETTLE = 300;

export interface Outcome {
  cells: Cell[];
  census: Map<string, number>;
  /** True when the gliders never touched: they all flew on unchanged. */
  missed: boolean;
}

/** Run a recipe (things already on the board plus aimed gliders) to the end and say what is left. */
export function build(base: Cell[], shots: Shot[], at: Cell = base.length ? centreOf(base) : [0, 0], dist = 10): Outcome {
  const gliders = shots.map((s) => aim(s, at, dist));
  const cells = evolveSparse([...base, ...gliders.flat()], SETTLE);
  const c = census(cells);
  const baseCensus = census(base);
  const expected = new Map(baseCensus);
  expected.set('Glider', (expected.get('Glider') ?? 0) + shots.length);
  const missed = censusKey(c) === censusKey(expected) && cells.length === base.length + gliders.flat().length;
  return { cells, census: c, missed };
}

/** The one object a board holds, if it holds exactly one (ignoring gliders that fly away when `ignoreGliders`). */
export function soleObject(m: Map<string, number>, ignoreGliders = false): string | null {
  const rest = [...m].filter(([k]) => !(ignoreGliders && k === 'Glider'));
  return rest.length === 1 && rest[0][1] === 1 && rest[0][0] !== '?' ? rest[0][0] : null;
}

// ---------- the two-glider catalogue ----------

/** Lanes tried for the second glider. Beyond these the two gliders always miss. */
export const LANE_RANGE = 12;

export interface Collision { shot: Shot; census: Map<string, number>; key: string }

/**
 * Every collision of two gliders: one fixed, flying down and right, and one
 * flying up and left (head on), or down and left or up and right (at right
 * angles), in every lane and with every delay. Settings where they miss are
 * left out.
 */
export function twoGliderCatalogue(): Collision[] {
  const out: Collision[] = [];
  const first: Shot = { dir: 'SE', lane: 0, delay: 0 };
  for (const dir of ['NW', 'SW', 'NE'] as Dir[])
    for (let lane = -LANE_RANGE; lane <= LANE_RANGE; lane++)
      for (let delay = 0; delay < 4; delay++) {
        const shot = { dir, lane, delay };
        const r = build([], [first, shot], [0, 0]);
        if (r.missed) continue;
        out.push({ shot, census: r.census, key: censusKey(r.census) });
      }
  return out;
}

/** How often each outcome turns up in the catalogue, most common first. */
export function outcomeCounts(cat: Collision[]): [string, number][] {
  const m = new Map<string, number>();
  for (const c of cat) m.set(c.key, (m.get(c.key) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ---------- recipes ----------

export interface Recipe {
  /** The object built. */
  name: string;
  /** Gliders in order; the first two collide, any third hits what they made. */
  shots: Shot[];
  /** The point the first two are aimed at; a third is aimed at the centre of what they built. */
  gliders: number;
}

/** Generations between the stages of a recipe: each later glider arrives once the last reaction has settled. */
export const STAGE = 200;

/**
 * Turn a recipe into one starting board with every glider already in flight.
 * The first two are aimed at (0, 0). Each later glider is aimed at what the
 * earlier ones have built by the time it is due, and starts far enough back to
 * arrive one stage later.
 */
export function recipeStart(r: Recipe, dist = 10): Cell[] {
  const start = r.shots.slice(0, 2).flatMap((s) => aim(s, [0, 0], dist));
  for (let k = 2; k < r.shots.length; k++) {
    const t = STAGE * (k - 1);
    const at = centreOf(madeObjectCells(evolveSparse(start, t)));
    start.push(...aim(r.shots[k], at, dist + t / 4));
  }
  return start;
}

/** How long a recipe's board must run before only the finished object is left. */
export const recipeLength = (r: Recipe) => STAGE * (r.shots.length - 2) + SETTLE;

/** The cells of the non-glider objects on a board. */
export function madeObjectCells(cells: Cell[]): Cell[] {
  return components(cells).filter((c) => identify(c)?.name !== 'Glider').flat();
}

/** Something worth firing another glider at: a little debris, all of it standing still or blinking. */
const isSeed = (m: Map<string, number>) => !m.has('Glider') && m.size > 0 && [...m.values()].reduce((a, b) => a + b, 0) <= 2;

/**
 * Find the cheapest recipe for every object that a few gliders can build
 * cleanly (nothing else left on the board). Two-glider recipes come from the
 * catalogue. Each further round takes every clean product of the round before
 * and fires one more glider at it, from every direction, lane and delay.
 */
export function findRecipes(cat = twoGliderCatalogue(), maxGliders = 3): Recipe[] {
  const first: Shot = { dir: 'SE', lane: 0, delay: 0 };
  const best = new Map<string, Recipe>();
  let seeds: { shots: Shot[]; cells: Cell[] }[] = [];
  const seen = new Set<string>();
  const addSeed = (shots: Shot[], cells: Cell[]) => {
    const k = canonicalKey(cells);
    if (!seen.has(k)) { seen.add(k); seeds.push({ shots, cells }); }
  };
  for (const c of cat) {
    const name = soleObject(c.census);
    if (name && name !== 'Glider' && !best.has(name)) best.set(name, { name, shots: [first, c.shot], gliders: 2 });
    if (isSeed(c.census)) addSeed([first, c.shot], evolveSparse([...aim(first, [0, 0]), ...aim(c.shot, [0, 0])], SETTLE));
  }
  for (let n = 3; n <= maxGliders; n++) {
    const round = seeds;
    seeds = [];
    for (const seed of round) {
      const at = centreOf(seed.cells);
      for (const dir of DIRS)
        for (let lane = -8; lane <= 8; lane++)
          for (let delay = 0; delay < 4; delay++) {
            const shot = { dir, lane, delay };
            const r = build(seed.cells, [shot], at);
            if (r.missed) continue;
            const name = soleObject(r.census);
            if (name && name !== 'Glider' && !best.has(name)) best.set(name, { name, shots: [...seed.shots, shot], gliders: n });
            if (n < maxGliders && isSeed(r.census)) addSeed([...seed.shots, shot], r.cells);
          }
    }
  }
  return [...best.values()].sort((a, b) => a.gliders - b.gliders || a.name.localeCompare(b.name));
}

const S = (dir: Dir, lane: number, delay: number): Shot => ({ dir, lane, delay });
const G1 = S('SE', 0, 0);

/**
 * The recipe book: the fewest gliders this search needs for each object.
 * Found by findRecipes(twoGliderCatalogue(), 4), which takes about two minutes,
 * so the answers are kept here and the tests check every one still works.
 */
export const RECIPES: Recipe[] = [
  { name: 'Block', gliders: 2, shots: [G1, S('NW', -7, 3)] },
  { name: 'Blinker', gliders: 2, shots: [G1, S('NW', -4, 2)] },
  { name: 'Beehive', gliders: 2, shots: [G1, S('SW', -3, 0)] },
  { name: 'Pond', gliders: 2, shots: [G1, S('NW', -6, 1)] },
  { name: 'Boat', gliders: 2, shots: [G1, S('NW', -4, 3)] },
  { name: 'Loaf', gliders: 2, shots: [G1, S('NW', -3, 2)] },
  { name: 'Eater', gliders: 2, shots: [G1, S('SW', 3, 3)] },
  { name: 'Ship', gliders: 3, shots: [G1, S('NW', -6, 1), S('SE', 0, 0)] },
  { name: 'Tub', gliders: 3, shots: [G1, S('NW', -6, 1), S('SE', -6, 0)] },
  { name: 'Beacon', gliders: 4, shots: [G1, S('SW', -4, 2), S('NE', 7, 0), S('SW', -2, 1)] },
  { name: 'Long boat', gliders: 4, shots: [G1, S('SW', -4, 2), S('NE', -4, 1), S('SW', -3, 1)] },
];

// ---------- stages, for watching a recipe ----------

export interface Stage {
  /** What is already on the board. */
  before: Cell[];
  /** The gliders that fly in at this stage. */
  incoming: Cell[];
  /** What is left once the reaction has settled. */
  after: Cell[];
  /** Generations until it has settled. */
  settles: number;
}

/** The generation from which a board only repeats with period 1 or 2 (still lifes and blinkers), up to `max`. */
export function settleTime(cells: Cell[], max = SETTLE): number {
  const k = (c: Cell[]) => c.map(([x, y]) => `${x},${y}`).sort().join(';');
  let a = cells, b = evolveSparse(cells, 1), c = evolveSparse(b, 1);
  for (let t = 0; t < max; t++) {
    if (k(a) === k(c)) return t;
    a = b; b = c; c = evolveSparse(c, 1);
  }
  return max;
}

/** A recipe one stage at a time: the first two gliders, then each later glider fired at what is there. */
export function recipeStages(r: Recipe, dist = 10): Stage[] {
  const out: Stage[] = [];
  const first = r.shots.slice(0, 2).flatMap((s) => aim(s, [0, 0], dist));
  let after = evolveSparse(first, SETTLE);
  out.push({ before: [], incoming: first, after, settles: settleTime(first) });
  for (const shot of r.shots.slice(2)) {
    const incoming = aim(shot, centreOf(after), dist);
    const start = [...after, ...incoming];
    const next = evolveSparse(start, SETTLE);
    out.push({ before: after, incoming, after: next, settles: settleTime(start) });
    after = next;
  }
  return out;
}
