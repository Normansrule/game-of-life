import type { Cell } from '../engine/life';
import { bounds } from '../engine/life';
import { alpha, tok } from './theme';

/** Cells at least this many CSS px wide are drawn as round stones; smaller ones as flat squares. */
export const STONE_MIN = 6;

/** A colour argument may be a CSS colour or a token name like '--slate'. */
export function colour(c: string | undefined, fallback = '--slate'): string {
  const v = c ?? fallback;
  return v.startsWith('--') ? tok(v) : v;
}

/**
 * Collects live cells and fills them in a single path: stones (radius 0.46
 * of a cell, with a faint offset shadow) when cells are big enough, flat
 * squares otherwise. The path is traced on the context itself, so the same
 * painter draws on a canvas or into an SVG export (Svg2D).
 */
export class CellPainter {
  readonly stones: boolean;
  private pts: number[] = [];
  private r: number;
  private sq: number;
  constructor(private s: number) {
    this.stones = s >= STONE_MIN;
    this.r = s * 0.46;
    this.sq = Math.max(1, s - (s > 4 ? 1 : 0));
  }
  /** Add a cell whose top-left corner is at (x, y) in px. */
  add(x: number, y: number): void {
    this.pts.push(x, y);
  }
  private trace(ctx: CanvasRenderingContext2D, dx: number, dy: number): void {
    ctx.beginPath();
    const { s, r, pts } = this;
    for (let i = 0; i < pts.length; i += 2) {
      if (this.stones) {
        const cx = pts[i] + s / 2 + dx, cy = pts[i + 1] + s / 2 + dy;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      } else ctx.rect(pts[i], pts[i + 1], this.sq, this.sq);
    }
  }
  fill(ctx: CanvasRenderingContext2D, color?: string, shadow = true): void {
    if (!this.pts.length) return;
    if (this.stones && shadow) {
      ctx.fillStyle = alpha('--slate', 0.25);
      this.trace(ctx, this.s * 0.05, this.s * 0.08);
      ctx.fill();
    }
    ctx.fillStyle = colour(color);
    this.trace(ctx, 0, 0);
    ctx.fill();
  }
}

/**
 * Faint ink lines through cell centres, as on a Go board, fading in as cells
 * grow past STONE_MIN px. `ox`, `oy` are the screen position of cell (0, 0).
 */
export function drawBoardLines(ctx: CanvasRenderingContext2D, W: number, H: number, s: number, ox: number, oy: number): void {
  if (s < STONE_MIN) return;
  ctx.strokeStyle = alpha('--board-line', Math.min(0.45, ((s - STONE_MIN) / 6) * 0.45));
  ctx.lineWidth = 1;
  ctx.beginPath();
  const fx = ((ox % s) + s) % s + s / 2, fy = ((oy % s) + s) % s + s / 2;
  for (let x = fx - s; x <= W; x += s) { const sx = Math.round(x) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H); }
  for (let y = fy - s; y <= H; y += s) { const sy = Math.round(y) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy); }
  ctx.stroke();
}

/**
 * Draw a pattern scaled to fit a small canvas. `color` and `bg` accept CSS
 * colours or token names; by default the stones are slate on a transparent
 * background.
 */
export function drawThumb(canvas: HTMLCanvasElement, cells: Cell[], color: string = '--slate', bg = 'transparent', pad = 2): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  paintThumb(ctx, cells, 0, 0, W, H, color, bg, pad);
}

/** Draw a pattern scaled to fit the box at (x, y), W × H px, on any 2D context. */
export function paintThumb(ctx: CanvasRenderingContext2D, cells: Cell[], x: number, y: number, W: number, H: number, color: string = '--slate', bg = 'transparent', pad = 2, shadow = bg !== 'transparent'): void {
  if (bg !== 'transparent') {
    ctx.fillStyle = colour(bg);
    ctx.fillRect(x, y, W, H);
  }
  const b = bounds(cells);
  if (!b) return;
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const s = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch, 14);
  const ox = x + (W - cw * s) / 2;
  const oy = y + (H - ch * s) / 2;
  const p = new CellPainter(s);
  for (const [cx, cy] of cells) p.add(ox + (cx - b.x0) * s, oy + (cy - b.y0) * s);
  p.fill(ctx, color, shadow);
}

/**
 * Star points (hoshi) on a small finite board of w × h points whose cell (0, 0)
 * has its top-left corner at (ox, oy): on the third line in from each edge,
 * plus the centre when the board has one, as on a 9×9 or 13×13 Go board.
 */
export function drawStarPoints(ctx: CanvasRenderingContext2D, w: number, h: number, s: number, ox: number, oy: number): void {
  if (s < STONE_MIN || w < 7 || h < 7) return;
  const line = (n: number) => (n >= 13 ? 3 : 2);
  const xs = [line(w), w - 1 - line(w)], ys = [line(h), h - 1 - line(h)];
  const pts: [number, number][] = [];
  for (const x of xs) for (const y of ys) pts.push([x, y]);
  if (w % 2 && h % 2) pts.push([(w - 1) / 2, (h - 1) / 2]);
  ctx.fillStyle = alpha('--board-line', 0.75);
  ctx.beginPath();
  const r = Math.max(1.5, s * 0.09);
  for (const [x, y] of pts) {
    ctx.moveTo(ox + (x + 0.5) * s + r, oy + (y + 0.5) * s);
    ctx.arc(ox + (x + 0.5) * s, oy + (y + 0.5) * s, r, 0, Math.PI * 2);
  }
  ctx.fill();
}
