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
 * Collects live cells into one path and fills them in a single call: stones
 * (radius 0.46 of a cell, with a faint offset shadow) when cells are big
 * enough, flat squares otherwise.
 */
export class CellPainter {
  readonly stones: boolean;
  private body = new Path2D();
  private shade = new Path2D();
  private r: number;
  private sq: number;
  constructor(private s: number) {
    this.stones = s >= STONE_MIN;
    this.r = s * 0.46;
    this.sq = Math.max(1, s - (s > 4 ? 1 : 0));
  }
  /** Add a cell whose top-left corner is at (x, y) in px. */
  add(x: number, y: number): void {
    if (this.stones) {
      const cx = x + this.s / 2, cy = y + this.s / 2, r = this.r;
      this.body.moveTo(cx + r, cy);
      this.body.arc(cx, cy, r, 0, Math.PI * 2);
      const dx = this.s * 0.05, dy = this.s * 0.08;
      this.shade.moveTo(cx + dx + r, cy + dy);
      this.shade.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    } else this.body.rect(x, y, this.sq, this.sq);
  }
  fill(ctx: CanvasRenderingContext2D, color?: string, shadow = true): void {
    if (this.stones && shadow) {
      ctx.fillStyle = alpha('--slate', 0.25);
      ctx.fill(this.shade);
    }
    ctx.fillStyle = colour(color);
    ctx.fill(this.body);
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
  if (bg !== 'transparent') {
    ctx.fillStyle = colour(bg);
    ctx.fillRect(0, 0, W, H);
  }
  const b = bounds(cells);
  if (!b) return;
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const s = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch, 14);
  const ox = (W - cw * s) / 2;
  const oy = (H - ch * s) / 2;
  const p = new CellPainter(s);
  for (const [x, y] of cells) p.add(ox + (x - b.x0) * s, oy + (y - b.y0) * s);
  p.fill(ctx, color, bg !== 'transparent');
}
