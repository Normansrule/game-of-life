import type { Cell } from './life';
import { LineageRun } from './lineage';

/** Small, fast, seedable PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSoup(size: number, density: number, rng: () => number): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (rng() < density) cells.push([x, y]);
  return cells;
}

export interface SoupResult {
  /** Objects left at the end (and spaceships that flew away, marked "(flew off)", as in the lineage tree). */
  objects: Map<string, number>;
  settledAt: number;
  finalPopulation: number;
  initialPopulation: number;
}

/**
 * Run one random soup to stability and identify everything that is left,
 * in the spirit of Adam Goucher's apgsearch / Catagolue census.
 */
export function runSoup(cells: Cell[], maxGen = 6000): SoupResult {
  const run = new LineageRun(cells, { maxGen, size: 320 });
  while (!run.done) run.advance(1000);
  const r = run.result();
  const objects = new Map<string, number>();
  for (const s of r.segments) {
    if (s.fate !== 'running' && s.fate !== 'escaped') continue;
    const name = (s.label ?? 'unclassified') + (s.fate === 'escaped' ? ' (flew off)' : '');
    objects.set(name, (objects.get(name) ?? 0) + 1);
  }
  return { objects, settledAt: r.settledAt, finalPopulation: r.populations.at(-1) ?? 0, initialPopulation: cells.length };
}

export function mergeCensus(into: Map<string, number>, add: Map<string, number>): void {
  for (const [k, v] of add) into.set(k, (into.get(k) ?? 0) + v);
}

/** Shannon diversity of a census, in bits. */
export function diversity(census: Map<string, number>): number {
  const total = [...census.values()].reduce((a, b) => a + b, 0);
  let h = 0;
  for (const v of census.values()) if (v) h -= (v / total) * Math.log2(v / total);
  return h;
}
