/**
 * Puzzles: small construction challenges, each checked automatically by
 * running the engine on the player's pattern.
 */
import { type Cell, evolveSparse } from './life';
import { describePeriodicity, findPeriod, identify } from './objects';
import { FateRunner } from './exhaustive';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Verdict {
  ok: boolean;
  message: string;
}

export interface Puzzle {
  id: string;
  title: string;
  difficulty: Difficulty;
  /** The goal, in a sentence. */
  goal: string;
  hint: string;
  w: number;
  h: number;
  maxCells?: number;
  check(cells: Cell[]): Verdict;
}

const fateRunner = () => (shared ??= new FateRunner());
let shared: FateRunner | undefined;

function fate(cells: Cell[], maxGen = 6000) {
  return fateRunner().run(cells, maxGen);
}

function periodic(cells: Cell[]) {
  const p = findPeriod(cells, 60);
  return p ? { ...p, text: describePeriodicity(p) } : null;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** What the pattern does, in a few words, for feedback on a wrong answer. */
export function describe(cells: Cell[]): string {
  if (!cells.length) return 'The board is empty.';
  const p = periodic(cells);
  if (p) {
    const known = identify(cells);
    const an = /^[aeiou]/.test(p.text) ? 'an' : 'a';
    return `That is ${an} ${p.text}${known ? `: the ${known.name.toLowerCase()}` : ''}.`;
  }
  const f = fate(cells);
  if (f.fate === 'unsettled') return 'That pattern is still changing after 6000 generations.';
  const gl = f.escaped ? ', sending something off into space' : '';
  if (f.fate === 'dies') return `That pattern dies out after ${plural(f.lifespan, 'generation')}${gl}.`;
  return `That pattern changes for ${plural(f.lifespan, 'generation')}, then settles into ${f.period === 1 ? 'still lifes' : `a period-${f.period} cycle`} with ${plural(f.finalPopulation, 'cell')}${gl}.`;
}

function withLimit(p: Omit<Puzzle, 'check'>, check: (cells: Cell[]) => Verdict): Puzzle {
  return {
    ...p,
    check(cells) {
      if (!cells.length) return { ok: false, message: 'Draw a pattern first: click or drag on the grid.' };
      if (p.maxCells && cells.length > p.maxCells) return { ok: false, message: `Use at most ${plural(p.maxCells, 'live cell')} (you have ${cells.length}).` };
      return check(cells);
    },
  };
}

/** Final settled cells of a pattern that ends without escapes, or null. */
function settledCells(cells: Cell[]): Cell[] | null {
  const f = fate(cells, 2000);
  if (f.fate === 'unsettled' || f.escaped) return null;
  return evolveSparse(cells, f.lifespan);
}

export const PUZZLES: Puzzle[] = [
  withLimit({ id: 'still', title: 'Frozen', difficulty: 'easy', goal: 'Draw a still life: a pattern that never changes.', hint: 'Four cells in a 2×2 square is the simplest. Every live cell needs 2 or 3 live neighbours, and no dead cell may have exactly 3.', w: 10, h: 10 },
    (cells) => {
      const p = periodic(cells);
      return p && p.period === 1 ? { ok: true, message: `Still life with ${plural(cells.length, 'cell')}${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` } : { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'blink', title: 'Heartbeat', difficulty: 'easy', goal: 'Draw an oscillator of period 2: it returns to itself every second generation.', hint: 'Three cells in a row turn into three in a column and back.', w: 10, h: 10 },
    (cells) => {
      const p = periodic(cells);
      return p && p.period === 2 && !p.dx && !p.dy ? { ok: true, message: `Period-2 oscillator${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` } : { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'seven', title: 'Lucky seven', difficulty: 'medium', goal: 'Draw a still life with exactly 7 live cells.', hint: 'Start from a beehive (6 cells) and look for a way to bend one side. The loaf is one answer; there are four.', w: 10, h: 10 },
    (cells) => {
      if (cells.length !== 7) return { ok: false, message: `It needs exactly 7 cells; you have ${cells.length}.` };
      const p = periodic(cells);
      return p && p.period === 1 ? { ok: true, message: `A 7-cell still life${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` } : { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'hive', title: 'Hive mind', difficulty: 'medium', goal: 'Draw at most 4 cells that grow into a beehive and nothing else.', hint: 'Try a short straight line.', w: 10, h: 10, maxCells: 4 },
    (cells) => {
      const end = settledCells(cells);
      const obj = end && identify(end);
      if (obj?.name === 'Beehive') return { ok: true, message: `It becomes a beehive after ${plural(fate(cells).lifespan, 'generation')}.` };
      return { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'move', title: 'Lift-off', difficulty: 'medium', goal: 'Draw a spaceship: a pattern that travels across the board.', hint: 'The glider has five cells and moves one cell diagonally every four generations.', w: 10, h: 10 },
    (cells) => {
      const p = periodic(cells);
      return p && (p.dx || p.dy) ? { ok: true, message: `A ${p.text}${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` } : { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'vanish', title: 'Countdown', difficulty: 'medium', goal: 'Draw a pattern that vanishes completely in exactly 5 generations.', hint: 'Small diagonal lines and loose clusters die quickly. Try a few cells and press Check to see how long they last.', w: 10, h: 10 },
    (cells) => {
      const f = fate(cells);
      if (f.fate === 'dies' && !f.escaped && f.lifespan === 5) return { ok: true, message: 'Gone in exactly 5 generations.' };
      return { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'tiny', title: 'Small but mighty', difficulty: 'medium', goal: 'Use at most 5 cells to make a pattern that keeps changing for at least 500 generations.', hint: 'There is a famous 5-cell methuselah that fits in a 3×3 box.', w: 10, h: 10, maxCells: 5 },
    (cells) => {
      const f = fate(cells);
      if (f.fate === 'unsettled' || f.lifespan >= 500) return { ok: true, message: `It keeps going for ${plural(f.lifespan, 'generation')} and peaks at ${plural(f.maxPopulation, 'cell')}${f.escaped ? ', not counting the gliders it fires' : ''}.` };
      return { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'diehard', title: 'Die hard', difficulty: 'hard', goal: 'Draw a pattern that vanishes completely, but only after at least 100 generations, without sending anything away.', hint: 'The famous answer has 7 cells in an 8×3 box and lasts 130 generations.', w: 14, h: 10 },
    (cells) => {
      const f = fate(cells);
      if (f.fate === 'dies' && !f.escaped && f.lifespan >= 100) return { ok: true, message: `It lasts ${plural(f.lifespan, 'generation')} and then disappears without a trace.` };
      return { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'big-ship', title: 'Not a glider', difficulty: 'hard', goal: 'Draw a spaceship that is not a glider.', hint: 'The lightweight spaceship has 9 cells and moves horizontally at half the speed of light.', w: 12, h: 10 },
    (cells) => {
      const p = periodic(cells);
      if (p && (p.dx || p.dy) && !(p.period === 4 && Math.abs(p.dx) === 1 && Math.abs(p.dy) === 1)) return { ok: true, message: `A ${p.text}${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` };
      if (p && (p.dx || p.dy)) return { ok: false, message: 'That is a glider. Find a different ship.' };
      return { ok: false, message: describe(cells) };
    }),
  withLimit({ id: 'p3', title: 'Waltz', difficulty: 'hard', goal: 'Draw an oscillator of period 3.', hint: 'The pulsar is the famous one: 48 cells with four-fold symmetry in a 13×13 box, built from rows of three.', w: 17, h: 17 },
    (cells) => {
      const p = periodic(cells);
      return p && p.period === 3 && !p.dx && !p.dy ? { ok: true, message: `Period-3 oscillator${identify(cells) ? `: the ${identify(cells)!.name.toLowerCase()}` : ''}.` } : { ok: false, message: describe(cells) };
    }),
];

export function getPuzzle(id: string): Puzzle | undefined {
  return PUZZLES.find((p) => p.id === id);
}
