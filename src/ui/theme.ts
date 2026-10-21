/**
 * Colour mode (Daylight / Lamplight / follow the system) and access to the
 * design tokens in style.css from canvas code.
 *
 * Canvases can't use CSS variables directly, so views read them with `tok()`
 * and redraw when `onTheme()` fires.
 */
export type Mode = 'light' | 'dark' | 'system';
export type RGB = [number, number, number];

const KEY = 'life-tree:mode';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const motion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const listeners = new Set<() => void>();
let cache = new Map<string, string>();

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch { /* storage blocked: follow the system */ }
  return 'system';
}

let mode: Mode = read();

function apply() {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = mode;
  cache = new Map();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', tok('--ground'));
  listeners.forEach((f) => f());
}

export function initTheme() {
  apply();
  media?.addEventListener('change', () => mode === 'system' && apply());
}

export const getMode = () => mode;

export function setMode(m: Mode) {
  mode = m;
  try {
    if (m === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, m);
  } catch { /* not persisted; still applies for this visit */ }
  apply();
}

export function isDark(): boolean {
  return mode === 'dark' || (mode === 'system' && !!media?.matches);
}

export const reducedMotion = () => !!motion?.matches;

/** Current value of a CSS custom property on :root, e.g. tok('--ink'). */
export function tok(name: string): string {
  let v = cache.get(name);
  if (v === undefined) {
    v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    cache.set(name, v);
  }
  return v;
}

export function rgb(name: string): RGB {
  return parseColor(tok(name));
}

export function parseColor(s: string): RGB {
  if (s.startsWith('#')) {
    let x = s.slice(1);
    if (x.length === 3) x = [...x].map((c) => c + c).join('');
    const n = parseInt(x.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = s.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
}

/** A token with a given alpha, for canvas strokes and fills. */
export function alpha(name: string, a: number): string {
  const [r, g, b] = rgb(name);
  return `rgba(${r},${g},${b},${a})`;
}

/** Run `f` whenever the colour mode changes. Returns an unsubscribe function. */
export function onTheme(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Board colours for the grid renderers. */
export function boardTheme(): import('../render/palettes').BoardTheme {
  return { board: rgb('--board'), edge: rgb('--board-edge'), line: rgb('--board-line'), slate: rgb('--slate'), shell: rgb('--shell'), dark: isDark() };
}
