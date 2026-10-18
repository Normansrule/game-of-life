import type { Cell } from '../engine/life';
import { bounds } from '../engine/life';

/** Draw a pattern scaled to fit a small canvas. */
export function drawThumb(canvas: HTMLCanvasElement, cells: Cell[], color: string, bg = 'transparent', pad = 2): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || canvas.width;
  const H = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }
  const b = bounds(cells);
  if (!b) return;
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const s = Math.min((W - pad * 2) / cw, (H - pad * 2) / ch, 14);
  const ox = (W - cw * s) / 2;
  const oy = (H - ch * s) / 2;
  ctx.fillStyle = color;
  const gap = s > 4 ? 1 : 0;
  for (const [x, y] of cells) ctx.fillRect(ox + (x - b.x0) * s, oy + (y - b.y0) * s, Math.max(1, s - gap), Math.max(1, s - gap));
}
