/**
 * A Go board in 3D for the home page story: a kaya slab with ink lines and
 * star points, and lens-shaped slate and clamshell stones. A warm key light
 * comes from the upper left, and a second, softer light follows the pointer
 * across the board. WebGL2: one draw call for the board, one for all the
 * stones (instanced), and one for their contact shadows.
 *
 * World units are board lines: point (gx, gz) sits at x = gx - (N-1)/2,
 * z = gz - (N-1)/2, the playing surface is y = 0 and y points up.
 */

type RGB = [number, number, number];
type Mat4 = Float32Array;

export interface Board3DColors {
  board: RGB;
  edge: RGB;
  line: RGB;
  slate: RGB;
  shell: RGB;
  dark: boolean;
}

/** Floats per stone in the instance buffer: gx, lift, gz, scale, colour (0 slate, 1 shell), alpha, seed, unused. */
export const STONE_STRIDE = 8;

/** Half the height of a stone resting on the board, in board lines. */
export const STONE_HALF = 0.19;
const STONE_R = 0.47;
const THICK = 2.2;  // the slab, like a floor-standing goban
const MARGIN = 0.85;

const COMMON = `
uniform vec3 uKey;      // direction toward the key light
uniform vec4 uPointer;  // xyz: the pointer light above the board, w: its strength
uniform vec3 uEye;
float pointerPool(vec3 p) {
  vec3 d = p - vec3(uPointer.x, 0.0, uPointer.z);
  return uPointer.w * exp(-dot(d.xz, d.xz) / 14.0);
}`;

const BOARD_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uViewProj;
out vec3 vPos;
out vec3 vNormal;
void main() {
  vPos = aPos;
  vNormal = aNormal;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const BOARD_FRAG = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
uniform vec3 uBoard;
uniform vec3 uEdge;
uniform vec3 uLine;
uniform float uN;
uniform float uDark;
${COMMON}
out vec4 o;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 n = normalize(vNormal);
  // Straight-grained kaya: long fibres running along x, gently wavering.
  vec2 g = vPos.xz;
  if (abs(n.y) < 0.5) g = abs(n.x) > 0.5 ? vec2(vPos.z, vPos.y * 3.0) : vec2(vPos.x, vPos.y * 3.0);
  float w = fbm(vec2(g.x * 0.08, g.y * 1.1)) * 2.6;
  float grain = 0.5 + 0.5 * sin((g.y + w) * 7.0);
  grain = pow(grain, 3.0) * 0.6 + fbm(vec2(g.x * 0.6, g.y * 9.0)) * 0.4;
  vec3 base = n.y > 0.5 ? uBoard : mix(uEdge, uBoard, 0.35);
  base *= 1.0 - grain * 0.13;

  if (n.y > 0.5) {
    // Ink lines through every point, and the nine star points.
    vec2 q = vPos.xz + 0.5 * (uN - 1.0);
    vec2 inside = step(vec2(-0.02), q) * step(q, vec2(uN - 0.98));
    vec2 d = abs(q - floor(q + 0.5));
    vec2 aa = fwidth(q) * 0.9;
    float lw = 0.03;
    float lx = (1.0 - smoothstep(lw - aa.x, lw + aa.x, d.x)) * step(-0.03, q.y) * step(q.y, uN - 0.97);
    float lz = (1.0 - smoothstep(lw - aa.y, lw + aa.y, d.y)) * step(-0.03, q.x) * step(q.x, uN - 0.97);
    float ink = max(lx, lz) * max(inside.x, inside.y);
    float c = uN > 14.0 ? 3.0 : 2.0;
    vec2 star = vec2(c, uN - 1.0 - c);
    float mid = 0.5 * (uN - 1.0);
    float sd = 9.0;
    for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
      vec2 s = vec2(i == 0 ? star.x : i == 1 ? mid : star.y, j == 0 ? star.x : j == 1 ? mid : star.y);
      sd = min(sd, length(q - s));
    }
    ink = max(ink, 1.0 - smoothstep(0.11 - aa.x, 0.11 + aa.x, sd));
    base = mix(base, uLine, ink * 0.82);
  }

  float diff = max(dot(n, uKey), 0.0);
  vec3 c = base * (0.55 + 0.5 * diff);
  // The pointer light makes a warm pool on the wood.
  c += base * pointerPool(vPos) * (n.y > 0.5 ? 0.5 : 0.0);
  // A soft sheen toward the key light: oiled wood, not lacquer.
  vec3 v = normalize(uEye - vPos);
  float sh = pow(max(dot(n, normalize(uKey + v)), 0.0), 18.0);
  c += vec3(1.0, 0.95, 0.85) * sh * (n.y > 0.5 ? 0.07 : 0.03);
  if (uDark > 0.5) c *= 0.92;
  o = vec4(c, 1.0);
}`;

const STONE_VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aInst;  // gx, lift, gz, scale
layout(location=3) in vec4 aLook;  // colour, alpha, seed, unused
uniform mat4 uViewProj;
uniform float uN;
uniform vec3 uHover;  // world x, z and strength of the hover lift
out vec3 vPos;
out vec3 vNormal;
out vec3 vLocal;
out float vColor;
out float vAlpha;
out float vSeed;
void main() {
  vec2 xz = vec2(aInst.x, aInst.z) - 0.5 * (uN - 1.0);
  float near = uHover.z * exp(-dot(xz - uHover.xy, xz - uHover.xy) / 2.2);
  float lift = aInst.y + near * 0.45;
  vec3 p = aPos * aInst.w + vec3(xz.x, ${STONE_HALF.toFixed(2)} * aInst.w + lift, xz.y);
  vPos = p;
  vLocal = aPos;
  vNormal = aNormal;
  vColor = aLook.x;
  vAlpha = aLook.y;
  vSeed = aLook.z;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const STONE_FRAG = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec3 vLocal;
in float vColor;
in float vAlpha;
in float vSeed;
uniform vec3 uSlate;
uniform vec3 uShell;
uniform vec3 uBoard;
${COMMON}
out vec4 o;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uEye - vPos);
  vec3 base;
  float gloss, spec;
  if (vColor > 0.5) {
    // Clamshell: faint growth bands across the face, and a soft polish.
    vec2 dir = vec2(cos(vSeed * 6.283), sin(vSeed * 6.283));
    float band = 0.5 + 0.5 * sin(dot(vLocal.xz, dir) * 70.0 + vSeed * 40.0);
    base = uShell * (1.0 - band * 0.045);
    gloss = 60.0; spec = 0.5;
  } else {
    // Slate: matte, with a broad sheen.
    base = uSlate;
    gloss = 14.0; spec = 0.18;
  }
  float diff = max(dot(n, uKey), 0.0);
  // Sky from above, warm bounce from the board below.
  vec3 amb = mix(uBoard * 0.55, vec3(1.0), 0.5 + 0.5 * n.y) * 0.32;
  vec3 c = base * (amb + 0.78 * diff);
  vec3 hk = normalize(uKey + v);
  c += vec3(1.0, 0.97, 0.9) * spec * pow(max(dot(n, hk), 0.0), gloss);
  // The pointer light: a second highlight that moves with you.
  vec3 lp = normalize(uPointer.xyz - vPos);
  vec3 hp = normalize(lp + v);
  c += vec3(1.0, 0.92, 0.78) * spec * 0.9 * uPointer.w * pow(max(dot(n, hp), 0.0), gloss) / (1.0 + 0.004 * dot(uPointer.xyz - vPos, uPointer.xyz - vPos));
  c += base * pointerPool(vPos) * 0.25;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += (vColor > 0.5 ? 0.06 : 0.1) * rim * vec3(1.0, 0.96, 0.9);
  o = vec4(c * vAlpha, vAlpha);
}`;

const SHADOW_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=2) in vec4 aInst;
layout(location=3) in vec4 aLook;
uniform mat4 uViewProj;
uniform float uN;
uniform vec3 uHover;
uniform vec3 uKey;
out vec2 vUv;
out float vA;
void main() {
  vec2 xz = vec2(aInst.x, aInst.z) - 0.5 * (uN - 1.0);
  float near = uHover.z * exp(-dot(xz - uHover.xy, xz - uHover.xy) / 2.2);
  float lift = aInst.y + near * 0.45;
  // Only stones near the board cast onto it; the shadow spreads and fades as a stone rises.
  float h = max(lift, 0.0);
  float r = ${STONE_R.toFixed(2)} * aInst.w * (1.25 + h * 0.7);
  vec2 off = -uKey.xz / max(uKey.y, 0.2) * (0.12 + h) * 0.5;
  vUv = aCorner;
  vA = aLook.y * 0.55 * exp(-h * 1.4) * step(h, 3.0);
  vec3 p = vec3(xz + off + aCorner * r, 0.004);
  gl_Position = uViewProj * vec4(p.x, p.z, p.y, 1.0);
}`;

const SHADOW_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vA;
out vec4 o;
void main() {
  float d = length(vUv);
  float a = vA * (1.0 - smoothstep(0.35, 1.0, d));
  o = vec4(0.11, 0.06, 0.01, 1.0) * a;
}`;

const GROUND_VERT = `#version 300 es
layout(location=0) in vec2 aCorner;
uniform mat4 uViewProj;
uniform float uN;
out vec2 vUv;
void main() {
  float e = 0.5 * (uN - 1.0) + ${MARGIN.toFixed(2)};
  vUv = aCorner * 1.6;
  gl_Position = uViewProj * vec4(aCorner.x * e * 1.6 + 0.6, -${THICK.toFixed(1)} - 0.01, aCorner.y * e * 1.6 + 0.5, 1.0);
}`;

const GROUND_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uDark;
out vec4 o;
void main() {
  // A soft rounded-square shadow where the board stands on the floor.
  vec2 q = max(abs(vUv) - vec2(0.82), 0.0);
  float d = length(q);
  float a = (1.0 - smoothstep(0.0, 0.62, d)) * (uDark > 0.5 ? 0.6 : 0.34);
  o = vec4(0.12, 0.06, 0.0, 1.0) * a;
}`;

/** A slab: the board's top, four sides and a hidden bottom. */
function slab(n: number): Float32Array {
  const e = (n - 1) / 2 + MARGIN;
  const y0 = -THICK, y1 = 0;
  const out: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], nn: number[]) => {
    for (const v of [a, b, c, a, c, d]) out.push(v[0], v[1], v[2], ...nn);
  };
  quad([-e, y1, -e], [-e, y1, e], [e, y1, e], [e, y1, -e], [0, 1, 0]);
  quad([-e, y0, e], [e, y0, e], [e, y1, e], [-e, y1, e], [0, 0, 1]);
  quad([e, y0, -e], [-e, y0, -e], [-e, y1, -e], [e, y1, -e], [0, 0, -1]);
  quad([e, y0, e], [e, y0, -e], [e, y1, -e], [e, y1, e], [1, 0, 0]);
  quad([-e, y0, -e], [-e, y0, e], [-e, y1, e], [-e, y1, -e], [-1, 0, 0]);
  return new Float32Array(out);
}

/** A flattened ellipsoid with a slightly crisper rim: close to a real biconvex stone. */
function lens(lon = 28, lat = 12): { verts: Float32Array; index: Uint16Array } {
  const v: number[] = [];
  const idx: number[] = [];
  const a = STONE_R, hh = STONE_HALF;
  for (let i = 0; i <= lat; i++) {
    const phi = (i / lat) * Math.PI;           // 0 at the top, pi at the bottom
    const s = Math.sin(phi), c = Math.cos(phi);
    const r = a * Math.pow(s, 0.8);
    const y = hh * Math.sign(c) * Math.pow(Math.abs(c), 1.15);
    for (let j = 0; j <= lon; j++) {
      const th = (j / lon) * Math.PI * 2;
      const x = r * Math.cos(th), z = r * Math.sin(th);
      // Ellipsoid normal is a good enough fit for lighting.
      const nx = x / (a * a), ny = y / (hh * hh), nz = z / (a * a);
      const l = Math.hypot(nx, ny, nz) || 1;
      v.push(x, y, z, nx / l, ny / l, nz / l);
    }
  }
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    const p = i * (lon + 1) + j, q = p + lon + 1;
    idx.push(p, q, p + 1, p + 1, q, q + 1);
  }
  return { verts: new Float32Array(v), index: new Uint16Array(idx) };
}

export interface Camera3D { eye: number[]; viewProj: Mat4 }

export class Board3D {
  private gl: WebGL2RenderingContext;
  private boardProg: WebGLProgram;
  private stoneProg: WebGLProgram;
  private shadowProg: WebGLProgram;
  private groundProg: WebGLProgram;
  private boardVao: WebGLVertexArrayObject;
  private stoneVao: WebGLVertexArrayObject;
  private shadowVao: WebGLVertexArrayObject;
  private inst: WebGLBuffer;
  private stoneIndexCount: number;
  private count = 0;
  private boardVerts: number;
  private u = new Map<WebGLProgram, Record<string, WebGLUniformLocation | null>>();
  private invVP: Mat4 | null = null;

  constructor(private canvas: HTMLCanvasElement, readonly n: number, private colors: Board3DColors) {
    const gl = canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    const names = ['uViewProj', 'uKey', 'uPointer', 'uEye', 'uBoard', 'uEdge', 'uLine', 'uN', 'uDark', 'uSlate', 'uShell', 'uHover'];
    this.boardProg = this.program(BOARD_VERT, BOARD_FRAG, names);
    this.stoneProg = this.program(STONE_VERT, STONE_FRAG, names);
    this.shadowProg = this.program(SHADOW_VERT, SHADOW_FRAG, names);
    this.groundProg = this.program(GROUND_VERT, GROUND_FRAG, names);

    this.boardVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.boardVao);
    const bv = slab(n);
    this.boardVerts = bv.length / 6;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, bv, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

    this.inst = gl.createBuffer()!;
    const bindInstances = () => {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STONE_STRIDE * 4, 0);
      gl.vertexAttribDivisor(2, 1);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.FLOAT, false, STONE_STRIDE * 4, 16);
      gl.vertexAttribDivisor(3, 1);
    };

    this.stoneVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.stoneVao);
    const m = lens();
    this.stoneIndexCount = m.index.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.index, gl.STATIC_DRAW);
    bindInstances();

    this.shadowVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.shadowVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    bindInstances();
    gl.bindVertexArray(null);
  }

  private program(vs: string, fs: string, names: string[]): WebGLProgram {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const k of names) u[k] = gl.getUniformLocation(p, k);
    this.u.set(p, u);
    return p;
  }

  setColors(c: Board3DColors): void { this.colors = c; }

  /** `data` holds STONE_STRIDE floats per stone; only the first `count` stones are drawn. */
  setStones(data: Float32Array, count: number): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * STONE_STRIDE), gl.DYNAMIC_DRAW);
    this.count = count;
  }

  /** The board point under a canvas position (CSS px), or null if the ray misses the board. */
  pick(px: number, py: number): { x: number; z: number; gx: number; gz: number } | null {
    if (!this.invVP) return null;
    const w = this.canvas.clientWidth, hgt = this.canvas.clientHeight;
    const nx = (px / w) * 2 - 1, ny = 1 - (py / hgt) * 2;
    const un = (z: number) => {
      const m = this.invVP!;
      const x = m[0] * nx + m[4] * ny + m[8] * z + m[12];
      const y = m[1] * nx + m[5] * ny + m[9] * z + m[13];
      const zz = m[2] * nx + m[6] * ny + m[10] * z + m[14];
      const ww = m[3] * nx + m[7] * ny + m[11] * z + m[15];
      return [x / ww, y / ww, zz / ww];
    };
    const a = un(-1), b = un(1);
    const dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-6) return null;
    const t = -a[1] / dy;
    if (t < 0 || t > 1) return null;
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    const half = (this.n - 1) / 2;
    if (Math.abs(x) > half + MARGIN || Math.abs(z) > half + MARGIN) return null;
    return { x, z, gx: Math.round(x + half), gz: Math.round(z + half) };
  }

  draw(cam: Camera3D, o: { key: number[]; pointer: number[]; hover: number[] }): void {
    const gl = this.gl;
    const c = this.colors;
    this.invVP = invert(cam.viewProj);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    const f = (v: RGB) => [v[0] / 255, v[1] / 255, v[2] / 255];
    const set = (p: WebGLProgram) => {
      const u = this.u.get(p)!;
      gl.useProgram(p);
      gl.uniformMatrix4fv(u.uViewProj, false, cam.viewProj);
      gl.uniform3fv(u.uKey, o.key);
      gl.uniform4fv(u.uPointer, o.pointer);
      gl.uniform3fv(u.uEye, cam.eye);
      gl.uniform3fv(u.uBoard, f(c.board));
      gl.uniform3fv(u.uEdge, f(c.edge));
      gl.uniform3fv(u.uLine, f(c.line));
      gl.uniform3fv(u.uSlate, f(c.slate));
      gl.uniform3fv(u.uShell, f(c.shell));
      gl.uniform1f(u.uN, this.n);
      gl.uniform1f(u.uDark, c.dark ? 1 : 0);
      gl.uniform3fv(u.uHover, o.hover);
    };

    // The floor shadow goes first, behind everything, without depth.
    set(this.groundProg);
    gl.bindVertexArray(this.shadowVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.depthMask(true);

    set(this.boardProg);
    gl.bindVertexArray(this.boardVao);
    gl.disable(gl.BLEND);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, this.boardVerts);

    if (this.count) {
      // Contact shadows sit just above the wood and never write depth.
      set(this.shadowProg);
      gl.bindVertexArray(this.shadowVao);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
      gl.depthMask(true);

      set(this.stoneProg);
      gl.bindVertexArray(this.stoneVao);
      gl.drawElementsInstanced(gl.TRIANGLES, this.stoneIndexCount, gl.UNSIGNED_SHORT, 0, this.count);
      gl.disable(gl.BLEND);
    }
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

/** Inverse of a 4×4 column-major matrix (for picking). */
export function invert(m: Mat4): Mat4 | null {
  const o = new Float32Array(16);
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return o;
}
