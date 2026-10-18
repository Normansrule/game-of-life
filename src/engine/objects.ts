import { type Cell, evolveSparse, normalize } from './life';
import { PATTERNS, patternCells, transform } from './patterns';

/**
 * Object recognition: give every finite pattern a canonical key that is
 * invariant under translation, rotation and reflection, then look keys up
 * in a table of named objects (built by running each named pattern through
 * all of its phases).
 */
export function canonicalKey(cells: Cell[]): string {
  let best = '';
  for (let rot = 0; rot < 4; rot++)
    for (const flip of [false, true]) {
      const n = normalize(transform(cells, rot, flip));
      n.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      const k = n.map(([x, y]) => `${x},${y}`).join(';');
      if (!best || k < best) best = k;
    }
  return best;
}

/** Key that is only translation invariant (keeps orientation). */
export function translationKey(cells: Cell[]): string {
  const n = normalize(cells);
  n.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return n.map(([x, y]) => `${x},${y}`).join(';');
}

export interface KnownObject {
  name: string;
  kind: 'still life' | 'oscillator' | 'spaceship';
  period: number;
}

let table: Map<string, KnownObject> | null = null;

export function knownObjects(): Map<string, KnownObject> {
  if (table) return table;
  table = new Map();
  for (const p of PATTERNS) {
    if (!['Still life', 'Oscillator', 'Spaceship'].includes(p.category)) continue;
    const period = p.period ?? 1;
    const kind = p.category === 'Still life' ? 'still life' : p.category === 'Oscillator' ? 'oscillator' : 'spaceship';
    let cells = patternCells(p);
    for (let i = 0; i < period; i++) {
      table.set(canonicalKey(cells), { name: p.name, kind, period });
      cells = evolveSparse(cells, 1);
    }
  }
  // A few common objects that aren't in the pattern library.
  const extra: [string, Cell[], KnownObject['kind'], number][] = [
    ['Barge', [[1, 0], [0, 1], [2, 1], [1, 2], [3, 2], [2, 3]], 'still life', 1],
    ['Long boat', [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2], [3, 2], [2, 3]], 'still life', 1],
    ['Snake', [[0, 0], [1, 0], [3, 0], [0, 1], [2, 1], [3, 1]], 'still life', 1],
    ['Aircraft carrier', [[0, 0], [1, 0], [0, 1], [3, 1], [2, 2], [3, 2]], 'still life', 1],
  ];
  for (const [name, cells, kind, period] of extra) table.set(canonicalKey(cells), { name, kind, period });
  return table;
}

export function identify(cells: Cell[]): KnownObject | undefined {
  if (!cells.length || cells.length > 60) return undefined;
  return knownObjects().get(canonicalKey(cells));
}

/**
 * Group live cells into "objects": two cells belong together if they are
 * within Chebyshev distance `radius`. Radius 2 is the natural choice for
 * Life because cells further apart cannot influence each other next step.
 */
export function components(cells: Cell[], radius = 2): Cell[][] {
  const index = new Map<string, number>();
  cells.forEach(([x, y], i) => index.set(`${x},${y}`, i));
  const parent = cells.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  cells.forEach(([x, y], i) => {
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const j = index.get(`${x + dx},${y + dy}`);
        if (j !== undefined) {
          const a = find(i);
          const b = find(j);
          if (a !== b) parent[a] = b;
        }
      }
  });
  const groups = new Map<number, Cell[]>();
  cells.forEach((c, i) => {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(c);
  });
  return [...groups.values()];
}

export interface Periodicity {
  period: number;
  dx: number;
  dy: number;
}

/** Detect whether a small isolated pattern is periodic (up to translation). */
export function findPeriod(cells: Cell[], maxPeriod = 60): Periodicity | null {
  if (!cells.length) return null;
  const start = translationKey(cells);
  const minX0 = Math.min(...cells.map((c) => c[0]));
  const minY0 = Math.min(...cells.map((c) => c[1]));
  let cur = cells;
  for (let p = 1; p <= maxPeriod; p++) {
    cur = evolveSparse(cur, 1);
    if (!cur.length) return null;
    if (cur.length === cells.length && translationKey(cur) === start) {
      const dx = Math.min(...cur.map((c) => c[0])) - minX0;
      const dy = Math.min(...cur.map((c) => c[1])) - minY0;
      return { period: p, dx, dy };
    }
  }
  return null;
}

export function describePeriodicity(p: Periodicity): string {
  if (!p.dx && !p.dy) return p.period === 1 ? 'still life' : `oscillator (period ${p.period})`;
  const d = Math.max(Math.abs(p.dx), Math.abs(p.dy));
  const g = gcd(d, p.period);
  const speed = `${d / g === 1 ? '' : d / g}c/${p.period / g}`;
  const dir = p.dx && p.dy ? 'diagonal' : 'orthogonal';
  return `spaceship (${speed} ${dir})`;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
