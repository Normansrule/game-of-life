/**
 * The field guide's facts. Nothing here is typed in by hand: every number is
 * measured by running the pattern.
 *
 * Patterns that repeat (still lifes, oscillators, spaceships) are run for one
 * period, which gives the period, the speed, the population range, the heat
 * (cells that change each generation, on average) and the rotor and stator
 * (cells that change at some point, and cells that are always alive).
 *
 * Methuselahs are run to the end on a large field, where gliders and other
 * spaceships are taken away once they are flying clear, and the generation
 * the rest settles is its lifespan. These runs take from a few milliseconds
 * to half a minute, so the view runs them in a worker.
 *
 * Guns are run until the gun itself repeats; the stream of gliders it fires
 * gives the gliders per period. Growth patterns are run for 2,000 generations.
 */
import { FateRunner } from './exhaustive';
import { type Cell, bounds, evolveSparse } from './life';
import { describePeriodicity, findPeriod } from './objects';
import { type PatternDef, patternCells } from './patterns';

export interface CycleFacts {
  period: number;
  /** For spaceships, e.g. "c/4 diagonal". */
  speed?: string;
  minPop: number;
  maxPop: number;
  /** Cells that are born or die per generation, averaged over a period. */
  heat: number;
  /** Cells that change at some point in the cycle (oscillators only). */
  rotor?: number;
  /** Cells alive throughout the cycle (still lifes and oscillators). */
  stator?: number;
}

export interface RunFacts {
  /** The generation the pattern settles (dies, or starts to repeat), ignoring spaceships that fly off. */
  lifespan: number;
  ending: 'dies' | 'still' | 'oscillates' | 'unsettled';
  /** Period of what is left, 1 for still lifes. */
  endPeriod: number;
  peakPop: number;
  /** Cells left at the end, not counting spaceships that flew off. */
  finalPop: number;
  /** Gliders and other spaceships that flew off. */
  escapes: number;
  /** Population every `step` generations, for a sparkline. */
  trace: number[];
  step: number;
}

export interface GunFacts {
  period: number;
  /** Gliders fired per period. */
  perPeriod: number;
}

export interface GrowthFacts {
  /** Population at generations 0, 100, 200, … 2000. */
  trace: number[];
  step: number;
  final: number;
}

export interface Facts {
  cells: number;
  width: number;
  height: number;
  cycle?: CycleFacts;
  gun?: GunFacts;
}

const key = (x: number, y: number) => `${x},${y}`;

/** Facts that are quick to measure, for every pattern. Methuselahs also need {@link measureRun} and growth patterns {@link measureGrowth}. */
export function measure(def: PatternDef): Facts {
  const cells = patternCells(def);
  const b = bounds(cells)!;
  const facts: Facts = { cells: cells.length, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 };
  if (def.category === 'Still life' || def.category === 'Oscillator' || def.category === 'Spaceship') facts.cycle = measureCycle(cells);
  else if (def.category === 'Gun') facts.gun = measureGun(cells);
  return facts;
}

export function measureCycle(cells: Cell[]): CycleFacts | undefined {
  const p = findPeriod(cells, 120);
  if (!p) return undefined;
  // One period, phase by phase.
  let cur = cells, heat = 0, minPop = cells.length, maxPop = cells.length;
  const ever = new Set<string>();
  let always: Set<string> | null = null;
  for (let t = 0; t < p.period; t++) {
    const here = new Set(cur.map(([x, y]) => key(x, y)));
    for (const k of here) ever.add(k);
    always = always ? new Set([...always].filter((k: string) => here.has(k))) : here;
    const next = evolveSparse(cur, 1);
    const then = new Set(next.map(([x, y]) => key(x, y)));
    for (const k of here) if (!then.has(k)) heat++;
    for (const k of then) if (!here.has(k)) heat++;
    minPop = Math.min(minPop, cur.length);
    maxPop = Math.max(maxPop, cur.length);
    cur = next;
  }
  const stator = always!.size;
  const moving = p.dx !== 0 || p.dy !== 0;
  const speed = moving ? describePeriodicity(p).replace(/^spaceship \((.*)\)$/, '$1') : undefined;
  return {
    period: p.period,
    speed,
    minPop,
    maxPop,
    heat: heat / p.period,
    // Rotor and stator only make sense for a pattern that stays put.
    rotor: moving ? undefined : ever.size - stator,
    stator: moving ? undefined : stator,
  };
}

/** Runs a gun until the gun itself repeats, and counts the gliders it fires per period. */
export function measureGun(cells: Cell[]): GunFacts | undefined {
  const r = new FateRunner(256, true).run(cells, 2000);
  if (r.fate !== 'oscillates' && r.fate !== 'still') return undefined;
  // Every glider is five cells, so the population gained over a period, once the stream is in flight, is 5 per glider.
  const warm = r.lifespan + r.period * 2;
  const a = evolveSparse(cells, warm).length;
  const b = evolveSparse(cells, warm + r.period).length;
  return { period: r.period, perPeriod: Math.round((b - a) / 5) };
}

export function measureGrowth(cells: Cell[], gens = 2000, step = 100): GrowthFacts {
  const trace = [cells.length];
  let cur = cells;
  for (let g = step; g <= gens; g += step) {
    cur = evolveSparse(cur, step);
    trace.push(cur.length);
  }
  return { trace, step, final: cur.length };
}

/**
 * Runs a methuselah to the end. `size` is the side of the field: the
 * bigger methuselahs spread several hundred cells, so the default leaves room.
 */
export function measureRun(cells: Cell[], opts: { maxGen?: number; size?: number; onProgress?: (gen: number) => void } = {}): RunFacts {
  const { maxGen = 30000, size = 1024, onProgress } = opts;
  const pops: number[] = [];
  const r = new FateRunner(size, true).run(cells, maxGen, onProgress, pops);
  const step = Math.max(1, Math.ceil(pops.length / 120));
  const trace: number[] = [];
  for (let i = 0; i < pops.length; i += step) trace.push(pops[i]);
  return {
    lifespan: r.lifespan,
    ending: r.fate,
    endPeriod: r.period,
    peakPop: r.maxPopulation,
    finalPop: r.finalPopulation,
    escapes: r.escapes ?? 0,
    trace,
    step,
  };
}
