export type RGB = [number, number, number];

/**
 * How stones are coloured on the board.
 *  - turns: births alternate black and white each generation, like turns in Go,
 *           so you can read a pattern's age in bands.
 *  - age:   newborn stones are clamshell white and darken to slate as they survive.
 *  - slate: every stone is black.
 */
export type Colouring = 'turns' | 'age' | 'slate';

export interface Palette {
  id: Colouring;
  name: string;
}

export const PALETTES: Palette[] = [
  { id: 'turns', name: 'Turns (black and white)' },
  { id: 'age', name: 'Age (white to black)' },
  { id: 'slate', name: 'Slate only' },
];

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Board colours, read from the design tokens so they follow light and dark mode. */
export interface BoardTheme {
  board: RGB;
  edge: RGB;
  line: RGB;
  slate: RGB;
  shell: RGB;
  dark: boolean;
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

/** Stone colour for a live cell, shared by the WebGL and canvas renderers. */
export function stoneColor(p: Palette, t: BoardTheme, age: number, generation: number): RGB {
  if (p.id === 'slate') return t.slate;
  if (p.id === 'age') return sampleRamp([t.shell, [190, 183, 168], [104, 99, 92], t.slate], ageT(Math.max(1, age)));
  // A cell born at generation g has age = generation - g + 1. Very old stones (age saturates at 255) are black.
  if (age >= 255) return t.slate;
  return (generation - age + 1) % 2 === 0 ? t.slate : t.shell;
}

/** 256 x 1 RGBA texture of the age ramp, used by the shader in "age" mode. */
export function ageTexture(t: BoardTheme): Uint8Array {
  const data = new Uint8Array(256 * 4);
  const ramp: RGB[] = [t.shell, [190, 183, 168], [104, 99, 92], t.slate];
  for (let i = 0; i < 256; i++) {
    const c = sampleRamp(ramp, ageT(Math.max(1, i)));
    data.set([c[0], c[1], c[2], 255], i * 4);
  }
  return data;
}

export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
