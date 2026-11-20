/**
 * A small Go board for the game. It shows the level's own stones in black and
 * the player's in white, and can mark cells (rings for a target, a tint for a
 * start area or a flag, numbers for neighbour counts, red for a mistake). It
 * can also run a pattern, so the player watches what their move does.
 */
import { type Cell, evolveSparse } from '../engine/life';
import { key } from '../engine/game';
import { fitCanvas } from './dom';
import { alpha, tok } from './theme';
import { CellPainter, drawBoardLines, drawStarPoints } from './thumb';
import * as sfx from './sfx';

export interface Zone { x0: number; y0: number; x1: number; y1: number; tone: 'start' | 'flag' }

export interface BoardOptions {
  w: number;
  h: number;
  /** May the player place stones? */
  editable?: boolean;
  /** At most this many player stones; placing one more moves the oldest. */
  maxStones?: number;
  /** Player stones may only go inside this area. */
  allowed?: { x0: number; y0: number; x1: number; y1: number };
  label?: string;
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class GameBoard {
  readonly canvas: HTMLCanvasElement;
  given: Cell[] = [];
  player: Cell[] = [];
  rings: Cell[] = [];
  zones: Zone[] = [];
  counts: Map<string, number> | null = null;
  wrong: Cell[] = [];
  missed: Cell[] = [];
  /** A shape placed instead of a single stone on each tap. */
  stamp: Cell[] | null = null;
  onChange: () => void = () => {};
  /** While running: the pattern, its generation, and when each stone was born. */
  private run: { cells: Cell[]; gen: number; born: Map<string, number> } | null = null;
  private hover: Cell | null = null;
  private drops = new Map<string, number>();
  private timer = 0;

  constructor(public o: BoardOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-board';
    this.canvas.tabIndex = o.editable ? 0 : -1;
    if (o.label) this.canvas.setAttribute('aria-label', o.label);
    this.canvas.addEventListener('pointerdown', (e) => this.tap(e));
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.o.editable || e.pointerType !== 'mouse') return;
      const c = this.cellAt(e);
      if (c?.[0] !== this.hover?.[0] || c?.[1] !== this.hover?.[1]) { this.hover = c; this.draw(); }
    });
    this.canvas.addEventListener('pointerleave', () => { this.hover = null; this.draw(); });
  }

  setSize(w: number, h: number) { this.o.w = w; this.o.h = h; this.draw(); }

  get running() { return !!this.run; }
  get generation() { return this.run?.gen ?? 0; }
  get cells(): Cell[] { return this.run ? this.run.cells : [...this.given, ...this.player]; }

  clearMarks() { this.wrong = []; this.missed = []; }

  /**
   * Run the board's pattern. `onStep` sees each generation and returns false to stop.
   * `every` ms per generation; `skip` generations are computed per frame for long runs.
   */
  play(onStep: (cells: Cell[], gen: number) => boolean | void, every = 140, skip = 1, start = this.cells) {
    this.stop(false);
    this.run = { cells: start, gen: 0, born: new Map(start.map(([x, y]) => [key(x, y), 0])) };
    this.draw();
    const tick = () => {
      const r = this.run;
      if (!r) return;
      r.cells = evolveSparse(r.cells, skip);
      r.gen += skip;
      const born = new Map<string, number>();
      for (const [x, y] of r.cells) { const k = key(x, y); born.set(k, r.born.get(k) ?? r.gen); }
      r.born = born;
      this.draw();
      if (onStep(r.cells, r.gen) === false || !r.cells.length) { this.timer = 0; return; }
      this.timer = window.setTimeout(tick, reducedMotion() ? Math.max(every, 300) : every);
    };
    this.timer = window.setTimeout(tick, every);
  }

  /** Advance one generation by hand (the period level). */
  step() {
    if (!this.run) this.run = { cells: this.cells, gen: 0, born: new Map(this.cells.map(([x, y]) => [key(x, y), 0])) };
    const r = this.run;
    r.cells = evolveSparse(r.cells, 1);
    r.gen++;
    const born = new Map<string, number>();
    for (const [x, y] of r.cells) { const k = key(x, y); born.set(k, r.born.get(k) ?? r.gen); }
    r.born = born;
    this.draw();
  }

  /** Stop running; by default go back to the placed stones. */
  stop(reset = true) {
    clearTimeout(this.timer);
    this.timer = 0;
    if (reset) { this.run = null; this.draw(); }
  }
  get ticking() { return !!this.timer; }

  private cellAt(e: PointerEvent): Cell | null {
    const r = this.canvas.getBoundingClientRect();
    const { s, ox, oy } = this.geometry(r.width, r.height);
    const x = Math.floor((e.clientX - r.left - ox) / s), y = Math.floor((e.clientY - r.top - oy) / s);
    return x >= 0 && y >= 0 && x < this.o.w && y < this.o.h ? [x, y] : null;
  }

  private allowedAt([x, y]: Cell) {
    const a = this.o.allowed;
    return !a || (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1);
  }

  private tap(e: PointerEvent) {
    if (!this.o.editable) return;
    if (this.run) this.stop();
    const c = this.cellAt(e);
    if (!c || !this.allowedAt(c)) return;
    this.clearMarks();
    if (this.stamp) {
      const placed = this.stamp.map(([x, y]) => [x + c[0], y + c[1]] as Cell).filter((p) => p[0] < this.o.w && p[1] < this.o.h && this.allowedAt(p));
      this.player = placed;
      const now = performance.now();
      placed.forEach(([x, y], i) => this.drops.set(key(x, y), now + i * 30));
      sfx.stone();
    } else {
      const k = key(c[0], c[1]);
      if (this.given.some(([x, y]) => key(x, y) === k)) return;
      const i = this.player.findIndex(([x, y]) => key(x, y) === k);
      if (i >= 0) { this.player.splice(i, 1); sfx.lift(); }
      else {
        if (this.o.maxStones && this.player.length >= this.o.maxStones) this.player.shift();
        this.player.push(c);
        this.drops.set(k, performance.now());
        sfx.stone();
      }
    }
    this.onChange();
    this.animateDrops();
  }

  private animateDrops() {
    if (reducedMotion()) { this.drops.clear(); this.draw(); return; }
    const f = () => {
      this.draw();
      if (this.drops.size) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  private geometry(W: number, H: number) {
    const s = Math.min(W / this.o.w, H / this.o.h);
    return { s, ox: (W - this.o.w * s) / 2, oy: (H - this.o.h * s) / 2 };
  }

  draw() {
    const cv = this.canvas;
    cv.style.aspectRatio = `${this.o.w} / ${this.o.h}`;
    if (!cv.clientWidth) return;
    fitCanvas(cv);
    const ctx = cv.getContext('2d')!;
    const dpr = cv.width / Math.max(1, cv.clientWidth);
    const W = cv.clientWidth, H = cv.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { s, ox, oy } = this.geometry(W, H);
    const { w, h } = this.o;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(ox, oy, w * s, h * s);
    for (const z of this.zones) {
      ctx.fillStyle = z.tone === 'flag' ? alpha('--data-pine', 0.22) : alpha('--shell', 0.32);
      ctx.fillRect(ox + z.x0 * s, oy + z.y0 * s, (z.x1 - z.x0 + 1) * s, (z.y1 - z.y0 + 1) * s);
      if (z.tone === 'flag') {
        // A small pennant in the flag's corner.
        const fx = ox + (z.x1 + 1) * s - s * 0.35, fy = oy + z.y0 * s + s * 0.25;
        ctx.strokeStyle = tok('--ink');
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + s * 1.1); ctx.stroke();
        ctx.fillStyle = tok('--data-shu');
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - s * 0.6, fy + s * 0.25); ctx.lineTo(fx, fy + s * 0.5); ctx.fill();
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, w * s, h * s);
    ctx.clip();
    drawBoardLines(ctx, w * s, h * s, s, ox, oy);
    drawStarPoints(ctx, w, h, s, ox, oy);
    const at = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];

    // Target rings, under the stones.
    if (this.rings.length) {
      ctx.strokeStyle = alpha('--ink', 0.6);
      ctx.lineWidth = Math.max(1.5, s * 0.08);
      ctx.setLineDash([Math.max(2, s * 0.12), Math.max(2, s * 0.1)]);
      ctx.beginPath();
      for (const [x, y] of this.rings) { const [px, py] = at(x, y); ctx.moveTo(px + s * 0.84, py + s / 2); ctx.arc(px + s / 2, py + s / 2, s * 0.34, 0, Math.PI * 2); }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.run) {
      // As on the main board, a stone's colour is the parity of the generation it was born in.
      const black = new CellPainter(s), white = new CellPainter(s);
      for (const [x, y] of this.run.cells) {
        if (x < -1 || y < -1 || x > w || y > h) continue;
        ((this.run.born.get(key(x, y)) ?? 0) % 2 ? white : black).add(...at(x, y));
      }
      black.fill(ctx, '--slate');
      white.fill(ctx, '--shell');
    } else {
      const black = new CellPainter(s);
      for (const [x, y] of this.given) black.add(...at(x, y));
      black.fill(ctx, '--slate');
      const now = performance.now();
      const white = new CellPainter(s);
      for (const [x, y] of this.player) {
        const k = key(x, y), t0 = this.drops.get(k);
        if (t0 === undefined || now - t0 > 320) { this.drops.delete(k); white.add(...at(x, y)); continue; }
        if (now < t0) continue;
        // A stone drops in a little large and settles.
        const t = (now - t0) / 320, sc = 1 + 0.25 * (1 - t) * Math.cos(t * Math.PI * 1.5);
        const p = new CellPainter(s * sc);
        const [px, py] = at(x, y);
        p.add(px - (s * (sc - 1)) / 2, py - (s * (sc - 1)) / 2);
        p.fill(ctx, '--shell');
      }
      white.fill(ctx, '--shell');
      if (this.hover && this.o.editable && this.allowedAt(this.hover)) {
        const cells = this.stamp ? this.stamp.map(([x, y]) => [x + this.hover![0], y + this.hover![1]] as Cell) : [this.hover];
        ctx.strokeStyle = alpha('--board-line', 0.55);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [x, y] of cells) { const [px, py] = at(x, y); ctx.moveTo(px + s * 0.92, py + s / 2); ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2); }
        ctx.stroke();
      }
    }

    // Mistakes: a red ring where a stone was missed, a red cross on a stone that shouldn't be there.
    ctx.strokeStyle = tok('--bad');
    ctx.lineWidth = Math.max(2, s * 0.1);
    ctx.beginPath();
    for (const [x, y] of this.missed) { const [px, py] = at(x, y); ctx.moveTo(px + s * 0.88, py + s / 2); ctx.arc(px + s / 2, py + s / 2, s * 0.38, 0, Math.PI * 2); }
    for (const [x, y] of this.wrong) {
      const [px, py] = at(x, y), d = s * 0.24;
      ctx.moveTo(px + s / 2 - d, py + s / 2 - d); ctx.lineTo(px + s / 2 + d, py + s / 2 + d);
      ctx.moveTo(px + s / 2 + d, py + s / 2 - d); ctx.lineTo(px + s / 2 - d, py + s / 2 + d);
    }
    ctx.stroke();

    if (this.counts) {
      ctx.font = `600 ${Math.round(s * 0.42)}px ${tok('--ui')}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const live = new Set(this.cells.map(([x, y]) => key(x, y)));
      for (const [k, n] of this.counts) {
        const [x, y] = k.split(',').map(Number);
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const [px, py] = at(x, y);
        const alive = live.has(k);
        // Numbers that decide something (a birth or a survival) are bold ink; the rest are faint.
        const matters = n === 3 || (alive && n === 2);
        ctx.fillStyle = alive ? tok('--on-slate') : matters ? tok('--ink') : alpha('--ink', 0.45);
        ctx.fillText(String(n), px + s / 2, py + s / 2 + 1);
      }
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
}
