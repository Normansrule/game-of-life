import { type Cell } from './life';
import { type Rule, parseRule, ruleTable } from './rules';
import { describePeriodicity, findPeriod, identify } from './objects';

/**
 * Lineage tree ("genealogy") of a Life pattern.
 *
 * Every generation the live cells are split into objects (cells within
 * Chebyshev distance 2 of each other). Because a cell's next state depends
 * only on its 3x3 neighbourhood, every cell at time t+1 descends from
 * exactly one object at time t. That gives a well-defined parent relation:
 *
 *   - one object -> one object   : the same lineage segment continues
 *   - one object -> many objects : a SPLIT (branching)
 *   - many objects -> one object : a MERGE (collision)
 *   - one object -> nothing      : a DEATH
 *
 * Collapsing runs of one-to-one steps into segments yields a directed
 * acyclic graph that is a tree whenever no collisions happen.
 */

export type Fate = 'running' | 'died' | 'split' | 'merged' | 'escaped';

export interface Segment {
  id: number;
  start: number;
  end: number;
  parents: number[];
  children: number[];
  fate: Fate;
  startCells: Cell[];
  endCells: Cell[];
  peak: number;
  /** Name of a recognised object, e.g. "Glider", or a description such as "oscillator (period 2)". */
  label?: string;
  kind?: 'still life' | 'oscillator' | 'spaceship' | 'unknown';
}

export interface Frame {
  /** Cell indices (y * size + x) alive in this generation. */
  cells: Int32Array;
  /** Segment id for each cell in `cells`. */
  seg: Int32Array;
}

export interface LineageResult {
  size: number;
  segments: Segment[];
  frames: Frame[];
  populations: number[];
  stabilizedAt: number | null;
  /** Last generation with a split, merge or death: when the "reaction" ends. */
  settledAt: number;
  finalPeriod: number | null;
  generations: number;
  splits: number;
  merges: number;
  deaths: number;
  escapes: number;
}

export interface LineageOptions {
  maxGen?: number;
  size?: number;
  rule?: Rule | string;
  margin?: number;
  onProgress?: (gen: number) => void;
}

export function buildLineage(seed: Cell[], opts: LineageOptions = {}): LineageResult {
  const run = new LineageRun(seed, opts);
  while (!run.done) run.advance(500);
  return run.result();
}

/** Incremental builder so the UI can show progress for long runs. */
export class LineageRun {
  readonly size: number;
  readonly maxGen: number;
  done = false;
  private margin: number;
  private table: Uint8Array;
  private cur: Uint8Array;
  private nxt: Uint8Array;
  private comp: Int32Array; // component id per cell for current gen (-1 = none)
  private compSpare: Int32Array;
  private segOfComp: number[] = [];
  private segments: Segment[] = [];
  private frames: Frame[] = [];
  private populations: number[] = [];
  private hashes: number[] = [];
  private gen = 0;
  private stabilizedAt: number | null = null;
  private finalPeriod: number | null = null;
  private stats = { splits: 0, merges: 0, deaths: 0, escapes: 0 };
  private bx0 = 0;
  private by0 = 0;
  private bx1 = 0;
  private by1 = 0;

  constructor(seed: Cell[], opts: LineageOptions) {
    this.size = opts.size ?? 384;
    this.maxGen = opts.maxGen ?? 2000;
    this.margin = opts.margin ?? 6;
    const rule = opts.rule ? (typeof opts.rule === 'string' ? parseRule(opts.rule) : opts.rule) : parseRule('B3/S23');
    this.table = ruleTable(rule);
    const n = this.size * this.size;
    this.cur = new Uint8Array(n);
    this.nxt = new Uint8Array(n);
    this.comp = new Int32Array(n).fill(-1);
    this.compSpare = new Int32Array(n).fill(-1);

    // Centre the seed.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of seed) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const ox = Math.floor(this.size / 2 - (x1 - x0) / 2) - x0;
    const oy = Math.floor(this.size / 2 - (y1 - y0) / 2) - y0;
    for (const [x, y] of seed) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && py >= 0 && px < this.size && py < this.size) this.cur[py * this.size + px] = 1;
    }
    this.recomputeBounds();

    // Generation 0: every object is a root segment.
    const comps = this.label();
    this.segOfComp = comps.map((cells) => this.newSegment(0, [], cells));
    this.record(comps);
  }

  get generation(): number {
    return this.gen;
  }

  advance(steps: number): void {
    for (let s = 0; s < steps && !this.done; s++) this.tick();
  }

  result(): LineageResult {
    return {
      size: this.size,
      segments: this.segments,
      frames: this.frames,
      populations: this.populations,
      stabilizedAt: this.stabilizedAt,
      settledAt: this.segments.reduce(
        (m, sg) => Math.max(m, sg.start, sg.fate === 'died' ? sg.end + 1 : 0),
        0,
      ),
      finalPeriod: this.finalPeriod,
      generations: this.gen,
      ...this.stats,
    };
  }

  private tick(): void {
    const prevComp = this.comp;
    this.comp = this.compSpare;
    this.compSpare = prevComp;
    this.stepGrid();
    this.gen++;
    const comps = this.label();

    // Parent components of each new component.
    const N = this.size;
    const childrenOf = new Map<number, number[]>();
    const parentsOf: number[][] = comps.map((cells, ci) => {
      const ps = new Set<number>();
      for (const [x, y] of cells) {
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= N) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= N) continue;
            const p = prevComp[yy * N + xx];
            if (p >= 0) ps.add(p);
          }
        }
      }
      for (const p of ps) {
        let arr = childrenOf.get(p);
        if (!arr) childrenOf.set(p, (arr = []));
        arr.push(ci);
      }
      return [...ps];
    });

    const prevSegs = this.segOfComp;
    const newSegOfComp: number[] = new Array(comps.length);
    comps.forEach((cells, ci) => {
      const ps = parentsOf[ci];
      if (ps.length === 1 && childrenOf.get(ps[0])!.length === 1) {
        const seg = this.segments[prevSegs[ps[0]]];
        seg.end = this.gen;
        seg.endCells = cells;
        seg.peak = Math.max(seg.peak, cells.length);
        newSegOfComp[ci] = seg.id;
      } else {
        const parentSegs = ps.map((p) => prevSegs[p]);
        const id = this.newSegment(this.gen, parentSegs, cells);
        for (const s of parentSegs) this.segments[s].children.push(id);
        if (ps.length > 1) this.stats.merges++;
        newSegOfComp[ci] = id;
      }
    });

    // Close segments that ended at the previous generation.
    prevSegs.forEach((sid, p) => {
      const kids = childrenOf.get(p);
      const seg = this.segments[sid];
      if (!kids) {
        if (seg.fate === 'running') {
          seg.fate = 'died';
          this.stats.deaths++;
        }
      } else if (kids.length > 1) {
        seg.fate = 'split';
        this.stats.splits++;
      } else if (newSegOfComp[kids[0]] !== sid) {
        seg.fate = 'merged';
      }
    });
    this.segOfComp = newSegOfComp;

    // Objects that reach the margin are flying away: classify and delete them.
    const keep: Cell[][] = [];
    const keepSegs: number[] = [];
    const m = this.margin;
    comps.forEach((cells, ci) => {
      const touches = cells.some(([x, y]) => x < m || y < m || x >= N - m || y >= N - m);
      if (touches) {
        const seg = this.segments[newSegOfComp[ci]];
        seg.fate = 'escaped';
        this.stats.escapes++;
        this.classify(seg);
        for (const [x, y] of cells) {
          this.cur[y * N + x] = 0;
          this.comp[y * N + x] = -1;
        }
      } else {
        keep.push(cells);
        keepSegs.push(newSegOfComp[ci]);
      }
    });
    if (keep.length !== comps.length) {
      // Re-index component labels after removals.
      keep.forEach((cells, ci) => {
        for (const [x, y] of cells) this.comp[y * N + x] = ci;
      });
      this.segOfComp = keepSegs;
    }
    this.record(keep);

    // Global periodicity check (whole world repeats exactly).
    const h = this.hashNow();
    const look = Math.min(this.hashes.length, 64);
    for (let p = 1; p <= look; p++) {
      if (this.hashes[this.hashes.length - p] === h) {
        this.stabilizedAt = this.gen - p;
        this.finalPeriod = p;
        this.done = true;
        break;
      }
    }
    this.hashes.push(h);
    if (this.populations[this.populations.length - 1] === 0) {
      this.stabilizedAt = this.gen;
      this.finalPeriod = 1;
      this.done = true;
    }
    if (this.gen >= this.maxGen) this.done = true;
    if (this.done) for (const sid of this.segOfComp) this.classify(this.segments[sid]);
  }

  private classify(seg: Segment): void {
    if (seg.label) return;
    const cells = seg.endCells;
    const known = identify(cells);
    if (known) {
      seg.label = known.name;
      seg.kind = known.kind;
      return;
    }
    if (cells.length <= 200) {
      const p = findPeriod(cells, 30);
      if (p) {
        seg.label = describePeriodicity(p);
        seg.kind = !p.dx && !p.dy ? (p.period === 1 ? 'still life' : 'oscillator') : 'spaceship';
        return;
      }
    }
    seg.kind = 'unknown';
  }

  private newSegment(start: number, parents: number[], cells: Cell[]): number {
    const id = this.segments.length;
    this.segments.push({
      id, start, end: start, parents, children: [], fate: 'running',
      startCells: cells, endCells: cells, peak: cells.length,
    });
    return id;
  }

  private record(comps: Cell[][]): void {
    let total = 0;
    for (const c of comps) total += c.length;
    const cells = new Int32Array(total);
    const seg = new Int32Array(total);
    let k = 0;
    comps.forEach((c, ci) => {
      const sid = this.segOfComp[ci];
      for (const [x, y] of c) {
        cells[k] = y * this.size + x;
        seg[k++] = sid;
      }
    });
    this.frames.push({ cells, seg });
    this.populations.push(total);
  }

  private hashNow(): number {
    let h = 0x811c9dc5;
    const N = this.size;
    for (let y = this.by0; y <= this.by1; y++)
      for (let x = this.bx0; x <= this.bx1; x++)
        if (this.cur[y * N + x]) {
          h ^= y * N + x;
          h = Math.imul(h, 0x01000193);
        }
    return h >>> 0;
  }

  private recomputeBounds(): void {
    const N = this.size;
    let x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (this.cur[y * N + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    this.bx0 = x0; this.by0 = y0; this.bx1 = x1; this.by1 = y1;
  }

  /** Step only the bounding box (+1), which keeps sparse patterns fast. */
  private stepGrid(): void {
    const N = this.size;
    const { cur, nxt, table } = this;
    const x0 = Math.max(1, this.bx0 - 1), x1 = Math.min(N - 2, this.bx1 + 1);
    const y0 = Math.max(1, this.by0 - 1), y1 = Math.min(N - 2, this.by1 + 1);
    let nx0 = N, ny0 = N, nx1 = -1, ny1 = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        const n =
          cur[i - N - 1] + cur[i - N] + cur[i - N + 1] +
          cur[i - 1] + cur[i + 1] +
          cur[i + N - 1] + cur[i + N] + cur[i + N + 1];
        const v = table[(cur[i] << 4) | n];
        nxt[i] = v;
        if (v) {
          if (x < nx0) nx0 = x;
          if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y;
          if (y > ny1) ny1 = y;
        }
      }
    }
    // Clear the old box in cur and copy the new values over.
    for (let y = Math.max(0, this.by0); y <= this.by1; y++)
      for (let x = Math.max(0, this.bx0); x <= this.bx1; x++) cur[y * N + x] = 0;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * N + x;
        cur[i] = nxt[i];
        nxt[i] = 0;
      }
    if (nx1 < 0) { nx0 = ny0 = 0; nx1 = ny1 = 0; }
    this.bx0 = nx0; this.by0 = ny0; this.bx1 = nx1; this.by1 = ny1;
  }

  /** Label objects (radius-2 connectivity) and fill `comp`. */
  private label(): Cell[][] {
    const N = this.size;
    const { cur, comp } = this;
    // Reset labels over a slightly padded old+new box.
    comp.fill(-1);
    const comps: Cell[][] = [];
    const stack: number[] = [];
    for (let y = this.by0; y <= this.by1; y++)
      for (let x = this.bx0; x <= this.bx1; x++) {
        const i0 = y * N + x;
        if (!cur[i0] || comp[i0] >= 0) continue;
        const id = comps.length;
        const cells: Cell[] = [];
        comp[i0] = id;
        stack.push(i0);
        while (stack.length) {
          const i = stack.pop()!;
          const cx = i % N, cy = (i - cx) / N;
          cells.push([cx, cy]);
          for (let dy = -2; dy <= 2; dy++) {
            const yy = cy + dy;
            if (yy < 0 || yy >= N) continue;
            for (let dx = -2; dx <= 2; dx++) {
              const xx = cx + dx;
              if (xx < 0 || xx >= N) continue;
              const j = yy * N + xx;
              if (cur[j] && comp[j] < 0) {
                comp[j] = id;
                stack.push(j);
              }
            }
          }
        }
        comps.push(cells);
      }
    return comps;
  }
}
