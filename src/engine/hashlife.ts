import type { Cell } from './life';
import { type Rule, parseRule } from './rules';

/**
 * Hashlife (Gosper, 1984).
 *
 * The universe is a quadtree. A node of level k is a 2^k x 2^k square made
 * of four level k-1 children; level 0 nodes are single cells. Nodes are
 * hash-consed, so identical squares anywhere in space and time are stored
 * once. The key operation is `successor(node, j)`: the central
 * 2^(k-1) x 2^(k-1) square of `node`, advanced 2^j generations (j <= k-2).
 * Results are memoised on the node, so repeated structure is computed once,
 * which lets regular patterns be advanced exponentially far.
 */
export class HNode {
  readonly id: number;
  readonly pop: number;
  /** successor cache, indexed by j */
  next: (HNode | undefined)[] = [];
  /** cached bounding box of live cells, relative to this node's top-left corner */
  box?: [number, number, number, number] | null;
  constructor(
    id: number,
    readonly k: number,
    readonly nw: HNode | null,
    readonly ne: HNode | null,
    readonly sw: HNode | null,
    readonly se: HNode | null,
    pop: number,
  ) {
    this.id = id;
    this.pop = pop;
  }
}

export class Hashlife {
  private table = new Map<string, HNode>();
  private empties: HNode[] = [];
  private nextId = 2;
  readonly off: HNode;
  readonly on: HNode;
  readonly rule: Rule;
  private birth: boolean[];
  private survive: boolean[];
  root: HNode;
  /** Generation of `root`. Exact up to 2^53. */
  generation = 0;
  stats = { hits: 0, misses: 0 };

  constructor(rule: Rule | string = 'B3/S23') {
    this.rule = typeof rule === 'string' ? parseRule(rule) : rule;
    if (this.rule.birth[0]) throw new Error('Hashlife needs a rule without B0');
    this.birth = this.rule.birth;
    this.survive = this.rule.survive;
    this.off = new HNode(0, 0, null, null, null, null, 0);
    this.on = new HNode(1, 0, null, null, null, null, 1);
    this.root = this.empty(3);
  }

  get nodeCount(): number {
    return this.table.size;
  }

  join(nw: HNode, ne: HNode, sw: HNode, se: HNode): HNode {
    const key = `${nw.id},${ne.id},${sw.id},${se.id}`;
    let n = this.table.get(key);
    if (!n) {
      n = new HNode(this.nextId++, nw.k + 1, nw, ne, sw, se, nw.pop + ne.pop + sw.pop + se.pop);
      this.table.set(key, n);
    }
    return n;
  }

  empty(k: number): HNode {
    if (k === 0) return this.off;
    let e = this.empties[k];
    if (!e) {
      const c = this.empty(k - 1);
      e = this.join(c, c, c, c);
      this.empties[k] = e;
    }
    return e;
  }

  /** Surround a node with empty space: level k -> k+1, same centre. */
  expand(n: HNode): HNode {
    const e = this.empty(n.k - 1);
    return this.join(
      this.join(e, e, e, n.nw!),
      this.join(e, e, n.ne!, e),
      this.join(e, n.sw!, e, e),
      this.join(n.se!, e, e, e),
    );
  }

  /** Central quarter: level k -> k-1. */
  centre(n: HNode): HNode {
    return this.join(n.nw!.se!, n.ne!.sw!, n.sw!.ne!, n.se!.nw!);
  }

  /** Base case: next generation of the centre 2x2 of a 4x4 node. */
  private life4x4(n: HNode): HNode {
    // Read the 16 cells into a bitmask, row-major from the top-left.
    const g = (q: HNode, a: 'nw' | 'ne' | 'sw' | 'se') => q[a]!.pop;
    const bits = [
      g(n.nw!, 'nw'), g(n.nw!, 'ne'), g(n.ne!, 'nw'), g(n.ne!, 'ne'),
      g(n.nw!, 'sw'), g(n.nw!, 'se'), g(n.ne!, 'sw'), g(n.ne!, 'se'),
      g(n.sw!, 'nw'), g(n.sw!, 'ne'), g(n.se!, 'nw'), g(n.se!, 'ne'),
      g(n.sw!, 'sw'), g(n.sw!, 'se'), g(n.se!, 'sw'), g(n.se!, 'se'),
    ];
    const cell = (x: number, y: number) => {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) s += bits[(y + dy) * 4 + x + dx];
      const alive = bits[y * 4 + x];
      return (alive ? this.survive[s] : this.birth[s]) ? this.on : this.off;
    };
    return this.join(cell(1, 1), cell(2, 1), cell(1, 2), cell(2, 2));
  }

  /** Centre of `n` advanced 2^j generations (j defaults to the maximum, k-2). */
  successor(n: HNode, j = n.k - 2): HNode {
    if (n.pop === 0) return this.empty(n.k - 1);
    j = Math.min(j, n.k - 2);
    const cached = n.next[j];
    if (cached) {
      this.stats.hits++;
      return cached;
    }
    this.stats.misses++;
    let s: HNode;
    if (n.k === 2) s = this.life4x4(n);
    else {
      const a = n.nw!, b = n.ne!, c = n.sw!, d = n.se!;
      const J = this.join.bind(this);
      const c1 = this.successor(J(a.nw!, a.ne!, a.sw!, a.se!), j);
      const c2 = this.successor(J(a.ne!, b.nw!, a.se!, b.sw!), j);
      const c3 = this.successor(J(b.nw!, b.ne!, b.sw!, b.se!), j);
      const c4 = this.successor(J(a.sw!, a.se!, c.nw!, c.ne!), j);
      const c5 = this.successor(J(a.se!, b.sw!, c.ne!, d.nw!), j);
      const c6 = this.successor(J(b.sw!, b.se!, d.nw!, d.ne!), j);
      const c7 = this.successor(J(c.nw!, c.ne!, c.sw!, c.se!), j);
      const c8 = this.successor(J(c.ne!, d.nw!, c.se!, d.sw!), j);
      const c9 = this.successor(J(d.nw!, d.ne!, d.sw!, d.se!), j);
      if (j < n.k - 2) {
        // Only 2^j generations: the nine results are already far enough along; take their centres.
        s = J(
          J(c1.se!, c2.sw!, c4.ne!, c5.nw!),
          J(c2.se!, c3.sw!, c5.ne!, c6.nw!),
          J(c4.se!, c5.sw!, c7.ne!, c8.nw!),
          J(c5.se!, c6.sw!, c8.ne!, c9.nw!),
        );
      } else {
        // Two half-steps of 2^(k-3) each give the full 2^(k-2).
        s = J(
          this.successor(J(c1, c2, c4, c5), j),
          this.successor(J(c2, c3, c5, c6), j),
          this.successor(J(c4, c5, c7, c8), j),
          this.successor(J(c5, c6, c8, c9), j),
        );
      }
    }
    n.next[j] = s;
    return s;
  }

  /** Load cells; (0,0) of the pattern lands near the universe centre. */
  load(cells: Cell[]): void {
    this.generation = 0;
    if (!cells.length) {
      this.root = this.empty(3);
      return;
    }
    let maxAbs = 1;
    for (const [x, y] of cells) maxAbs = Math.max(maxAbs, Math.abs(x) + 1, Math.abs(y) + 1);
    let k = 3;
    while (2 ** (k - 1) < maxAbs) k++;
    const half = 2 ** (k - 1);
    const set = new Set(cells.map(([x, y]) => `${x},${y}`));
    const build = (lvl: number, x0: number, y0: number, pts: Cell[]): HNode => {
      if (!pts.length) return this.empty(lvl);
      if (lvl === 0) return set.has(`${x0},${y0}`) ? this.on : this.off;
      const h = 2 ** (lvl - 1);
      const q: Cell[][] = [[], [], [], []];
      for (const p of pts) q[(p[1] >= y0 + h ? 2 : 0) + (p[0] >= x0 + h ? 1 : 0)].push(p);
      return this.join(
        build(lvl - 1, x0, y0, q[0]),
        build(lvl - 1, x0 + h, y0, q[1]),
        build(lvl - 1, x0, y0 + h, q[2]),
        build(lvl - 1, x0 + h, y0 + h, q[3]),
      );
    };
    this.root = build(k, -half, -half, cells);
  }

  /** Expand until the pattern sits well inside the root (outer 3/4 empty) and the root is big enough. */
  private padFor(minLevel: number): void {
    let r = this.root;
    while (r.k < minLevel || !this.innerOnly(r)) r = this.expand(r);
    this.root = r;
  }

  /** True when all live cells lie in the central quarter of n. */
  private innerOnly(n: HNode): boolean {
    if (n.k < 3) return false;
    const inner = this.centre(this.centre(n));
    return inner.pop === n.pop;
  }

  /** Remove empty border so the tree stays small. */
  private crop(): void {
    let r = this.root;
    while (r.k > 3 && this.centre(r).pop === r.pop) r = this.centre(r);
    this.root = r;
  }

  /** Advance by exactly `gens` generations using binary decomposition. */
  advance(gens: number): void {
    if (gens <= 0) return;
    let bits = Math.floor(Math.log2(gens));
    while (gens > 0) {
      while (2 ** bits > gens) bits--;
      // successor(root, j) of a level-k root needs k >= j + 2; with the pattern in
      // the central quarter it stays inside the returned half for 2^j <= 2^(k-3) steps.
      this.padFor(bits + 3);
      this.root = this.expand(this.root);
      this.root = this.successor(this.root, bits);
      this.generation += 2 ** bits;
      gens -= 2 ** bits;
      this.crop();
    }
    this.maybeGC();
  }

  /** Advance by the largest power of two the current tree allows in one go: 2^(k-2). */
  stepBig(j: number): void {
    this.advance(2 ** j);
  }

  /** Drop memo tables when they get large; existing nodes stay valid. */
  private maybeGC(): void {
    if (this.table.size > 3_000_000) {
      const keep = this.root;
      this.table.clear();
      this.empties = [];
      this.root = this.rebuild(keep, new Map());
    }
  }

  private rebuild(n: HNode, memo: Map<number, HNode>): HNode {
    if (n.k === 0) return n;
    const m = memo.get(n.id);
    if (m) return m;
    const r = this.join(this.rebuild(n.nw!, memo), this.rebuild(n.ne!, memo), this.rebuild(n.sw!, memo), this.rebuild(n.se!, memo));
    memo.set(n.id, r);
    return r;
  }

  get population(): number {
    return this.root.pop;
  }

  /** Live cells (relative to the universe centre). Stops after `limit` cells. */
  cells(limit = 1_000_000): Cell[] {
    const out: Cell[] = [];
    const half = 2 ** (this.root.k - 1);
    const walk = (n: HNode, x: number, y: number) => {
      if (!n.pop || out.length >= limit) return;
      if (n.k === 0) {
        out.push([x, y]);
        return;
      }
      const h = 2 ** (n.k - 1);
      walk(n.nw!, x, y);
      walk(n.ne!, x + h, y);
      walk(n.sw!, x, y + h);
      walk(n.se!, x + h, y + h);
    };
    walk(this.root, -half, -half);
    return out;
  }

  /** Bounding box of live cells. Memoised per node, so it costs O(unique nodes). */
  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    const b = this.box(this.root);
    if (!b) return null;
    const half = 2 ** (this.root.k - 1);
    return { x0: b[0] - half, y0: b[1] - half, x1: b[2] - half, y1: b[3] - half };
  }

  private box(n: HNode): [number, number, number, number] | null {
    if (n.box !== undefined) return n.box;
    let r: [number, number, number, number] | null = null;
    if (!n.pop) r = null;
    else if (n.k === 0) r = [0, 0, 0, 0];
    else {
      const h = 2 ** (n.k - 1);
      const parts: [HNode, number, number][] = [[n.nw!, 0, 0], [n.ne!, h, 0], [n.sw!, 0, h], [n.se!, h, h]];
      for (const [c, ox, oy] of parts) {
        const b = this.box(c);
        if (!b) continue;
        if (!r) r = [b[0] + ox, b[1] + oy, b[2] + ox, b[3] + oy];
        else {
          r[0] = Math.min(r[0], b[0] + ox);
          r[1] = Math.min(r[1], b[1] + oy);
          r[2] = Math.max(r[2], b[2] + ox);
          r[3] = Math.max(r[3], b[3] + oy);
        }
      }
    }
    n.box = r;
    return r;
  }

  /**
   * Visit squares for rendering at a given resolution: recursion stops at
   * nodes no larger than `minSize` cells and reports their density.
   */
  visit(minSize: number, view: { x0: number; y0: number; x1: number; y1: number }, fn: (x: number, y: number, size: number, density: number) => void): void {
    const half = 2 ** (this.root.k - 1);
    const walk = (n: HNode, x: number, y: number) => {
      if (!n.pop) return;
      const s = 2 ** n.k;
      if (x > view.x1 || y > view.y1 || x + s < view.x0 || y + s < view.y0) return;
      if (s <= minSize || n.k === 0) {
        fn(x, y, s, n.pop / (s * s));
        return;
      }
      const h = s / 2;
      walk(n.nw!, x, y);
      walk(n.ne!, x + h, y);
      walk(n.sw!, x, y + h);
      walk(n.se!, x + h, y + h);
    };
    walk(this.root, -half, -half);
  }
}
