import type { Cell } from './life';
import { parseRLE } from './rle';

export type PatternCategory = 'Still life' | 'Oscillator' | 'Spaceship' | 'Methuselah' | 'Gun' | 'Growth';

export interface PatternDef {
  id: string;
  name: string;
  category: PatternCategory;
  rle: string;
  /** Period for oscillators, spaceships and guns. */
  period?: number;
  /** Displacement per period for spaceships, e.g. "c/4 diagonal". */
  speed?: string;
  description: string;
  discovered?: string;
}

export const PATTERNS: PatternDef[] = [
  // Still lifes
  { id: 'block', name: 'Block', category: 'Still life', rle: '2o$2o!', description: 'The most common still life. Every cell has exactly three neighbours.' },
  { id: 'beehive', name: 'Beehive', category: 'Still life', rle: 'b2o$o2bo$b2o!', description: 'Second most common still life; the end state of many small reactions.' },
  { id: 'loaf', name: 'Loaf', category: 'Still life', rle: 'b2o$o2bo$bobo$2bo!', description: 'A seven-cell still life.' },
  { id: 'boat', name: 'Boat', category: 'Still life', rle: '2o$obo$bo!', description: 'The only five-cell still life.' },
  { id: 'tub', name: 'Tub', category: 'Still life', rle: 'bo$obo$bo!', description: 'Four cells around an empty centre.' },
  { id: 'ship', name: 'Ship', category: 'Still life', rle: '2o$obo$b2o!', description: 'A six-cell still life.' },
  { id: 'pond', name: 'Pond', category: 'Still life', rle: 'b2o$o2bo$o2bo$b2o!', description: 'An eight-cell ring.' },

  // Oscillators
  { id: 'blinker', name: 'Blinker', category: 'Oscillator', rle: '3o!', period: 2, description: 'The smallest and most common oscillator.' },
  { id: 'toad', name: 'Toad', category: 'Oscillator', rle: 'b3o$3o!', period: 2, description: 'A period 2 oscillator found by Simon Norton in 1970.' },
  { id: 'beacon', name: 'Beacon', category: 'Oscillator', rle: '2o$2o$2b2o$2b2o!', period: 2, description: 'Two blocks that blink at their touching corners.' },
  { id: 'pulsar', name: 'Pulsar', category: 'Oscillator', period: 3, rle: '2b3o3b3o2b2$o4bobo4bo$o4bobo4bo$o4bobo4bo$2b3o3b3o2b2$2b3o3b3o2b$o4bobo4bo$o4bobo4bo$o4bobo4bo2$2b3o3b3o!', description: 'The most common period 3 oscillator, with 4-fold symmetry.' },
  { id: 'pentadecathlon', name: 'Pentadecathlon', category: 'Oscillator', period: 15, rle: '2bo4bo2b$2ob4ob2o$2bo4bo!', description: 'Period 15. It emerges from a row of ten cells.' },

  // Spaceships
  { id: 'glider', name: 'Glider', category: 'Spaceship', rle: 'bo$2bo$3o!', period: 4, speed: 'c/4 diagonal', description: 'The smallest spaceship and the "particle" used to carry signals in Life computers.', discovered: 'Richard Guy, 1969' },
  { id: 'lwss', name: 'Lightweight spaceship', category: 'Spaceship', rle: 'bo2bo$o4b$o3bo$4o!', period: 4, speed: 'c/2 orthogonal', description: 'The smallest orthogonal spaceship.' },
  { id: 'mwss', name: 'Middleweight spaceship', category: 'Spaceship', rle: '3bo$bo3bo$o$o4bo$5o!', period: 4, speed: 'c/2 orthogonal', description: 'A longer cousin of the LWSS.' },
  { id: 'hwss', name: 'Heavyweight spaceship', category: 'Spaceship', rle: '3b2o$bo4bo$o$o5bo$6o!', period: 4, speed: 'c/2 orthogonal', description: 'The largest of the three classic c/2 ships.' },
  { id: 'copperhead', name: 'Copperhead', category: 'Spaceship', rle: 'b2o2b2o$3b2o$3b2o$obo2bobo$o6bo2$o6bo$b2o2b2o$2b4o2$3b2o$3b2o!', period: 10, speed: 'c/10 orthogonal', description: 'A small, slow spaceship discovered in 2016 by "zdr".', discovered: '2016' },

  // Methuselahs
  { id: 'rpentomino', name: 'R-pentomino', category: 'Methuselah', rle: 'b2o$2o$bo!', description: 'Five cells that take 1103 generations to settle, launching six gliders.', discovered: 'Conway, 1970' },
  { id: 'acorn', name: 'Acorn', category: 'Methuselah', rle: 'bo$3bo$2o2b3o!', description: 'Seven cells that run for 5206 generations, ending with 633 cells.' },
  { id: 'diehard', name: 'Diehard', category: 'Methuselah', rle: '6bo$2o$bo3b3o!', description: 'Vanishes completely after exactly 130 generations.' },
  { id: 'piheptomino', name: 'Pi-heptomino', category: 'Methuselah', rle: '3o$obo$obo!', description: 'A common, symmetric methuselah lasting 173 generations.' },
  { id: 'bheptomino', name: 'B-heptomino', category: 'Methuselah', rle: 'ob2o$3o$bo!', description: 'Settles after 148 generations; a key ingredient in many reactions.' },
  { id: 'rabbits', name: 'Rabbits', category: 'Methuselah', rle: 'o3b3o$3o2bo$bo!', description: 'Nine cells that run for 17,331 generations.' },

  // Guns
  { id: 'gosper', name: 'Gosper glider gun', category: 'Gun', period: 30, rle: '24bo$22bobo$12b2o6b2o12b2o$11bo3bo4b2o12b2o$2o8bo5bo3b2o$2o8bo3bob2o4bobo$10bo5bo7bo$11bo3bo$12b2o!', description: 'The first known gun, proving that finite patterns can grow forever.', discovered: 'Bill Gosper, 1970' },
  { id: 'simkin', name: 'Simkin glider gun', category: 'Gun', period: 120, rle: '2o5b2o$2o5b2o2$4b2o$4b2o5$22b2ob2o$21bo5bo$21bo6bo2b2o$21b3o3bo3b2o$26bo4$20b2o$20bo$21b3o$23bo!', description: 'The smallest known glider gun by population (36 cells).', discovered: 'Michael Simkin, 2015' },

  // Unbounded growth
  { id: 'switchengine', name: 'Infinite growth (10 cells)', category: 'Growth', rle: '6bo$4bob2o$4bobo$4bo$2bo$obo!', description: 'The smallest known pattern that grows without bound: a block-laying switch engine.', discovered: 'Paul Callahan, 1997' },
  { id: 'line', name: 'Infinite growth (1 row)', category: 'Growth', rle: '8ob5o3b3o6b7ob5o!', description: 'A single row of 39 cells that grows forever.' },
];

const cache = new Map<string, Cell[]>();

export function patternCells(p: PatternDef | string): Cell[] {
  const def = typeof p === 'string' ? PATTERNS.find((q) => q.id === p) : p;
  if (!def) throw new Error(`Unknown pattern ${p}`);
  let c = cache.get(def.id);
  if (!c) {
    c = parseRLE(def.rle).cells;
    cache.set(def.id, c);
  }
  return c;
}

export function getPattern(id: string): PatternDef | undefined {
  return PATTERNS.find((p) => p.id === id);
}

/** Apply one of the 8 symmetries of the square (dihedral group D4). */
export function transform(cells: Cell[], rot: number, flip: boolean): Cell[] {
  return cells.map(([x, y]) => {
    let px = flip ? -x : x;
    let py = y;
    for (let r = 0; r < ((rot % 4) + 4) % 4; r++) [px, py] = [-py, px];
    return [px, py] as Cell;
  });
}
