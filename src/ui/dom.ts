type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper: h('div.card#id', {onclick}, ...children). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K | `${K}.${string}` | `${K}#${string}`,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const [, name, rest] = /^([a-z0-9]+)(.*)$/.exec(tag)!;
  const el = document.createElement(name) as HTMLElementTagNameMap[K];
  for (const m of rest.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]);
    else el.id = m[2];
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

/** Keep a canvas's backing store in sync with its CSS size and devicePixelRatio. */
export function fitCanvas(canvas: HTMLCanvasElement, maxDpr = 2): boolean {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const hh = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== hh) {
    canvas.width = w;
    canvas.height = hh;
    return true;
  }
  return false;
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

export function slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void, show: (v: number) => string = String) {
  const out = h('output', {}, show(value));
  const input = h('input', { type: 'range', min, max, step, value: String(value) });
  input.addEventListener('input', () => {
    const v = +input.value;
    out.textContent = show(v);
    onInput(v);
  });
  return { el: h('label.slider', {}, h('span', {}, label), input, out), input, out };
}

export function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return { el: h('label.toggle', {}, input, h('span.switch'), h('span', {}, label)), input };
}

export function select<T extends string>(options: { value: T; label: string }[], value: T, onChange: (v: T) => void) {
  const el = h('select', {}, ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

export function toast(msg: string): void {
  const t = h('div.toast', {}, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 400);
  }, 2200);
}

export function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
