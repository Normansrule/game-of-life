import type { Life } from '../engine/life';
import { type Palette, ageT, paletteTexture, sampleRamp } from './palettes';

export interface View {
  /** World coordinate (in cells) at the centre of the screen. */
  cx: number;
  cy: number;
  /** Screen pixels (CSS) per cell. */
  zoom: number;
}

export interface DrawOptions {
  grid: boolean;
  trails: boolean;
  glow: boolean;
  wrap: boolean;
}

export interface GridRenderer {
  readonly kind: 'webgl2' | 'canvas2d';
  draw(life: Life, view: View, opts: DrawOptions): void;
  setPalette(p: Palette): void;
}

export function createRenderer(canvas: HTMLCanvasElement, palette: Palette): GridRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (gl) {
    try {
      return new WebGLGridRenderer(canvas, gl, palette);
    } catch (e) {
      console.warn('WebGL2 renderer failed, falling back to canvas 2D', e);
    }
  }
  return new Canvas2DGridRenderer(canvas, palette);
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// One full-screen triangle; every pixel works out which cell it is in.
const FRAG = `#version 300 es
precision highp float;
uniform highp usampler2D uState;   // R = age (0 dead, 1..255), G = trail (0..255)
uniform sampler2D uPalette;        // 256x2: alive ramp, trail ramp
uniform vec2 uRes;                 // device pixels
uniform vec2 uCenter;              // world cell at screen centre
uniform float uZoom;               // device px per cell
uniform vec2 uGrid;                // world size in cells
uniform vec3 uBg;
uniform float uShowGrid, uTrails, uGlow, uWrap, uLight;
out vec4 outColor;

vec2 fetchCell(vec2 c) {
  if (uWrap < 0.5 && (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y)) return vec2(0.0);
  ivec2 ic = ivec2(mod(c, uGrid));
  uvec2 v = texelFetch(uState, ic, 0).rg;
  return vec2(v) / 255.0;
}

vec3 aliveColor(float age255) {
  float t = log(max(age255, 1.0)) / log(255.0);
  return texture(uPalette, vec2(t, 0.25)).rgb;
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 world = (px - 0.5 * uRes) / uZoom + uCenter;
  vec2 cell = floor(world);
  vec2 f = world - cell;

  // Background with a soft vignette.
  vec2 uv = px / uRes - 0.5;
  float vig = 1.0 - dot(uv, uv) * (uLight > 0.5 ? 0.15 : 0.9);
  vec3 col = uBg * vig;

  bool inside = cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uGrid.x && cell.y < uGrid.y;
  if (!inside) {
    if (uWrap < 0.5) { outColor = vec4(col * (uLight > 0.5 ? 0.92 : 0.55), 1.0); return; }
  }

  vec2 s = fetchCell(cell);
  float age = s.x * 255.0;

  if (uTrails > 0.5 && age < 0.5 && s.y > 0.0) {
    vec3 tc = texture(uPalette, vec2(s.y, 0.75)).rgb;
    col = mix(col, tc, s.y * 0.85);
  }

  // Halo from neighbouring live cells (cheap bloom).
  if (uGlow > 0.5) {
    vec3 halo = vec3(0.0);
    for (int dy = -1; dy <= 1; dy++)
      for (int dx = -1; dx <= 1; dx++) {
        vec2 nc = cell + vec2(dx, dy);
        vec2 ns = fetchCell(nc);
        if (ns.x > 0.0) {
          vec2 d = world - (nc + 0.5);
          float w = exp(-dot(d, d) * 2.2);
          halo += aliveColor(ns.x * 255.0) * w;
        }
      }
    col += halo * (uLight > 0.5 ? 0.0 : 0.22);
  }

  if (age > 0.5) {
    vec3 c = aliveColor(age);
    if (uZoom >= 5.0) {
      // Rounded square with an anti-aliased edge.
      float r = 0.18;
      vec2 q = abs(f - 0.5) - (0.5 - r - 0.06);
      float d = length(max(q, 0.0)) - r;
      float aa = 1.5 / uZoom;
      float m = 1.0 - smoothstep(-aa, aa, d);
      vec3 shaded = c * (1.08 - 0.25 * f.y);
      col = mix(col, shaded, m);
    } else {
      col = c;
    }
  }

  if (uShowGrid > 0.5 && uZoom >= 8.0) {
    vec2 g = min(f, 1.0 - f) * uZoom;
    float line = 1.0 - smoothstep(0.0, 1.0, min(g.x, g.y));
    col = mix(col, uLight > 0.5 ? vec3(0.0) : vec3(1.0), line * 0.06);
  }

  if (!inside) col *= uLight > 0.5 ? 0.9 : 0.6; // wrapped copies are dimmed
  outColor = vec4(col, 1.0);
}`;

class WebGLGridRenderer implements GridRenderer {
  readonly kind = 'webgl2' as const;
  private prog: WebGLProgram;
  private stateTex: WebGLTexture;
  private palTex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private texW = 0;
  private texH = 0;
  private buf = new Uint8Array(0);
  private palette!: Palette;

  constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
    palette: Palette,
  ) {
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);
    for (const n of ['uState', 'uPalette', 'uRes', 'uCenter', 'uZoom', 'uGrid', 'uBg', 'uShowGrid', 'uTrails', 'uGlow', 'uWrap', 'uLight'])
      this.u[n] = gl.getUniformLocation(this.prog, n);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.stateTex = gl.createTexture()!;
    this.palTex = gl.createTexture()!;
    this.setPalette(palette);
  }

  setPalette(p: Palette): void {
    const gl = this.gl;
    this.palette = p;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteTexture(p));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(life: Life, view: View, opts: DrawOptions): void {
    const { gl, canvas } = this;
    const n = life.w * life.h;
    if (this.buf.length !== n * 2) this.buf = new Uint8Array(n * 2);
    const buf = this.buf;
    const { age, trail } = life;
    for (let i = 0; i < n; i++) {
      buf[2 * i] = age[i];
      buf[2 * i + 1] = trail[i];
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.stateTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.texW !== life.w || this.texH !== life.h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8UI, life.w, life.h, 0, gl.RG_INTEGER, gl.UNSIGNED_BYTE, buf);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      this.texW = life.w;
      this.texH = life.h;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, life.w, life.h, gl.RG_INTEGER, gl.UNSIGNED_BYTE, buf);
    }
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(this.prog);
    gl.uniform1i(this.u.uState, 0);
    gl.uniform1i(this.u.uPalette, 1);
    gl.uniform2f(this.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(this.u.uCenter, view.cx, view.cy);
    gl.uniform1f(this.u.uZoom, view.zoom * dpr);
    gl.uniform2f(this.u.uGrid, life.w, life.h);
    const bg = this.palette.background;
    gl.uniform3f(this.u.uBg, bg[0] / 255, bg[1] / 255, bg[2] / 255);
    gl.uniform1f(this.u.uShowGrid, opts.grid ? 1 : 0);
    gl.uniform1f(this.u.uTrails, opts.trails ? 1 : 0);
    gl.uniform1f(this.u.uGlow, opts.glow && view.zoom >= 2 ? 1 : 0);
    gl.uniform1f(this.u.uWrap, opts.wrap ? 1 : 0);
    gl.uniform1f(this.u.uLight, bg[0] + bg[1] + bg[2] > 384 ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader error');
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  return p;
}

/** Fallback for browsers without WebGL2: draws one pixel per cell, then scales. */
class Canvas2DGridRenderer implements GridRenderer {
  readonly kind = 'canvas2d' as const;
  private ctx: CanvasRenderingContext2D;
  private off = document.createElement('canvas');
  private palette: Palette;
  private lut = new Uint8Array(256 * 3);
  private tlut = new Uint8Array(256 * 3);

  constructor(
    private canvas: HTMLCanvasElement,
    palette: Palette,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.palette = palette;
    this.setPalette(palette);
  }

  setPalette(p: Palette): void {
    this.palette = p;
    for (let i = 0; i < 256; i++) {
      this.lut.set(sampleRamp(p.alive, ageT(Math.max(1, i))).map(Math.round), i * 3);
      const t = sampleRamp(p.trail, i / 255);
      const bg = p.background;
      const a = (i / 255) * 0.85;
      this.tlut.set([0, 1, 2].map((k) => Math.round(bg[k] + (t[k] - bg[k]) * a)), i * 3);
    }
  }

  draw(life: Life, view: View, opts: DrawOptions): void {
    const { canvas, ctx, off } = this;
    if (off.width !== life.w || off.height !== life.h) {
      off.width = life.w;
      off.height = life.h;
    }
    const octx = off.getContext('2d')!;
    const img = octx.createImageData(life.w, life.h);
    const d = img.data;
    const bg = this.palette.background;
    for (let i = 0; i < life.cells.length; i++) {
      const a = life.age[i];
      const o = i * 4;
      if (a) {
        d[o] = this.lut[a * 3]; d[o + 1] = this.lut[a * 3 + 1]; d[o + 2] = this.lut[a * 3 + 2];
      } else if (opts.trails && life.trail[i]) {
        const t = life.trail[i] * 3;
        d[o] = this.tlut[t]; d[o + 1] = this.tlut[t + 1]; d[o + 2] = this.tlut[t + 2];
      } else {
        d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2];
      }
      d[o + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${bg[0] * 0.6},${bg[1] * 0.6},${bg[2] * 0.6})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const z = view.zoom * dpr;
    const ox = canvas.width / 2 - view.cx * z;
    const oy = canvas.height / 2 - view.cy * z;
    const reps = opts.wrap ? [-1, 0, 1] : [0];
    for (const ry of reps)
      for (const rx of reps) ctx.drawImage(off, ox + rx * life.w * z, oy + ry * life.h * z, life.w * z, life.h * z);
    if (opts.grid && view.zoom >= 8) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath();
      for (let x = Math.ceil(-ox / z); x * z + ox < canvas.width; x++) {
        ctx.moveTo(x * z + ox, 0);
        ctx.lineTo(x * z + ox, canvas.height);
      }
      for (let y = Math.ceil(-oy / z); y * z + oy < canvas.height; y++) {
        ctx.moveTo(0, y * z + oy);
        ctx.lineTo(canvas.width, y * z + oy);
      }
      ctx.stroke();
    }
  }
}
