/**
 * The game: a journey through the ideas behind Life, one chapter per idea.
 *
 * Each chapter states an idea (with its formula), sets a few levels in which
 * the only way to win is to use that idea, and then shows where the same idea
 * turns up outside the game. Everything a level decides is decided here, by
 * running the engine, so the rules of the game are testable without a page.
 */
import { components, identify, findPeriod, translationKey } from './objects';
import { type Cell, evolveSparse } from './life';
import { mulberry32 } from './census';
import { classifyRule, langtonLambda, type RuleClass } from './classify';
import { parseRule } from './rules';
import { patternCells } from './patterns';

export const key = (x: number, y: number) => `${x},${y}`;
const sameSet = (a: Cell[], b: Cell[]) => {
  if (a.length !== b.length) return false;
  const s = new Set(a.map(([x, y]) => key(x, y)));
  return b.every(([x, y]) => s.has(key(x, y)));
};
const shift = (c: Cell[], dx: number, dy: number) => c.map(([x, y]) => [x + dx, y + dy] as Cell);
const plural = (n: number, w: string) => `${n.toLocaleString('en-GB')} ${w}${n === 1 ? '' : 's'}`;

export interface Rect { x0: number; y0: number; x1: number; y1: number }
const inRect = ([x, y]: Cell, r: Rect) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;

export interface Result {
  ok: boolean;
  message: string;
}

// ---------- rotations, for stamps ----------

/** Turn a shape a quarter turn clockwise `turns` times, and put its corner at (0, 0). */
export function rotate(cells: Cell[], turns: number): Cell[] {
  let c = cells;
  for (let t = 0; t < ((turns % 4) + 4) % 4; t++) c = c.map(([x, y]) => [-y, x] as Cell);
  const x0 = Math.min(...c.map((p) => p[0])), y0 = Math.min(...c.map((p) => p[1]));
  return c.map(([x, y]) => [x - x0, y - y0] as Cell);
}

// ---------- chapter 1: the rule ----------

/** Live neighbours of every cell that has any, keyed "x,y". */
export function neighbourCounts(cells: Cell[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [x, y] of cells)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (dx || dy) m.set(key(x + dx, y + dy), (m.get(key(x + dx, y + dy)) ?? 0) + 1);
  return m;
}

export interface Prediction { ok: boolean; missing: Cell[]; extra: Cell[] }

/** Compare a guess at the next generation with the real one. */
export function checkPrediction(start: Cell[], guess: Cell[]): Prediction {
  const next = evolveSparse(start, 1);
  const g = new Set(guess.map(([x, y]) => key(x, y)));
  const n = new Set(next.map(([x, y]) => key(x, y)));
  const missing = next.filter(([x, y]) => !g.has(key(x, y)));
  const extra = guess.filter(([x, y]) => !n.has(key(x, y)));
  return { ok: !missing.length && !extra.length, missing, extra };
}

// ---------- chapter 2: fixed points ----------

/** Is the whole board a still life, F(x) = x? */
export const isStill = (cells: Cell[]) => cells.length > 0 && sameSet(evolveSparse(cells, 1), cells);

// ---------- chapter 4: the speed of light ----------

export interface Race { start: Rect; flag: Rect; deadline: number; maxStones: number }

/** The first generation at which a live cell stands on the flag, or -1. */
export function raceTime(cells: Cell[], race: Race): number {
  let c = cells;
  for (let g = 0; g <= race.deadline; g++) {
    if (c.some((p) => inRect(p, race.flag))) return g;
    c = evolveSparse(c, 1);
    if (!c.length) return -1;
  }
  return -1;
}

/** How close the pattern got to the flag (in cells, by the end of the deadline), for feedback. */
export function raceReach(cells: Cell[], race: Race): number {
  let c = cells, best = Infinity;
  for (let g = 0; g <= race.deadline && c.length; g++) {
    for (const [x, y] of c) {
      const dx = Math.max(race.flag.x0 - x, 0, x - race.flag.x1), dy = Math.max(race.flag.y0 - y, 0, y - race.flag.y1);
      best = Math.min(best, Math.max(dx, dy));
    }
    c = evolveSparse(c, 1);
  }
  return best;
}

export function judgeRace(cells: Cell[], race: Race): Result {
  if (!cells.length) return { ok: false, message: 'Place a pattern in the start area first.' };
  if (cells.length > race.maxStones) return { ok: false, message: `Use at most ${plural(race.maxStones, 'stone')}.` };
  if (cells.some((p) => !inRect(p, race.start))) return { ok: false, message: 'Every stone must start inside the start area.' };
  const t = raceTime(cells, race);
  if (t >= 0) return { ok: true, message: `It reached the flag in ${plural(t, 'generation')}.` };
  const gap = raceReach(cells, race);
  return { ok: false, message: gap === Infinity ? 'Nothing survived long enough to get anywhere.' : `By generation ${race.deadline} it was still ${plural(gap, 'cell')} from the flag.` };
}

// ---------- chapter 5: collisions ----------

export const LANES = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export const DELAYS = [0, 1, 2, 3];
const glider = () => patternCells('glider');

/** The two gliders of the collision lab: one fixed, flying down-right; one flying up-left, moved by `lane` and held back by `delay`. */
export function collisionStart(lane: number, delay: number): { a: Cell[]; b: Cell[] } {
  const g = glider();
  const a = shift(g, 2, 2);
  const flipped = g.map(([x, y]) => [-x, -y] as Cell);
  const b = evolveSparse(shift(flipped, 16 + lane, 16 - lane), delay);
  return { a, b };
}

/** What a pattern settles into, as a count of named objects ("?" for anything unnamed). */
export function censusOf(cells: Cell[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const comp of components(cells)) {
    const k = identify(comp)?.name ?? '?';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

export function censusText(m: Map<string, number>): string {
  if (!m.size) return 'nothing at all';
  const parts = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => {
    const w = name === '?' ? 'unnamed object' : name.toLowerCase();
    return n === 1 ? `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}` : `${n} ${w}${/s$/.test(w) ? 'es' : 's'}`;
  });
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Run a collision long enough to finish (every outcome in the lab settles well within 300 generations). */
export function collide(lane: number, delay: number): Map<string, number> {
  const { a, b } = collisionStart(lane, delay);
  return censusOf(evolveSparse([...a, ...b], 300));
}

/** Every outcome in the lab, so a level can say how many of the 36 collisions do what it asks. */
export function collisionTable(): { lane: number; delay: number; result: Map<string, number> }[] {
  return LANES.flatMap((lane) => DELAYS.map((delay) => ({ lane, delay, result: collide(lane, delay) })));
}

export const sameCensus = (a: Map<string, number>, b: Map<string, number>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// ---------- chapter 6: running backwards ----------

export function judgeParent(cells: Cell[], target: Cell[], maxStones: number): Result {
  if (!cells.length) return { ok: false, message: 'Draw a pattern first.' };
  if (cells.length > maxStones) return { ok: false, message: `Use at most ${plural(maxStones, 'stone')}.` };
  const next = evolveSparse(cells, 1);
  if (sameSet(next, target)) return { ok: true, message: 'One generation later it is exactly the target.' };
  if (next.length && translationKey(next) === translationKey(target)) return { ok: false, message: 'Right shape, wrong place: it lands shifted from the rings.' };
  return { ok: false, message: next.length ? `One generation later it is ${plural(next.length, 'stone')}, not the target.` : 'One generation later nothing is left.' };
}

// ---------- chapter 7: mean field ----------

const C8 = [1, 8, 28, 56, 70, 56, 28, 8, 1];
const binom = (k: number, p: number) => C8[k] * p ** k * (1 - p) ** (8 - k);

/**
 * Mean-field theory: pretend every cell is alive with probability p,
 * independently of its neighbours. Then the next density is
 *   p' = (1 − p)·B(3) + p·(B(2) + B(3)),  B(k) = C(8,k) p^k (1 − p)^(8 − k).
 */
export const meanField = (p: number) => (1 - p) * binom(3, p) + p * (binom(2, p) + binom(3, p));

/** The density mean-field theory says a soup settles at: its stable, non-zero fixed point. */
export function meanFieldFixedPoint(): number {
  let p = 0.5;
  for (let i = 0; i < 500; i++) p = meanField(p);
  return p;
}

/** A random soup filling an N × N torus, run for `gens` generations. Returns the boards it passed through every `every` steps, and the final density. */
export function torusSoup(N: number, p: number, seed: number, gens: number, every = 0): { frames: Uint8Array[]; density: number } {
  let a = new Uint8Array(N * N), b = new Uint8Array(N * N);
  const rng = mulberry32(seed);
  for (let i = 0; i < a.length; i++) a[i] = rng() < p ? 1 : 0;
  const frames: Uint8Array[] = every ? [a.slice()] : [];
  for (let g = 1; g <= gens; g++) {
    for (let y = 0; y < N; y++) {
      const up = ((y + N - 1) % N) * N, row = y * N, dn = ((y + 1) % N) * N;
      for (let x = 0; x < N; x++) {
        const l = (x + N - 1) % N, r = (x + 1) % N;
        const n = a[up + l] + a[up + x] + a[up + r] + a[row + l] + a[row + r] + a[dn + l] + a[dn + x] + a[dn + r];
        b[row + x] = n === 3 || (a[row + x] && n === 2) ? 1 : 0;
      }
    }
    [a, b] = [b, a];
    if (every && g % every === 0) frames.push(a.slice());
  }
  return { frames, density: a.reduce((s, v) => s + v, 0) / (N * N) };
}

export const SOUP = { N: 32, gens: 400, seeds: [11, 23, 37] };

/** The measured final density for a starting density, averaged over the level's fixed soups. */
export function measuredAsh(p: number): number {
  return SOUP.seeds.reduce((s, seed) => s + torusSoup(SOUP.N, p, seed, SOUP.gens).density, 0) / SOUP.seeds.length;
}

// ---------- chapter 8: rule space ----------

export interface RuleVerdict { cls: RuleClass; lambda: number; rule: string }

export function ruleString(birth: boolean[], survive: boolean[]): string {
  const ns = (b: boolean[]) => b.map((v, i) => (v ? i : '')).join('');
  return `B${ns(birth)}/S${ns(survive)}`;
}

export function judgeRule(rule: string): RuleVerdict {
  const r = parseRule(rule);
  return { cls: classifyRule(r, { size: 66, seed: 7 }).cls, lambda: langtonLambda(r), rule };
}

// ---------- the chapters ----------

export type Level =
  | { kind: 'predict'; title: string; w: number; h: number; start: Cell[] }
  | { kind: 'repair'; title: string; w: number; h: number; given: Cell[] }
  | { kind: 'period'; title: string; w: number; h: number; pattern: Cell[]; options: number[] }
  | { kind: 'race'; title: string; w: number; h: number; race: Race; stamps: string[] }
  | { kind: 'collide'; title: string; target: Map<string, number>; goal: string }
  | { kind: 'parent'; title: string; w: number; h: number; target: Cell[]; maxStones: number }
  | { kind: 'ash'; title: string; start: number }
  | { kind: 'rule'; title: string; want: RuleClass; not?: string[] };

export interface Chapter {
  id: string;
  /** The idea, in one heading. */
  title: string;
  /** What the player does, in a few words. */
  play: string;
  idea: string;
  /** The formula, in TeX. */
  formula: string;
  formulaNote: string;
  levels: Level[];
  /** How to win each level, said plainly; shown when asked for. */
  hints: string[];
  application: { title: string; text: string; route: string; label: string };
}

const at = (c: Cell[], x: number, y: number) => shift(c, x, y);
const without = (c: Cell[], i: number) => c.filter((_, j) => j !== i);
const sortCells = (c: Cell[]) => [...c].sort((a, b) => a[1] - b[1] || a[0] - b[0]);

export const CHAPTERS: Chapter[] = [
  {
    id: 'rule',
    title: 'One rule, applied everywhere',
    play: 'Predict the next generation',
    idea: 'Every cell looks at its eight neighbours and nothing else. A dead cell with exactly three live neighbours is born; a live cell with two or three survives; every other cell is dead next turn. The whole board changes at once.',
    formula: 'x_{t+1} = \\begin{cases} 1 & N = 3 \\\\ x_t & N = 2 \\\\ 0 & \\text{otherwise} \\end{cases} \\qquad N = \\sum_{\\text{8 neighbours}} x_t',
    formulaNote: 'A cell and its neighbours are 9 bits, so the rule is a table of 2⁹ = 512 answers.',
    levels: [
      { kind: 'predict', title: 'Three in a row', w: 7, h: 7, start: [[2, 3], [3, 3], [4, 3]] },
      { kind: 'predict', title: 'The glider', w: 8, h: 8, start: at(patternCells('glider'), 3, 2) },
      { kind: 'predict', title: 'The R-pentomino', w: 9, h: 9, start: at(patternCells('rpentomino'), 3, 3) },
    ],
    hints: [
      'Count for each cell: how many of the eight cells around it are stones? Exactly 3 means a stone next turn. A stone with 2 keeps its place.',
      'Turn on "Show counts" to see every number. Cells far from any stone stay empty.',
      'Work along each row. Remember the cells just outside the pattern: some of them have 3 neighbours.',
    ],
    application: {
      title: 'Local rules, global behaviour',
      text: 'Nothing on the board knows about gliders or blocks; they come out of one local rule. The same idea drives traffic and crowd models, the spread of fires and epidemics, and image filters on a graphics card, where every pixel runs the same small program at the same time.',
      route: 'apps', label: 'See the applications',
    },
  },
  {
    id: 'fixed',
    title: 'Fixed points',
    play: 'Repair a still life with one stone',
    idea: 'Think of the rule as a function F that takes a whole board to the next one. A still life is a board that F leaves alone: a fixed point. Every live cell needs two or three neighbours, and no dead cell may have exactly three.',
    formula: 'F(x) = x',
    formulaNote: 'Still lifes are the fixed points of F. Most boards are not, and most patterns end as a scatter of them.',
    levels: [
      { kind: 'repair', title: 'A broken beehive', w: 8, h: 7, given: without(sortCells(at(patternCells('beehive'), 2, 2)), 4) },
      { kind: 'repair', title: 'A broken loaf', w: 8, h: 8, given: without(sortCells(at(patternCells('loaf'), 2, 2)), 2) },
      { kind: 'repair', title: 'A broken pond', w: 8, h: 8, given: without(sortCells(at(patternCells('pond'), 2, 2)), 7) },
    ],
    hints: [
      'Press "Watch it run" to see the broken pattern fall apart, then look for the gap in its outline.',
      'A still life has no loose ends: every stone touches two or three others.',
      'Try each empty cell on the edge of the shape and check: does every stone now have 2 or 3 neighbours?',
    ],
    application: {
      title: 'Memory',
      text: 'A fixed point stays put, so it can store something. A magnet\'s domains, a flip-flop in a chip and a switched-on gene are all stable states of a system that would otherwise change. In Life computers, still lifes called eaters sit in place and swallow gliders, like a wire\'s end.',
      route: 'puzzles', label: 'Build more in Puzzles',
    },
  },
  {
    id: 'cycles',
    title: 'Cycles',
    play: 'Count the period',
    idea: 'Some patterns come back to where they started after p generations: they are periodic orbits of F. The period is the smallest such p. Two different cycles running side by side repeat together only after the least common multiple of their periods.',
    formula: 'F^{\\,p}(x) = x, \\qquad p = \\min\\{\\,k \\ge 1 : F^{k}(x) = x\\,\\}',
    formulaNote: 'A still life is the case p = 1.',
    levels: [
      { kind: 'period', title: 'The toad', w: 8, h: 8, pattern: at(patternCells('toad'), 2, 3), options: [1, 2, 3, 4, 6] },
      { kind: 'period', title: 'The pulsar', w: 17, h: 17, pattern: at(patternCells('pulsar'), 2, 2), options: [2, 3, 4, 5, 8] },
      { kind: 'period', title: 'The pentadecathlon', w: 13, h: 18, pattern: at(patternCells('pentadecathlon'), 2, 4), options: [3, 5, 8, 12, 15] },
    ],
    hints: [
      'Use "Step" and count the steps until the board looks exactly as it did at the start.',
      'The generation counter helps: note the number when the shape repeats.',
      'Long periods are easy to lose count of. Step slowly and watch one part, such as the ends of the row.',
    ],
    application: {
      title: 'Clocks',
      text: 'Every clock is a cycle: a pendulum, a quartz crystal, the oscillator that times a processor. Chemistry has them too, as in the Belousov–Zhabotinsky reaction, whose colours pulse on a schedule. In Life, oscillators and guns are the clocks that keep glider signals in step.',
      route: 'apps', label: 'See the chemical clock',
    },
  },
  {
    id: 'light',
    title: 'The speed of light',
    play: 'Race a spaceship to the flag',
    idea: 'A cell only feels its neighbours, so news travels at most one cell per generation. That limit is called the speed of light, c. Spaceships move slower: the glider crawls one cell diagonally every four generations (c/4), and the lightweight spaceship runs two cells every four (c/2).',
    formula: 'v \\le c = 1 \\ \\tfrac{\\text{cell}}{\\text{gen}}, \\qquad v_{\\text{glider}} = \\tfrac{c}{4}, \\quad v_{\\text{LWSS}} = \\tfrac{c}{2}',
    formulaNote: 'Nothing a pattern does can reach a cell more than t steps away in t generations: its light cone.',
    levels: [
      { kind: 'race', title: 'Diagonal delivery', w: 16, h: 16, race: { start: { x0: 0, y0: 0, x1: 5, y1: 5 }, flag: { x0: 12, y0: 12, x1: 15, y1: 15 }, deadline: 48, maxStones: 12 }, stamps: ['glider', 'lwss'] },
      { kind: 'race', title: 'A straight sprint', w: 28, h: 9, race: { start: { x0: 0, y0: 0, x1: 7, y1: 8 }, flag: { x0: 24, y0: 0, x1: 27, y1: 8 }, deadline: 48, maxStones: 12 }, stamps: ['glider', 'lwss'] },
    ],
    hints: [
      'Pick the glider from the stamps, turn it until it points at the flag, and drop it in the start area.',
      'A glider would take about 80 generations to cross this board. The lightweight spaceship is twice as fast: point it at the flag.',
    ],
    application: {
      title: 'Signals and causality',
      text: 'Every real signal has a top speed: light in a vacuum, a nerve impulse, a wave on a wire. Because of it, an event can only affect what lies inside its light cone, which is one of the foundations of relativity. Engineers meet the same limit as latency: no network message beats the speed of light in fibre.',
      route: 'space', label: 'See light cones in 3D spacetime',
    },
  },
  {
    id: 'logic',
    title: 'Collisions are logic',
    play: 'Aim one glider at another',
    idea: 'When two gliders meet, what comes out depends only on how they line up: the lane and the timing. Some collisions destroy both, some leave a block, some let one glider through. A stream of gliders is a stream of bits, and collisions like these are the logic gates of computers built inside Life.',
    formula: '\\text{glider} + \\text{glider} \\xrightarrow{\\text{lane, timing}} \\varnothing \\mid \\text{block} \\mid \\text{glider} \\mid \\cdots',
    formulaNote: 'Conway and colleagues used reactions like these to prove that Life can compute anything a computer can (it is Turing complete).',
    levels: [
      { kind: 'collide', title: 'Annihilation', target: new Map(), goal: 'Make the gliders destroy each other completely.' },
      { kind: 'collide', title: 'Leave a block', target: new Map([['Block', 1]]), goal: 'Make the collision leave exactly one block.' },
      { kind: 'collide', title: 'One gets through', target: new Map([['Glider', 1]]), goal: 'Make the collision end with exactly one glider flying on.' },
    ],
    hints: [
      'Gliders far apart in lane just pass each other. Move the lane towards 0 and try each timing.',
      'Small changes matter: try the lanes from −3 to +2, one timing at a time.',
      'This one is rare: 2 of the 36 collisions do it. Try lanes 2 and −3.',
    ],
    application: {
      title: 'Computers from collisions',
      text: 'A NOT gate is a glider stream that is wiped out where an input glider is present. With guns as clocks and eaters as wire ends, people have built full computers in Life, including a Turing machine. Real hardware has its echo: billiard-ball and reversible logic, and the optical computers that let beams of light switch each other.',
      route: 'lineage', label: 'Trace collisions in the lineage tree',
    },
  },
  {
    id: 'backwards',
    title: 'Running time backwards',
    play: 'Draw a pattern\'s parent',
    idea: 'F is easy to run forwards and hard to undo, because many boards lead to the same one: F is not one-to-one. To go back you have to search, and some boards (Gardens of Eden) have no past at all.',
    formula: 'F(y) = x \\ \\text{ has many solutions } y \\text{, or none}',
    formulaNote: 'Moore and Myhill\'s Garden of Eden theorem: Gardens of Eden exist exactly because different boards can collide into the same one.',
    levels: [
      { kind: 'parent', title: 'Before the blinker', w: 7, h: 7, target: [[3, 2], [3, 3], [3, 4]], maxStones: 3 },
      { kind: 'parent', title: 'Before the block', w: 7, h: 7, target: [[2, 2], [3, 2], [2, 3], [3, 3]], maxStones: 3 },
      { kind: 'parent', title: 'Before the glider', w: 8, h: 8, target: at(patternCells('glider'), 3, 3), maxStones: 5 },
    ],
    hints: [
      'A blinker turns into itself turned sideways. What did the vertical line look like one step earlier?',
      'Three stones in an L shape: the empty corner has exactly three neighbours, so a stone is born there.',
      'A glider\'s parent is a glider, one phase earlier and in a slightly different place. Watch a glider run to see its phases.',
    ],
    application: {
      title: 'Inverse problems',
      text: 'Working out causes from effects is the hard direction almost everywhere: rebuilding an image from a CT scan, sharpening a blurred photo, finding where an earthquake started. Cryptography turns the difficulty into a feature: a good hash function is easy to compute and practically impossible to run backwards.',
      route: 'ancestors', label: 'Search for ancestors',
    },
  },
  {
    id: 'ash',
    title: 'The ash',
    play: 'Predict how much survives',
    idea: 'Start from random soup and Life burns down to a sparse "ash" of still lifes and blinkers. Mean-field theory pretends each cell is independent of its neighbours, and from that predicts the density the soup settles at. Measure it, and compare.',
    formula: "p' = (1-p)\\,B_3 + p\\,(B_2 + B_3), \\qquad B_k = \\tbinom{8}{k} p^k (1-p)^{8-k}",
    formulaNote: 'The mean-field fixed point is p ≈ 37%. Real soups end far lower, because neighbouring cells are not independent at all.',
    levels: [
      { kind: 'ash', title: 'A 30% soup', start: 0.3 },
      { kind: 'ash', title: 'A 60% soup', start: 0.6 },
      { kind: 'ash', title: 'A 90% soup', start: 0.9 },
    ],
    hints: [
      'Mean-field theory says about 37%. Life is far more wasteful: think of how empty the board looks after a soup settles.',
      'Over a wide range of starting densities, the ash comes out about the same.',
      'Very crowded cells die of overcrowding in the first step. What is left of a board that is almost all stones?',
    ],
    application: {
      title: 'When averages lie',
      text: 'Mean-field theory works well for magnets near their critical temperature, for crowds and for simple epidemic models, and fails where neighbours matter. That gap is why epidemiologists model contact networks rather than averages, and why physicists study correlations. The ash density, around 3%, is also why random soups are such a good way to discover new objects.',
      route: 'math', label: 'Read the mean-field maths',
    },
  },
  {
    id: 'chaos',
    title: 'The edge of chaos',
    play: 'Design a universe',
    idea: 'Life is one of 2¹⁸ = 262,144 rules of its kind: choose which neighbour counts cause a birth and which let a cell survive. Most rules die out, freeze or boil. Only a narrow band, between order and chaos, makes long-lived moving structure, and Life sits in it.',
    formula: '\\lambda = \\frac{\\#\\{\\text{neighbourhoods that give a live cell}\\}}{512}',
    formulaNote: 'Langton\'s λ: low λ tends to freeze, high λ tends to boil, and complex rules sit in between. Life has λ ≈ 0.27.',
    levels: [
      { kind: 'rule', title: 'Make it boil', want: 'III' },
      { kind: 'rule', title: 'Find the edge', want: 'IV', not: ['B3/S23'] },
    ],
    hints: [
      'Births from 2 neighbours make almost anything explode. Try B2 with no survival at all.',
      'Start from Life (B3/S23) and add one more birth number: B36/S23 is HighLife, which has a replicator.',
    ],
    application: {
      title: 'Designing for emergence',
      text: 'Choosing local rules to get a global behaviour is how engineers design swarms of robots, self-assembling materials and the cellular automata that model crystal growth. Biologists have long asked whether life itself sits at the edge of chaos, ordered enough to keep information and loose enough to change.',
      route: 'atlas', label: 'Explore the rule atlas',
    },
  },
];

export const STAMPS: Record<string, { name: string; cells: () => Cell[]; speed: string }> = {
  glider: { name: 'Glider', cells: () => patternCells('glider'), speed: 'c/4 diagonally' },
  lwss: { name: 'Lightweight spaceship', cells: () => patternCells('lwss'), speed: 'c/2 straight' },
};

// ---------- scoring and progress ----------

export interface LevelScore { stars: number; tries: number; hint: boolean }

/** Three stars for a clean solve, two after several tries, one with the hint. */
export function starsFor(tries: number, hint: boolean): number {
  if (hint) return 1;
  return tries <= 2 ? 3 : 2;
}

/** For the ash levels: a prediction within 2 points earns three stars, within 4 two, within 8 one. */
export function ashStars(guess: number, measured: number): number {
  const err = Math.abs(guess - measured) * 100;
  return err <= 2 ? 3 : err <= 4 ? 2 : err <= 8 ? 1 : 0;
}

export const chapterStars = (scores: (LevelScore | undefined)[]) => (scores.every(Boolean) ? Math.min(...scores.map((s) => s!.stars)) : 0);

export { findPeriod };
