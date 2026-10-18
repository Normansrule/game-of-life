export type RGB = [number, number, number];

export interface Palette {
  id: string;
  name: string;
  background: RGB;
  /** Colour ramp for live cells from newborn (t=0) to ancient (t=1). */
  alive: RGB[];
  /** Colour ramp for the fading trail left by dead cells. */
  trail: RGB[];
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export const PALETTES: Palette[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    background: hex('#070b16'),
    alive: ['#ffffff', '#7df9ff', '#38e8a8', '#c6f432', '#ffb020', '#ff4fa3', '#9b5cff'].map(hex),
    trail: ['#0b1430', '#1b2f7a', '#5b3fd6'].map(hex),
  },
  {
    id: 'inferno',
    name: 'Inferno',
    background: hex('#0a0507'),
    alive: ['#fffbe0', '#ffe066', '#ff9a1f', '#f2441d', '#b5135d', '#5a0b6e'].map(hex),
    trail: ['#1a0508', '#5c0d14', '#b8261c'].map(hex),
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    background: hex('#020a12'),
    alive: ['#f2ffff', '#8ff3ff', '#2fb8f0', '#2563eb', '#4338ca'].map(hex),
    trail: ['#03151f', '#0b3b52', '#127a8a'].map(hex),
  },
  {
    id: 'matrix',
    name: 'Phosphor',
    background: hex('#020703'),
    alive: ['#eaffea', '#7dff8a', '#22c55e', '#15803d', '#0f5132'].map(hex),
    trail: ['#020d04', '#063d12', '#0f6b22'].map(hex),
  },
  {
    id: 'mono',
    name: 'Paper',
    background: hex('#f4f1ea'),
    alive: ['#111111', '#222222', '#333344'].map(hex),
    trail: ['#f4f1ea', '#d9d2c3', '#b9ae98'].map(hex),
  },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

export function sampleRamp(ramp: RGB[], t: number): RGB {
  t = Math.min(1, Math.max(0, t));
  const f = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(f));
  const u = f - i;
  const a = ramp[i];
  const b = ramp[i + 1] ?? a;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/** Age (1..255) to ramp position; logarithmic so young cells get most of the range. */
export function ageT(age: number): number {
  return Math.log(age) / Math.log(255);
}

/** 256 x 2 RGBA texture: row 0 = alive by age, row 1 = trail by intensity. */
export function paletteTexture(p: Palette): Uint8Array {
  const data = new Uint8Array(256 * 2 * 4);
  for (let i = 0; i < 256; i++) {
    const a = sampleRamp(p.alive, i / 255);
    const t = sampleRamp(p.trail, i / 255);
    data.set([a[0], a[1], a[2], 255], i * 4);
    data.set([t[0], t[1], t[2], 255], (256 + i) * 4);
  }
  return data;
}

export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
