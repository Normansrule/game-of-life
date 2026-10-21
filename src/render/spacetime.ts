/**
 * 3D spacetime renderer: every live cell (x, y) at generation t becomes a
 * cube at (x, t, y), drawn with WebGL2 instancing so hundreds of thousands
 * of cubes render in one draw call. Time runs upward.
 *
 * Drawn as stones on the board: matte slate voxels with plain diffuse
 * shading, older layers fading toward the board, and the newest layer in
 * clamshell white. No glow. Colours come from the design tokens through
 * setColors(), which the view calls again whenever light/dark mode changes.
 */

type RGB = [number, number, number];

export interface SpacetimeColors {
  /** Clear colour and the colour distant cubes fade toward. */
  bg: RGB;
  board: RGB;
  slate: RGB;
  shell: RGB;
  /** Categorical colours for "colour by object" (up to 6). */
  cats: RGB[];
}

type Mat4 = Float32Array;

export function perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovy / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function lookAt(eye: number[], target: number[], up: number[]): Mat4 {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  return o;
}

const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const VERT = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec4 aInst; // x, t, y, segment hue
uniform mat4 uViewProj;
uniform float uReveal;
uniform float uTMax;
uniform float uLayerGap;
out vec3 vNormal;
out float vT;
out float vHue;
out float vDepth;
out float vFront;
void main() {
  float t = aInst.y;
  float show = t <= uReveal ? 1.0 : 0.0;
  vec3 p = aPos * 0.92 * show + vec3(aInst.x, t * uLayerGap, aInst.z);
  gl_Position = uViewProj * vec4(p, 1.0);
  vNormal = aNormal;
  vT = t / max(uTMax, 1.0);
  vHue = aInst.w;
  vDepth = gl_Position.w;
  vFront = 1.0 - clamp(uReveal - t, 0.0, 6.0) / 6.0;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in float vT;
in float vHue;
in float vDepth;
in float vFront;
uniform float uFogFar;
uniform vec3 uBg;
uniform vec3 uBoard;
uniform vec3 uSlate;
uniform vec3 uShell;
uniform vec3 uCat[6];
uniform int uColorMode;
out vec4 o;
void main() {
  vec3 L = normalize(vec3(0.5, 0.9, 0.35));
  float diff = max(dot(normalize(vNormal), L), 0.0);
  vec3 base;
  if (uColorMode == 0) {
    // By time: old layers fade toward the board like dry ink, recent ones are solid slate.
    base = mix(mix(uSlate, uBoard, 0.5), uSlate, vT);
  } else {
    int i = int(floor(fract(vHue) * 6.0));
    base = uCat[i];
  }
  // The current generation is a layer of white stones.
  base = mix(base, uShell, smoothstep(0.8, 1.0, vFront));
  vec3 c = base * (0.62 + 0.45 * diff);
  float fog = clamp(vDepth / uFogFar, 0.0, 1.0);
  o = vec4(mix(c, uBg, fog * fog * 0.6), 1.0);
}`;

function cube(): Float32Array {
  // 6 faces x 2 triangles x 3 vertices, each with position + normal.
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 1, 1], [0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 1], [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[0, 0, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]],
  ];
  const out: number[] = [];
  for (const [n, verts] of faces) for (const v of verts) out.push(v[0] - 0.5, v[1] - 0.5, v[2] - 0.5, ...n);
  return new Float32Array(out);
}

export class SpacetimeRenderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private inst: WebGLBuffer;
  private count = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement, private colors: SpacetimeColors) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    this.prog = p;
    for (const n of ['uViewProj', 'uReveal', 'uTMax', 'uLayerGap', 'uFogFar', 'uBg', 'uBoard', 'uSlate', 'uShell', 'uCat', 'uColorMode']) this.u[n] = gl.getUniformLocation(p, n);
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    this.inst = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
  }

  /** Set the palette (0..255 RGB). Call again when the colour mode changes. */
  setColors(c: SpacetimeColors): void {
    this.colors = c;
  }

  /** instances: [x, t, y, hue] per live cell. */
  setInstances(data: Float32Array): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    this.count = data.length / 4;
  }

  draw(viewProj: Mat4, o: { reveal: number; tMax: number; layerGap: number; fogFar: number; colorMode: number }): void {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const c = this.colors;
    const f = (v: RGB): [number, number, number] => [v[0] / 255, v[1] / 255, v[2] / 255];
    const bg = f(c.bg);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uViewProj, false, viewProj);
    gl.uniform1f(this.u.uReveal, o.reveal);
    gl.uniform1f(this.u.uTMax, o.tMax);
    gl.uniform1f(this.u.uLayerGap, o.layerGap);
    gl.uniform1f(this.u.uFogFar, o.fogFar);
    gl.uniform3f(this.u.uBg, ...bg);
    gl.uniform3f(this.u.uBoard, ...f(c.board));
    gl.uniform3f(this.u.uSlate, ...f(c.slate));
    gl.uniform3f(this.u.uShell, ...f(c.shell));
    const cats = new Float32Array(18);
    for (let i = 0; i < 6; i++) cats.set(f(c.cats.length ? c.cats[i % c.cats.length] : c.slate), i * 3);
    gl.uniform3fv(this.u.uCat, cats);
    gl.uniform1i(this.u.uColorMode, o.colorMode);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, this.count);
    gl.bindVertexArray(null);
  }
}
