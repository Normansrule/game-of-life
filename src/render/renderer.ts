import type { Life } from '../engine/life';
import { type BoardTheme, type Palette, type RGB, ageTexture, stoneColor } from './palettes';

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
  wrap: boolean;
  /** Seconds since the last generation step; drives the stone drop and lift. Pass 1 to show the settled board. */
  sinceStep: number;
}

export interface GridRenderer {
  readonly kind: 'webgl2' | 'canvas2d';
  draw(life: Life, view: View, opts: DrawOptions): void;
  setPalette(p: Palette): void;
  setTheme(t: BoardTheme): void;
}

export function createRenderer(canvas: HTMLCanvasElement, palette: Palette, theme: BoardTheme): GridRenderer {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (gl) {
    try {
      return new WebGLGridRenderer(canvas, gl, palette, theme);
    } catch (e) {
      console.warn('WebGL2 renderer failed, falling back to canvas 2D', e);
    }
  }
  return new Canvas2DGridRenderer(canvas, palette, theme);
}

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

// One full-screen triangle; every pixel works out which cell it is in.
// Cells sit on the intersections of a Go board: lines run through cell centres
// and live cells are drawn as stones once there are enough pixels per cell.
const FRAG = `#version 300 es
precision highp float;
uniform highp usampler2D uState;   // R = age (0 dead, 1..255), G = trail (0..255)
uniform sampler2D uAgeRamp;        // 256x1 clamshell -> slate
uniform vec2 uRes;                 // device pixels
uniform vec2 uCenter;              // world cell at screen centre
uniform float uZoom;               // device px per cell
uniform vec2 uGrid;                // world size in cells
uniform vec3 uBoard, uEdge, uLine, uSlate, uShell;
uniform float uShowGrid, uTrails, uWrap, uMode, uGenPar, uT;
out vec4 outColor;

vec2 fetchCell(vec2 c) {
  if (uWrap < 0.5 && (c.x < 0.0 || c.y < 0.0 || c.x >= uGrid.x || c.y >= uGrid.y)) return vec2(0.0);
  ivec2 ic = ivec2(mod(c, uGrid));
  uvec2 v = texelFetch(uState, ic, 0).rg;
  return vec2(v);
}

vec3 stoneColor(float age) {
  if (uMode > 1.5 || age >= 254.5) return uSlate;
  if (uMode > 0.5) return texture(uAgeRamp, vec2(log(max(age, 1.0)) / log(255.0), 0.5)).rgb;
  float par = mod(uGenPar - age + 1.0 + 512.0, 2.0);
  return par < 0.5 ? uSlate : uShell;
}

// A shaded stone of radius r at offset p from its centre (in cells). Returns colour and coverage.
vec4 stone(vec2 p, float r, vec3 c, bool white) {
  float d = length(p) / r;
  float aa = 1.4 / (r * uZoom);
  float m = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  vec2 q = p / r - vec2(-0.34, -0.4);
  float hl = exp(-dot(q, q) * 3.2);
  vec3 s = white
    ? c * (1.0 - 0.17 * smoothstep(0.35, 1.0, d)) + vec3(0.05) * hl
    : c * (1.0 - 0.3 * smoothstep(0.55, 1.0, d)) + vec3(0.26) * hl;
  return vec4(s, m);
}

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 world = (px - 0.5 * uRes) / uZoom + uCenter;
  vec2 cell = floor(world);
  vec2 f = world - cell;

  bool inside = cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uGrid.x && cell.y < uGrid.y;
  if (!inside && uWrap < 0.5) { outColor = vec4(uEdge, 1.0); return; }

  // Straight grain running down the board, in world units so it moves with the board.
  vec3 col = uBoard;
  if (uZoom >= 3.0) {
    float g = sin((world.x + 1.7 * sin(world.y * 0.045 + world.x * 0.013)) * 1.9);
    col *= 1.0 - 0.03 * smoothstep(0.2, 1.0, g);
  }

  vec2 s = fetchCell(cell);
  float age = s.x;
  bool big = uZoom >= 5.0;

  if (uTrails > 0.5 && age < 0.5 && s.y > 0.0 && s.y < 254.5) {
    col = mix(col, uLine, (s.y / 255.0) * (s.y / 255.0) * 0.1);
  }

  // Lines through cell centres fade in as you zoom.
  float lineA = uShowGrid > 0.5 ? smoothstep(6.0, 12.0, uZoom) * 0.62 : 0.0;
  if (lineA > 0.0) {
    vec2 d = abs(f - 0.5) * uZoom;
    float ln = 1.0 - smoothstep(0.35, 1.15, min(d.x, d.y));
    col = mix(col, uLine, ln * lineA);
    vec2 sp = mod(cell, 6.0);
    if (sp.x == 3.0 && sp.y == 3.0 && age < 0.5) {
      float dd = length(f - 0.5) * uZoom;
      col = mix(col, uLine, (1.0 - smoothstep(max(1.2, uZoom * 0.09), max(2.0, uZoom * 0.09 + 0.8), dd)) * lineA * 1.4);
    }
  }

  float r = 0.465;
  if (age > 0.5) {
    vec3 c = stoneColor(age);
    bool white = c.r > 0.5;
    if (big) {
      // A newborn stone drops in: a little high and large, settling with an underdamped spring.
      float t = age < 1.5 ? uT : 1.0;
      float k = exp(-t * 15.0);
      float sc = 1.0 + 0.2 * k * cos(t * 26.0);
      float lift = 0.22 * exp(-t * 22.0);
      vec2 p = f - 0.5 + vec2(0.0, lift);
      float sd = length(f - 0.5 - vec2(0.05, 0.08)) / r;
      col *= 1.0 - (1.0 - smoothstep(0.82, 1.18, sd)) * (0.3 - lift);
      vec4 st = stone(p, r * sc, c, white);
      col = mix(col, st.rgb, st.a * clamp(t / 0.04, 0.0, 1.0));
    } else {
      col = c;
    }
  } else if (big && s.y >= 254.5 && uT < 0.22) {
    // Lifted this generation: it rises and fades toward the lid.
    float t = uT / 0.22;
    vec2 p = f - 0.5 + vec2(0.0, t * 0.3);
    vec4 st = stone(p, r * (1.0 + 0.06 * t), uSlate * 0.5 + uShell * 0.5, true);
    col = mix(col, st.rgb, st.a * (1.0 - t) * 0.85);
  }

  if (!inside) col = mix(col, uEdge, 0.4); // wrapped copies are dimmed
  outColor = vec4(col, 1.0);
}`;

class WebGLGridRenderer implements GridRenderer {
  readonly kind = 'webgl2' as const;
  private prog: WebGLProgram;
  private stateTex: WebGLTexture;
  private rampTex: WebGLTexture;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private texW = 0;
  private texH = 0;
  private buf = new Uint8Array(0);
  private palette: Palette;
  private theme!: BoardTheme;

  constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
    palette: Palette,
    theme: BoardTheme,
  ) {
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);
    for (const n of ['uState', 'uAgeRamp', 'uRes', 'uCenter', 'uZoom', 'uGrid', 'uBoard', 'uEdge', 'uLine', 'uSlate', 'uShell', 'uShowGrid', 'uTrails', 'uWrap', 'uMode', 'uGenPar', 'uT'])
      this.u[n] = gl.getUniformLocation(this.prog, n);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.stateTex = gl.createTexture()!;
    this.rampTex = gl.createTexture()!;
    this.palette = palette;
    this.setTheme(theme);
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  setTheme(t: BoardTheme): void {
    const gl = this.gl;
    this.theme = t;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, ageTexture(t));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  draw(life: Life, view: View, opts: DrawOptions): void {
    const { gl, canvas, theme } = this;
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
    gl.uniform1i(this.u.uAgeRamp, 1);
    gl.uniform2f(this.u.uRes, canvas.width, canvas.height);
    gl.uniform2f(this.u.uCenter, view.cx, view.cy);
    gl.uniform1f(this.u.uZoom, view.zoom * dpr);
    gl.uniform2f(this.u.uGrid, life.w, life.h);
    const set = (name: string, c: RGB) => gl.uniform3f(this.u[name], c[0] / 255, c[1] / 255, c[2] / 255);
    set('uBoard', theme.board);
    set('uEdge', theme.edge);
    set('uLine', theme.line);
    set('uSlate', theme.slate);
    set('uShell', theme.shell);
    gl.uniform1f(this.u.uShowGrid, opts.grid ? 1 : 0);
    gl.uniform1f(this.u.uTrails, opts.trails ? 1 : 0);
    gl.uniform1f(this.u.uWrap, opts.wrap ? 1 : 0);
    gl.uniform1f(this.u.uMode, ['turns', 'age', 'slate'].indexOf(this.palette.id));
    gl.uniform1f(this.u.uGenPar, life.generation % 2);
    gl.uniform1f(this.u.uT, Math.min(1, opts.sinceStep));
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

/** Fallback for browsers without WebGL2: flat cells when zoomed out, simple stones when zoomed in. */
class Canvas2DGridRenderer implements GridRenderer {
  readonly kind = 'canvas2d' as const;
  private ctx: CanvasRenderingContext2D;
  private off = document.createElement('canvas');

  constructor(
    private canvas: HTMLCanvasElement,
    private palette: Palette,
    private theme: BoardTheme,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  setPalette(p: Palette): void {
    this.palette = p;
  }

  setTheme(t: BoardTheme): void {
    this.theme = t;
  }

  draw(life: Life, view: View, opts: DrawOptions): void {
    const { canvas, ctx, off, theme: t } = this;
    const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const z = view.zoom * dpr;
    const ox = canvas.width / 2 - view.cx * z;
    const oy = canvas.height / 2 - view.cy * z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = rgb(opts.wrap ? t.board : t.edge);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = rgb(t.board);
    ctx.fillRect(ox, oy, life.w * z, life.h * z);

    if (z < 5) {
      if (off.width !== life.w || off.height !== life.h) {
        off.width = life.w;
        off.height = life.h;
      }
      const octx = off.getContext('2d')!;
      const img = octx.createImageData(life.w, life.h);
      const d = img.data;
      for (let i = 0; i < life.cells.length; i++) {
        const a = life.age[i];
        const o = i * 4;
        let c: RGB = t.board;
        if (a) c = stoneColor(this.palette, t, a, life.generation);
        else if (opts.trails && life.trail[i]) {
          const k = (life.trail[i] / 255) ** 2 * 0.1;
          c = [t.board[0] + (t.line[0] - t.board[0]) * k, t.board[1] + (t.line[1] - t.board[1]) * k, t.board[2] + (t.line[2] - t.board[2]) * k];
        }
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const reps = opts.wrap ? [-1, 0, 1] : [0];
      for (const ry of reps)
        for (const rx of reps) ctx.drawImage(off, ox + rx * life.w * z, oy + ry * life.h * z, life.w * z, life.h * z);
      return;
    }

    const x0 = Math.floor(-ox / z) - 1, x1 = Math.ceil((canvas.width - ox) / z) + 1;
    const y0 = Math.floor(-oy / z) - 1, y1 = Math.ceil((canvas.height - oy) / z) + 1;
    const cellAt = (x: number, y: number) => {
      if (!opts.wrap && (x < 0 || y < 0 || x >= life.w || y >= life.h)) return -1;
      return (((y % life.h) + life.h) % life.h) * life.w + (((x % life.w) + life.w) % life.w);
    };
    if (opts.grid && z >= 6) {
      ctx.strokeStyle = `rgba(${t.line[0]},${t.line[1]},${t.line[2]},${Math.min(0.62, ((z - 6) / 6) * 0.62)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { const sx = Math.round(ox + (x + 0.5) * z) + 0.5; ctx.moveTo(sx, oy + y0 * z); ctx.lineTo(sx, oy + y1 * z); }
      for (let y = y0; y <= y1; y++) { const sy = Math.round(oy + (y + 0.5) * z) + 0.5; ctx.moveTo(ox + x0 * z, sy); ctx.lineTo(ox + x1 * z, sy); }
      ctx.stroke();
    }
    const r = z * 0.465;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = cellAt(x, y);
        if (i < 0 || !life.age[i]) continue;
        const cx = ox + (x + 0.5) * z, cy = oy + (y + 0.5) * z;
        ctx.fillStyle = 'rgba(30,15,0,0.25)';
        ctx.beginPath(); ctx.arc(cx + z * 0.05, cy + z * 0.08, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = rgb(stoneColor(this.palette, t, life.age[i], life.generation));
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
  }
}
