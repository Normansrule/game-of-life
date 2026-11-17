/**
 * The daily puzzle: a new construction challenge every day, made from the
 * date alone, so everyone gets the same one without a server.
 *
 * The date seeds a random search over small patterns in a 5×5 box. The
 * first pattern whose fate makes a good goal becomes the day's answer: the
 * goal is written from what that pattern does, so every daily puzzle is
 * solvable, and par is the number of stones it used. Any pattern that meets
 * the goal counts, and fewer stones than par is better.
 */
import { mulberry32 } from './census';
import { FateRunner } from './exhaustive';
import { type Cell, evolveSparse } from './life';
import { components, identify } from './objects';
import { type Puzzle, type Verdict, describe } from './puzzles';

export type DailyKind = 'lasts' | 'vanish' | 'ends';

export interface Daily extends Puzzle {
  kind: DailyKind;
  date: string;
  /** Day 1 is the first day the daily puzzle ran. */
  number: number;
  /** Stones in the pattern the goal was made from. */
  par: number;
  /** A pattern that solves it (the one the goal was made from). */
  answer: Cell[];
}

/** The first daily puzzle. */
export const DAILY_EPOCH = '2026-11-17';
export const BOX = 5;
const BOARD = 10;
const MAX_GEN = 3000;

/** Today's date in the player's own time zone, as YYYY-MM-DD. */
export function dateKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dayNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${DAILY_EPOCH}T00:00:00Z`);
  return Math.round(ms / 86400000) + 1;
}

/** The day before, as YYYY-MM-DD. */
export function previousDay(date: string): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) - 86400000);
  return d.toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

let runner: FateRunner | undefined;
const fate = (cells: Cell[], maxGen = MAX_GEN) => (runner ??= new FateRunner()).run(cells, maxGen);

const plural = (n: number, w: string) => `${n.toLocaleString('en-GB')} ${w}${n === 1 ? '' : 's'}`;

/** What a settled pattern is made of, e.g. { Block: 2, Blinker: 1 }, or null if anything in it has no name. */
function census(cells: Cell[]): Map<string, number> | null {
  const out = new Map<string, number>();
  for (const comp of components(cells)) {
    const known = identify(comp);
    if (!known) return null;
    out.set(known.name, (out.get(known.name) ?? 0) + 1);
  }
  return out;
}

function censusText(c: Map<string, number>): string {
  const parts = [...c].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => {
    const lower = name.toLowerCase();
    return n === 1 ? `${/^[aeiou]/.test(lower) ? 'an' : 'a'} ${lower}` : `${n} ${lower}${/s$/.test(lower) ? 'es' : 's'}`;
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

const sameCensus = (a: Map<string, number>, b: Map<string, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

function randomPattern(rng: () => number): Cell[] {
  const n = 5 + Math.floor(rng() * 4); // 5 to 8 stones
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(rng() * BOX * BOX));
  return [...picked].map((i) => [i % BOX, Math.floor(i / BOX)] as Cell);
}

/** Make the puzzle for a date (YYYY-MM-DD). The same date always gives the same puzzle. */
export function dailyPuzzle(date: string): Daily {
  const rng = mulberry32(hash(`life-tree daily ${date}`));
  const kinds: DailyKind[] = ['lasts', 'vanish', 'ends'];
  const kind = kinds[Math.floor(rng() * kinds.length)];
  for (let tries = 0; tries < 5000; tries++) {
    const cells = randomPattern(rng);
    const p = make(kind, cells, date);
    if (p) return p;
  }
  // Every kind finds a pattern within a few hundred tries; this is only a safety net.
  return make('lasts', [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]], date)!;
}

function make(kind: DailyKind, answer: Cell[], date: string): Daily | null {
  // While searching, stop each run as soon as it is too long for this kind of goal.
  const f = fate(answer, kind === 'vanish' ? 450 : kind === 'ends' ? 1500 : MAX_GEN);
  if (f.fate === 'unsettled') return null;
  const par = answer.length;
  const base = {
    id: `daily-${date}`,
    title: 'Daily puzzle',
    w: BOARD,
    h: BOARD,
    maxCells: par,
    kind,
    date,
    number: dayNumber(date),
    par,
    answer,
  };
  const limit = (check: (cells: Cell[]) => Verdict) => (cells: Cell[]): Verdict => {
    if (!cells.length) return { ok: false, message: 'Place some stones first: tap or drag on the board.' };
    if (cells.length > par) return { ok: false, message: `Use at most ${plural(par, 'stone')} (you have ${cells.length}).` };
    return check(cells);
  };

  if (kind === 'lasts') {
    if (f.lifespan < 80 || f.lifespan > 2500) return null;
    const target = Math.floor(f.lifespan / 10) * 10;
    return {
      ...base,
      difficulty: target >= 400 ? 'hard' : 'medium',
      goal: `Use at most ${plural(par, 'stone')} to make a pattern that keeps changing for at least ${plural(target, 'generation')}.`,
      hint: `Today's answer fits in a ${BOX}×${BOX} box. Loose, lopsided clusters tend to last longer than neat ones.`,
      check: limit((cells) => {
        const r = fate(cells);
        if (r.fate === 'unsettled' || r.lifespan >= target) return { ok: true, message: `It keeps changing for ${r.fate === 'unsettled' ? `more than ${plural(MAX_GEN, 'generation')}` : plural(r.lifespan, 'generation')}.` };
        return { ok: false, message: describe(cells) };
      }),
    };
  }

  if (kind === 'vanish') {
    if (f.fate !== 'dies' || f.escaped || f.lifespan < 10 || f.lifespan > 400) return null;
    const target = f.lifespan;
    return {
      ...base,
      difficulty: target >= 60 ? 'hard' : 'medium',
      goal: `Use at most ${plural(par, 'stone')} to make a pattern that vanishes completely in exactly ${plural(target, 'generation')}, without sending anything away.`,
      hint: `Today's answer fits in a ${BOX}×${BOX} box. Watch a near miss run to see when it dies, then nudge one stone.`,
      check: limit((cells) => {
        const r = fate(cells);
        if (r.fate === 'dies' && !r.escaped && r.lifespan === target) return { ok: true, message: `Gone in exactly ${plural(target, 'generation')}.` };
        return { ok: false, message: describe(cells) };
      }),
    };
  }

  // 'ends': settles, with nothing flying off, into two to four named objects.
  if (f.escaped || f.fate === 'dies' || f.lifespan < 20) return null;
  const end = census(evolveSparse(answer, f.lifespan));
  if (!end) return null;
  const count = [...end.values()].reduce((s, n) => s + n, 0);
  if (count < 2 || count > 4) return null;
  const text = censusText(end);
  return {
    ...base,
    difficulty: count >= 3 ? 'hard' : 'medium',
    goal: `Use at most ${plural(par, 'stone')} to make a pattern that settles into exactly ${text}, and nothing else.`,
    hint: `Today's answer fits in a ${BOX}×${BOX} box and takes ${plural(f.lifespan, 'generation')} to settle.`,
    check: limit((cells) => {
      const r = fate(cells);
      if (r.fate !== 'unsettled' && r.fate !== 'dies' && !r.escaped) {
        const got = census(evolveSparse(cells, r.lifespan));
        if (got && sameCensus(got, end)) return { ok: true, message: `It settles into ${text} after ${plural(r.lifespan, 'generation')}.` };
        if (got) return { ok: false, message: `That settles into ${censusText(got)}, not ${text}.` };
      }
      return { ok: false, message: describe(cells) };
    }),
  };
}

/**
 * Days in a row solved, ending today, or yesterday if today isn't solved
 * yet, so a streak isn't lost before the day is over.
 */
export function streak(solved: Iterable<string>, today: string): number {
  const days = new Set([...solved].filter((id) => id.startsWith('daily-')).map((id) => id.slice(6)));
  let d = days.has(today) ? today : previousDay(today);
  let n = 0;
  while (days.has(d)) { n++; d = previousDay(d); }
  return n;
}

/** A spoiler-free line to share a result, e.g. "Life Tree daily #3: 6 stones (par 7)". */
export function shareText(p: Daily, stones: number): string {
  const vs = stones < p.par ? `${p.par - stones} under par` : 'at par';
  return `Life Tree daily #${p.number}, ${p.date}: solved with ${plural(stones, 'stone')} (${vs}) ${'●'.repeat(stones)}${'○'.repeat(Math.max(0, p.par - stones))}`;
}
