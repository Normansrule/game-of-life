/**
 * Evolving cellular automata with a genetic algorithm: the density
 * classification task (Packard 1988; Mitchell, Crutchfield & Das 1994–96).
 *
 * A one-dimensional binary CA of radius 3 on a ring of N cells must decide
 * whether its initial configuration has more 1s than 0s: it should settle
 * to all 1s if so and to all 0s otherwise, using only local rules. A rule
 * is a table of 2^7 = 128 bits. The GA breeds rule tables, scoring each on
 * random initial conditions, and records every individual's parents so the
 * champion's family tree can be drawn.
 */
import { mulberry32 } from './census';

export const RADIUS = 3;
export const TABLE = 1 << (2 * RADIUS + 1); // 128

export type RuleTable = Uint8Array;

/**
 * Neighbourhood index: s[i-3] is the most significant bit, s[i+3] the least.
 */
export function stepRing(src: Uint8Array, dst: Uint8Array, rule: RuleTable): void {
  const n = src.length;
  let idx = 0;
  for (let k = -RADIUS; k <= RADIUS; k++) idx = (idx << 1) | src[(k + n) % n];
  for (let i = 0; i < n; i++) {
    dst[i] = rule[idx];
    idx = ((idx << 1) & (TABLE - 1)) | src[(i + RADIUS + 1) % n];
  }
}

/** Run to a fixed point (or maxSteps). Returns 1 for all ones, 0 for all zeros, −1 otherwise. */
export function runToConsensus(rule: RuleTable, ic: Uint8Array, maxSteps: number, scratch?: [Uint8Array, Uint8Array]): number {
  let a = scratch ? scratch[0] : new Uint8Array(ic.length);
  let b = scratch ? scratch[1] : new Uint8Array(ic.length);
  a.set(ic);
  for (let t = 0; t < maxSteps; t++) {
    stepRing(a, b, rule);
    let same = true;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { same = false; break; }
    [a, b] = [b, a];
    if (same) break;
  }
  let ones = 0;
  for (let i = 0; i < a.length; i++) ones += a[i];
  return ones === a.length ? 1 : ones === 0 ? 0 : -1;
}

export function majorityOf(ic: Uint8Array): number {
  let ones = 0;
  for (let i = 0; i < ic.length; i++) ones += ic[i];
  return ones * 2 > ic.length ? 1 : 0;
}

/** Fraction of initial conditions classified correctly. */
export function fitness(rule: RuleTable, ics: Uint8Array[], maxSteps: number): number {
  if (!ics.length) return 0;
  const n = ics[0].length;
  const scratch: [Uint8Array, Uint8Array] = [new Uint8Array(n), new Uint8Array(n)];
  let ok = 0;
  for (const ic of ics) if (runToConsensus(rule, ic, maxSteps, scratch) === majorityOf(ic)) ok++;
  return ok / ics.length;
}

/** Odd N avoids ties. `density` < 0 means unbiased: every cell is 1 with probability ½. */
export function randomIC(n: number, rng: () => number, density = -1): Uint8Array {
  const ic = new Uint8Array(n);
  const p = density < 0 ? 0.5 : density;
  for (let i = 0; i < n; i++) ic[i] = rng() < p ? 1 : 0;
  return ic;
}

/** Training set as in Mitchell et al.: density drawn uniformly from [0, 1] for each IC. */
export function trainingICs(count: number, n: number, rng: () => number): Uint8Array[] {
  return Array.from({ length: count }, () => randomIC(n, rng, rng()));
}

function ruleFrom(f: (s: number[]) => number): RuleTable {
  const t = new Uint8Array(TABLE);
  for (let idx = 0; idx < TABLE; idx++) {
    const s: number[] = [];
    for (let k = 0; k < 2 * RADIUS + 1; k++) s.push((idx >> (2 * RADIUS - k)) & 1);
    t[idx] = f(s); // s[0] = s_{i-3}, s[3] = s_i, s[6] = s_{i+3}
  }
  return t;
}

/** Gács–Kurdyumov–Levin (1978): a hand-designed rule that does well on this task. */
export function gklRule(): RuleTable {
  const maj = (a: number, b: number, c: number) => (a + b + c >= 2 ? 1 : 0);
  return ruleFrom((s) => (s[3] === 0 ? maj(s[0], s[2], s[3]) : maj(s[3], s[4], s[6])));
}

/** The obvious local rule: take the majority of the 7 cells you can see. */
export function localMajorityRule(): RuleTable {
  return ruleFrom((s) => (s.reduce((a, b) => a + b, 0) >= 4 ? 1 : 0));
}

export function ruleHex(r: RuleTable): string {
  let out = '';
  for (let i = 0; i < TABLE; i += 4) out += ((r[i] << 3) | (r[i + 1] << 2) | (r[i + 2] << 1) | r[i + 3]).toString(16);
  return out;
}

export function ruleLambda(r: RuleTable): number {
  let s = 0;
  for (let i = 0; i < TABLE; i++) s += r[i];
  return s / TABLE;
}

export interface Individual {
  id: number;
  rule: RuleTable;
  fitness: number;
  /** Ids of the parents (empty for generation 0, one for an elite copy); the major contributor first. */
  parents: number[];
  generation: number;
  elite: boolean;
}

export interface GAOptions {
  popSize: number;
  eliteFrac: number;
  icCount: number;
  n: number;
  maxSteps: number;
  mutations: number;
  seed: number;
}

export const DEFAULT_GA: GAOptions = { popSize: 60, eliteFrac: 0.2, icCount: 60, n: 149, maxSteps: 160, mutations: 2, seed: 1 };

export class DensityGA {
  readonly o: GAOptions;
  pop: Individual[] = [];
  generation = 0;
  private nextId = 0;
  private rng: () => number;
  constructor(opts: Partial<GAOptions> = {}) {
    this.o = { ...DEFAULT_GA, ...opts };
    this.rng = mulberry32(this.o.seed);
    for (let k = 0; k < this.o.popSize; k++) {
      // Mitchell's initialisation: λ uniform on [0, 1], so all densities of rule tables are tried.
      const lam = this.rng();
      const rule = new Uint8Array(TABLE);
      for (let i = 0; i < TABLE; i++) rule[i] = this.rng() < lam ? 1 : 0;
      this.pop.push({ id: this.nextId++, rule, fitness: 0, parents: [], generation: 0, elite: false });
    }
  }

  /** Score the current population on a fresh training set and sort best first. */
  evaluate(): void {
    const ics = trainingICs(this.o.icCount, this.o.n, this.rng);
    for (const ind of this.pop) ind.fitness = fitness(ind.rule, ics, this.o.maxSteps);
    this.pop.sort((a, b) => b.fitness - a.fitness);
  }

  /** Build the next generation from the evaluated, sorted population. */
  breed(): void {
    const { popSize, eliteFrac, mutations } = this.o;
    const E = Math.max(2, Math.round(popSize * eliteFrac));
    const elites = this.pop.slice(0, E);
    const next: Individual[] = elites.map((e) => ({ id: this.nextId++, rule: e.rule.slice(), fitness: e.fitness, parents: [e.id], generation: this.generation + 1, elite: true }));
    while (next.length < popSize) {
      const a = elites[Math.floor(this.rng() * E)], b = elites[Math.floor(this.rng() * E)];
      const cut = 1 + Math.floor(this.rng() * (TABLE - 1));
      const child = new Uint8Array(TABLE);
      child.set(a.rule.subarray(0, cut), 0);
      child.set(b.rule.subarray(cut), cut);
      for (let m = 0; m < mutations; m++) {
        const i = Math.floor(this.rng() * TABLE);
        child[i] ^= 1;
      }
      // The parent that contributed most of the table is listed first (the 'main' line of descent).
      const parents = cut >= TABLE / 2 ? [a.id, b.id] : [b.id, a.id];
      next.push({ id: this.nextId++, rule: child, fitness: 0, parents, generation: this.generation + 1, elite: false });
    }
    this.pop = next;
    this.generation++;
  }
}

/** Performance on unbiased ICs (each cell 1 with probability ½): the harder, standard benchmark. */
export function performance(rule: RuleTable, count: number, n: number, seed: number): number {
  const rng = mulberry32(seed);
  const ics = Array.from({ length: count }, () => randomIC(n, rng));
  return fitness(rule, ics, 2 * n);
}

/** A ring of n cells with exactly k ones at random positions. */
export function icWithOnes(n: number, k: number, rng: () => number): Uint8Array {
  const ic = new Uint8Array(n);
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (n - i));
    [idx[i], idx[j]] = [idx[j], idx[i]];
    ic[idx[i]] = 1;
  }
  return ic;
}
