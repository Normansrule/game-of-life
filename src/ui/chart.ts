import { fitCanvas } from './dom';
import { alpha, parseColor, tok } from './theme';

export interface Series {
  values: ArrayLike<number>;
  /** A CSS colour or a token name such as '--data-pine'. Defaults to --ink. */
  color?: string;
  label?: string;
  width?: number;
  fill?: boolean;
  /** Optional x values; defaults to the index. */
  xs?: ArrayLike<number>;
  dots?: boolean;
  dash?: number[];
}

export interface ChartOptions {
  xLabel?: string;
  yLabel?: string;
  yMin?: number;
  yMax?: number;
  xMin?: number;
  xMax?: number;
  logY?: boolean;
  legend?: boolean;
  padding?: number;
  marker?: number; // x position of a vertical marker
  grid?: boolean;
}

/** A small, dependency-free line chart with axes, ticks and a legend. */
export function drawChart(canvas: HTMLCanvasElement, series: Series[], o: ChartOptions = {}): void {
  fitCanvas(canvas);
  const ctx = canvas.getContext('2d')!;
  const dpr = canvas.width / Math.max(1, canvas.clientWidth);
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const textColor = tok('--muted');
  const gridColor = tok('--rule');
  const padL = o.yLabel ? 58 : 40;
  const padB = o.xLabel ? 30 : 20;
  const padT = o.legend ? 22 : 8;
  const padR = 10;
  const pw = W - padL - padR;
  const ph = H - padT - padB;
  if (pw <= 10 || ph <= 10) return;

  let xMin = o.xMin ?? Infinity, xMax = o.xMax ?? -Infinity;
  let yMin = o.yMin ?? Infinity, yMax = o.yMax ?? -Infinity;
  for (const s of series) {
    for (let i = 0; i < s.values.length; i++) {
      const x = s.xs ? s.xs[i] : i;
      const y = s.values[i];
      if (!Number.isFinite(y)) continue;
      if (o.xMin === undefined) xMin = Math.min(xMin, x);
      if (o.xMax === undefined) xMax = Math.max(xMax, x);
      if (o.yMin === undefined) yMin = Math.min(yMin, y);
      if (o.yMax === undefined) yMax = Math.max(yMax, y);
    }
  }
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; }
  if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }
  if (xMax === xMin) xMax = xMin + 1;
  if (o.logY) {
    yMin = Math.max(yMin, 1e-3);
    if (yMax <= yMin) yMax = yMin * 10;
  } else {
    if (o.yMin === undefined && yMin > 0 && yMin < yMax * 0.5) yMin = 0;
    if (yMax === yMin) yMax = yMin + 1;
    if (o.yMax === undefined) yMax += (yMax - yMin) * 0.06;
  }
  const ty = (y: number) =>
    o.logY
      ? padT + ph - ((Math.log10(Math.max(y, yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * ph
      : padT + ph - ((y - yMin) / (yMax - yMin)) * ph;
  const tx = (x: number) => padL + ((x - xMin) / (xMax - xMin)) * pw;

  ctx.font = `11px ${tok('--ui')}`;
  ctx.fillStyle = textColor;
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  // Y ticks
  const yt = o.logY ? logTicks(yMin, yMax) : niceTicks(yMin, yMax, Math.max(2, Math.floor(ph / 32)));
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of yt) {
    const y = ty(v);
    if (o.grid !== false) {
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }
    ctx.fillText(short(v), padL - 5, y);
  }
  // X ticks
  const xt = niceTicks(xMin, xMax, Math.max(2, Math.floor(pw / 70)));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of xt) ctx.fillText(short(v), tx(v), padT + ph + 4);
  if (o.xLabel) ctx.fillText(o.xLabel, padL + pw / 2, H - 13);
  if (o.yLabel) {
    ctx.save();
    ctx.translate(10, padT + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(o.yLabel, 0, 0);
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, pw, ph);
  ctx.clip();
  for (const s of series) {
    const col = seriesColor(s);
    ctx.strokeStyle = col;
    ctx.lineWidth = s.width ?? 1.6;
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    if (s.width === 0) ctx.strokeStyle = 'transparent';
    let started = false;
    for (let i = 0; i < s.values.length; i++) {
      const v = s.values[i];
      if (!Number.isFinite(v)) { started = false; continue; }
      const x = tx(s.xs ? s.xs[i] : i);
      const y = ty(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (s.fill && s.values.length) {
      ctx.lineTo(tx(s.xs ? s.xs[s.values.length - 1] : s.values.length - 1), padT + ph);
      ctx.lineTo(tx(s.xs ? s.xs[0] : 0), padT + ph);
      ctx.closePath();
      ctx.fillStyle = withAlpha(col, 0.12);
      ctx.fill();
    }
    if (s.dots) {
      ctx.fillStyle = col;
      for (let i = 0; i < s.values.length; i++) {
        ctx.beginPath();
        ctx.arc(tx(s.xs ? s.xs[i] : i), ty(s.values[i]), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.setLineDash([]);
  if (o.marker !== undefined) {
    ctx.strokeStyle = tok('--ink');
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(tx(o.marker), padT);
    ctx.lineTo(tx(o.marker), padT + ph);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (o.legend) {
    let x = padL;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const s of series) {
      if (!s.label) continue;
      ctx.fillStyle = seriesColor(s);
      ctx.fillRect(x, 8, 10, 3);
      ctx.fillStyle = textColor;
      ctx.fillText(s.label, x + 14, 10);
      x += ctx.measureText(s.label).width + 30;
    }
  }
}

export function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

function logTicks(min: number, max: number): number[] {
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  return out;
}

function short(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  if (a >= 100 || v === Math.round(v)) return String(Math.round(v));
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  return v.toPrecision(2);
}

function seriesColor(s: Series): string {
  const c = s.color ?? '--ink';
  return c.startsWith('--') ? tok(c) : c;
}

/** A colour (hex, rgb(), or a token name like '--ink') at the given alpha. */
export function withAlpha(color: string, a: number): string {
  if (color.startsWith('--')) return alpha(color, a);
  if (color.startsWith('#') || color.startsWith('rgb')) {
    const [r, g, b] = parseColor(color);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}
