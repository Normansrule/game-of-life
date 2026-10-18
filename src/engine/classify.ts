/**
 * Automatic classification of Life-like rules, in the spirit of Wolfram's
 * four classes of cellular automata:
 *   I   evolves to a uniform state (everything dies)
 *   II  settles into still lifes or short-period oscillators
 *   III stays chaotic: high, steady activity with no structure
 *   IV  complex: long-lived, low-activity, localised structures (Life)
 * The classifier runs a seeded soup on a small torus and measures
 * population, activity (fraction of cells that change per step) and
 * recurrence of whole-board states.
 */
import { type Rule, parseRule, ruleTable, ruleToString } from './rules';
import { mulberry32 } from './census';

export type RuleClass = 'I' | 'II' | 'III' | 'IV';

export const CLASS_INFO: Record<RuleClass, { name: string; colour: string; blurb: string }> = {
  I: { name: 'Dies out', colour: '#5b6a8f', blurb: 'Evolves to a uniform dead state' },
  II: { name: 'Settles', colour: '#38e8a8', blurb: 'Freezes or falls into short cycles' },
  III: { name: 'Chaotic', colour: '#ff4fa3', blurb: 'Busy, structureless churn that never settles' },
  IV: { name: 'Complex', colour: '#ffb020', blurb: 'Long-lived localised structures, the edge of chaos' },
};

/**
 * Langton's λ for an outer-totalistic Moore rule: the fraction of the 512
 * neighbourhood configurations whose next state is alive.
 */
export function langtonLambda(r: Rule): number {
  const C = [1, 8, 28, 56, 70, 56, 28, 8, 1];
  let s = 0;
  for (let n = 0; n <= 8; n++) s += C[n] * ((r.birth[n] ? 1 : 0) + (r.survive[n] ? 1 : 0));
  return s / 512;
}

export interface Verdict {
  cls: RuleClass;
  /** Mean fraction of cells changing per step over the last window. */
  activity: number;
  density: number;
  /** Detected period of the whole board (0 = none found). */
  period: number;
  lambda: number;
}

/** A soup on a torus that can be stepped incrementally and classified at any time. */
export class RuleRun {
  readonly rule: Rule;
  cells: Uint8Array;
  private next: Uint8Array;
  private table: Uint8Array;
  generation = 0;
  population = 0;
  readonly pops: number[] = [];
  private changes: number[] = [];
  private seen = new Map<number, number>();
  period = 0;
  constructor(rule: Rule | string, readonly size = 66, density = 0.5, seed = 1) {
    this.rule = typeof rule === 'string' ? parseRule(rule) : rule;
    this.table = ruleTable(this.rule);
    const n = size * size;
    this.cells = new Uint8Array(n);
    this.next = new Uint8Array(n);
    const rng = mulberry32(seed);
    // A centred soup filling half the board, so growth has room to show.
    const q = size >> 2;
    for (let y = q; y < size - q; y++) for (let x = q; x < size - q; x++) this.cells[y * size + x] = rng() < density ? 1 : 0;
    this.population = this.cells.reduce((a, b) => a + b, 0);
    this.pops.push(this.population);
  }

  step() {
    const { size: N, cells, next, table } = this;
    let pop = 0, changed = 0;
    for (let y = 0; y < N; y++) {
      const up = ((y + N - 1) % N) * N, row = y * N, dn = ((y + 1) % N) * N;
      for (let x = 0; x < N; x++) {
        const l = (x + N - 1) % N, r = (x + 1) % N;
        const n = cells[up + l] + cells[up + x] + cells[up + r] + cells[row + l] + cells[row + r] + cells[dn + l] + cells[dn + x] + cells[dn + r];
        const c = cells[row + x];
        const v = table[(c << 4) | n];
        next[row + x] = v;
        pop += v;
        changed += v ^ c;
      }
    }
    this.next = cells;
    this.cells = next;
    this.generation++;
    this.population = pop;
    this.pops.push(pop);
    this.changes.push(changed / (N * N));
    if (this.changes.length > 60) this.changes.shift();
    if (!this.period) {
      let h = 2166136261;
      for (let i = 0; i < next.length; i += 4) h = Math.imul(h ^ (next[i] | (next[i + 1] << 1) | (next[i + 2] << 2) | (next[i + 3] << 3)), 16777619);
      h = Math.imul(h ^ pop, 16777619) >>> 0;
      const prev = this.seen.get(h);
      if (prev !== undefined) this.period = this.generation - prev;
      else this.seen.set(h, this.generation);
    }
  }

  verdict(): Verdict {
    const N2 = this.size * this.size;
    const activity = this.changes.length ? this.changes.reduce((a, b) => a + b, 0) / this.changes.length : 0;
    const density = this.population / N2;
    const lambda = langtonLambda(this.rule);
    let cls: RuleClass;
    if (this.population === 0 || density > 0.999) return { cls: 'I', activity: 0, density, period: this.period, lambda };
    else if (this.period && this.period <= 30) cls = 'II';
    else if (activity > 0.06) cls = 'III';
    else if (activity < 0.0005) cls = 'II';
    else cls = 'IV';
    return { cls, activity, density, period: this.period, lambda };
  }
}

export function classifyRule(rule: Rule | string, opts: { size?: number; gens?: number; seed?: number; density?: number } = {}): Verdict {
  const run = new RuleRun(rule, opts.size ?? 66, opts.density ?? 0.5, opts.seed ?? 1);
  const gens = opts.gens ?? 400;
  for (let g = 0; g < gens; g++) {
    run.step();
    if (run.population === 0 || (run.period && run.generation > 80)) break;
  }
  return run.verdict();
}

/** The 17 rules that differ from `rule` in exactly one birth or survival bit (B0 excluded). */
export function ruleNeighbours(rule: Rule | string): string[] {
  const r = typeof rule === 'string' ? parseRule(rule) : rule;
  const out: string[] = [];
  for (const which of ['birth', 'survive'] as const)
    for (let n = 0; n <= 8; n++) {
      if (which === 'birth' && n === 0) continue;
      const m: Rule = { birth: [...r.birth], survive: [...r.survive], name: '' };
      m[which][n] = !m[which][n];
      out.push(ruleToString(m));
    }
  return out;
}

/** A random rule without B0, with each other bit set with probability p. */
export function randomRule(rng: () => number, p = rng() * 0.6): string {
  const birth = Array<boolean>(9).fill(false), survive = Array<boolean>(9).fill(false);
  for (let n = 1; n <= 8; n++) birth[n] = rng() < p;
  for (let n = 0; n <= 8; n++) survive[n] = rng() < p;
  return ruleToString({ birth, survive, name: '' });
}
