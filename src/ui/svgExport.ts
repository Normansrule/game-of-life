/**
 * Export the trees as SVG files.
 *
 * Every tree in the app is drawn on a canvas. Rather than write each one
 * twice, Svg2D stands in for a canvas's 2D context: it has the same drawing
 * calls (paths, arcs, text, transforms, dashes, alpha), and instead of
 * painting pixels it writes SVG elements. A view draws its tree once into
 * Svg2D, using the code it already uses for the screen, and the result is a
 * vector file that stays sharp at any size and opens in any drawing program.
 *
 * Only the parts of the canvas API the trees use are here. Transforms are
 * assumed to be rotations, translations and uniform scales, which is all the
 * views ever set, so a circle stays a circle.
 */

type Matrix = [number, number, number, number, number, number];

interface State {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  dash: number[];
  m: Matrix;
}

const n = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Escape text for use inside an XML attribute or element. */
export function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const ANCHOR: Record<string, string> = { left: 'start', start: 'start', center: 'middle', right: 'end', end: 'end' };
const BASELINE: Record<string, string> = { top: 'hanging', hanging: 'hanging', middle: 'central', alphabetic: 'auto', ideographic: 'ideographic', bottom: 'text-after-edge' };

let measuring: CanvasRenderingContext2D | null | undefined;
const measurer = () => (measuring === undefined ? (measuring = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')) : measuring);

export class Svg2D {
  fillStyle = '#000';
  strokeStyle = '#000';
  lineWidth = 1;
  globalAlpha = 1;
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'start';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  private dash: number[] = [];
  private m: Matrix = [1, 0, 0, 1, 0, 0];
  private stack: State[] = [];
  private d: string[] = [];
  /** Where the path's pen is, in output coordinates, or null before the first point. */
  private pen: [number, number] | null = null;
  private start: [number, number] | null = null;
  private out: string[] = [];
  /**
   * While a path holds nothing but whole circles of one size (a field of
   * dots, a cell's stones), they are kept here too, so fill() can write each
   * as a round-capped dot ("M x yh0") a quarter of the length of two arcs.
   */
  private dots: number[] | null = [];
  private dotR = -1;

  constructor(readonly width: number, readonly height: number) {}

  // ---------- state ----------
  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, lineCap: this.lineCap, lineJoin: this.lineJoin,
      dash: this.dash.slice(), m: [...this.m],
    });
  }
  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    ({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha,
      font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, lineCap: this.lineCap, lineJoin: this.lineJoin,
      dash: this.dash, m: this.m } = s);
  }
  setLineDash(segments: number[]): void { this.dash = segments.slice(); }
  getLineDash(): number[] { return this.dash.slice(); }

  // ---------- transforms ----------
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.m = [a, b, c, d, e, f]; }
  resetTransform(): void { this.m = [1, 0, 0, 1, 0, 0]; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number): void { this.transform(x, 0, 0, y, 0, 0); }
  rotate(a: number): void { const c = Math.cos(a), s = Math.sin(a); this.transform(c, s, -s, c, 0, 0); }

  private pt(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  /** How much the current transform scales lengths. */
  private get k(): number { return Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2])); }

  // ---------- paths ----------
  beginPath(): void { this.d = []; this.pen = this.start = null; this.dots = []; this.dotR = -1; }
  closePath(): void {
    if (!this.pen) return;
    this.dots = null;
    this.d.push('Z');
    this.pen = this.start;
  }
  moveTo(x: number, y: number): void {
    const p = this.pt(x, y);
    this.d.push(`M${n(p[0])} ${n(p[1])}`);
    this.pen = this.start = p;
  }
  lineTo(x: number, y: number): void {
    if (!this.pen) { this.moveTo(x, y); return; }
    const p = this.pt(x, y);
    if (p[0] !== this.pen[0] || p[1] !== this.pen[1]) this.dots = null;
    this.d.push(`L${n(p[0])} ${n(p[1])}`);
    this.pen = p;
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    if (!this.pen) this.moveTo(x1, y1);
    this.dots = null;
    const a = this.pt(x1, y1), b = this.pt(x2, y2), p = this.pt(x, y);
    this.d.push(`C${n(a[0])} ${n(a[1])} ${n(b[0])} ${n(b[1])} ${n(p[0])} ${n(p[1])}`);
    this.pen = p;
  }
  quadraticCurveTo(x1: number, y1: number, x: number, y: number): void {
    if (!this.pen) this.moveTo(x1, y1);
    this.dots = null;
    const a = this.pt(x1, y1), p = this.pt(x, y);
    this.d.push(`Q${n(a[0])} ${n(a[1])} ${n(p[0])} ${n(p[1])}`);
    this.pen = p;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
    this.dots = null;
  }
  /**
   * Same rules as the canvas: a line joins the pen to the arc's start, and a
   * full turn or more draws a whole circle (as two half arcs, since one SVG
   * arc can't start and end at the same point).
   */
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    const turn = Math.PI * 2;
    // The canvas rule: a difference of a full turn or more is a whole circle, anything else wraps into one turn.
    const span = (d: number) => (d >= turn ? turn : ((d % turn) + turn) % turn);
    const sweep = ccw ? -span(a0 - a1) : span(a1 - a0);
    const at = (a: number): [number, number] => [x + r * Math.cos(a), y + r * Math.sin(a)];
    const s = at(a0);
    if (this.pen) this.lineTo(s[0], s[1]); else this.moveTo(s[0], s[1]);
    if (r <= 0 || sweep === 0) return;
    const R = n(r * this.k);
    if (this.dots && Math.abs(sweep) === turn && (this.dotR < 0 || this.dotR === r * this.k)) {
      this.dotR = r * this.k;
      this.dots.push(...this.pt(x, y));
    } else this.dots = null;
    // Flipping a transform (negative determinant) reverses the turning direction.
    const flip = this.m[0] * this.m[3] - this.m[1] * this.m[2] < 0;
    const sweepFlag = (sweep > 0) !== flip ? 1 : 0;
    const halves = Math.abs(sweep) >= turn - 1e-9 ? [sweep / 2, sweep / 2] : [sweep];
    let a = a0;
    for (const part of halves) {
      a += part;
      const e = at(a), p = this.pt(e[0], e[1]);
      this.d.push(`A${R} ${R} 0 ${Math.abs(part) > Math.PI ? 1 : 0} ${sweepFlag} ${n(p[0])} ${n(p[1])}`);
      this.pen = p;
    }
  }

  // ---------- painting ----------
  private alphaAttr(): string { return this.globalAlpha < 1 ? ` opacity="${n(this.globalAlpha)}"` : ''; }
  private strokeAttrs(): string {
    const k = this.k;
    let s = ` fill="none" stroke="${xml(this.strokeStyle)}" stroke-width="${n(this.lineWidth * k)}"`;
    if (this.lineCap !== 'butt') s += ` stroke-linecap="${this.lineCap}"`;
    if (this.lineJoin !== 'miter') s += ` stroke-linejoin="${this.lineJoin}"`;
    if (this.dash.length) s += ` stroke-dasharray="${this.dash.map((v) => n(v * k)).join(' ')}"`;
    return s + this.alphaAttr();
  }
  fill(): void {
    if (!this.d.length) return;
    if (this.dots && this.dots.length) {
      const pts = this.dots, parts: string[] = [];
      for (let i = 0; i < pts.length; i += 2) parts.push(`M${n(pts[i])} ${n(pts[i + 1])}h0`);
      this.out.push(`<path d="${parts.join('')}" fill="none" stroke="${xml(this.fillStyle)}" stroke-width="${n(this.dotR * 2)}" stroke-linecap="round"${this.alphaAttr()}/>`);
      return;
    }
    this.out.push(`<path d="${this.d.join('')}" fill="${xml(this.fillStyle)}"${this.alphaAttr()}/>`);
  }
  stroke(): void {
    if (!this.d.length) return;
    this.out.push(`<path d="${this.d.join('')}"${this.strokeAttrs()}/>`);
  }
  private box(x: number, y: number, w: number, h: number): string {
    const [, b, c] = this.m;
    if (b === 0 && c === 0) {
      const p = this.pt(x, y), q = this.pt(x + w, y + h);
      return `<rect x="${n(Math.min(p[0], q[0]))}" y="${n(Math.min(p[1], q[1]))}" width="${n(Math.abs(q[0] - p[0]))}" height="${n(Math.abs(q[1] - p[1]))}"`;
    }
    const pts = [this.pt(x, y), this.pt(x + w, y), this.pt(x + w, y + h), this.pt(x, y + h)];
    return `<path d="M${pts.map((p) => `${n(p[0])} ${n(p[1])}`).join('L')}Z"`;
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.out.push(`${this.box(x, y, w, h)} fill="${xml(this.fillStyle)}"${this.alphaAttr()}/>`);
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    this.out.push(`${this.box(x, y, w, h)}${this.strokeAttrs()}/>`);
  }
  /** Clearing the whole drawing starts it again; clearing part of it is ignored, as SVG has no eraser. */
  clearRect(x: number, y: number, w: number, h: number): void {
    const p = this.pt(x, y), q = this.pt(x + w, y + h);
    if (Math.min(p[0], q[0]) <= 0 && Math.min(p[1], q[1]) <= 0 && Math.max(p[0], q[0]) >= this.width && Math.max(p[1], q[1]) >= this.height) this.out = [];
  }
  fillText(text: string, x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m;
    const plain = a === 1 && b === 0 && c === 0 && d === 1;
    const pos = plain ? `x="${n(x + e)}" y="${n(y + f)}"` : `x="${n(x)}" y="${n(y)}" transform="matrix(${[a, b, c, d, e, f].map(n).join(' ')})"`;
    const anchor = ANCHOR[this.textAlign] ?? 'start';
    const base = BASELINE[this.textBaseline] ?? 'auto';
    this.out.push(`<text ${pos} fill="${xml(this.fillStyle)}" style="font:${xml(this.font)}"${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}${base !== 'auto' ? ` dominant-baseline="${base}"` : ''}${this.alphaAttr()}>${xml(text)}</text>`);
  }
  /** Text width from a real canvas when there is one, otherwise a rough guess of about half the font size per character. */
  measureText(text: string): { width: number } {
    const m = measurer();
    if (m) { m.font = this.font; return { width: m.measureText(text).width }; }
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: text.length * size * 0.55 };
  }

  /** Add raw SVG markup, already in output coordinates. */
  raw(markup: string): void { this.out.push(markup); }

  /** The finished SVG document. `background` fills the whole picture first, so the file reads on its own. */
  toString(opts: { background?: string; title?: string } = {}): string {
    const W = n(this.width), H = n(this.height);
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
      opts.title ? `<title>${xml(opts.title)}</title>` : '',
      opts.background ? `<rect width="100%" height="100%" fill="${xml(opts.background)}"/>` : '',
      ...this.out,
      '</svg>',
      '',
    ].filter(Boolean).join('\n');
  }
}

/**
 * Treat an Svg2D as a canvas context. The views' drawing code is typed for
 * the real thing, and Svg2D has every call they make.
 */
export const asCanvas = (s: Svg2D) => s as unknown as CanvasRenderingContext2D;

/** A file name from a title: "Basin of 1,024 states" becomes "life-tree-basin-of-1024-states.svg". */
export function svgFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[,']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return `life-tree-${slug || 'tree'}.svg`;
}

/** Save an SVG document as a file. */
export function downloadSvg(svg: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * A row of coloured keys, like the legends under the trees on screen, drawn
 * into an exported file so it explains itself. Returns the height used.
 */
export function drawLegend(ctx: Svg2D, items: { label: string; color: string }[], x: number, y: number, font: string, ink: string): number {
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = x;
  for (const it of items) {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(cx + 5, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(it.label, cx + 15, y);
    cx += 15 + ctx.measureText(it.label).width + 18;
  }
  ctx.textBaseline = 'alphabetic';
  return 20;
}
