/**
 * Ancestors tab: run Life backwards. Draw a pattern, search for its parents
 * (patterns that become it in one step), then pick a parent to search for
 * its parents, building a family tree that grows back in time.
 */
import type { Cell } from '../engine/life';
import { patternCells } from '../engine/patterns';
import { type PredecessorResult, findPredecessors } from '../engine/predecessors';
import { emit } from './bus';
import { fitCanvas, h } from './dom';
import { icon } from './icons';
import { onTheme, tok } from './theme';
import { CellPainter, drawBoardLines, drawThumb } from './thumb';

const GW = 12, GH = 12;
const SHOW = 10;
const MAX_NODES = 1_500_000;

interface Column {
  /** The pattern whose parents this column lists (column 0: the target itself). */
  child: Cell[];
  result: PredecessorResult | null;
  shown: Cell[][];
  picked: number;
  cards: HTMLElement[];
}

const PRESETS: { label: string; cells: () => Cell[] }[] = [
  { label: 'Glider', cells: () => patternCells('glider') },
  { label: 'Blinker', cells: () => patternCells('blinker') },
  { label: 'Beehive', cells: () => patternCells('beehive') },
  { label: 'R-pentomino', cells: () => patternCells('rpentomino') },
  { label: 'One cell', cells: () => [[0, 0]] },
  { label: 'Block', cells: () => patternCells('block') },
];

export function createAncestorsView(root: HTMLElement) {
  let cells = new Set<string>();
  let margin = 1;
  let columns: Column[] = [];
  let busy = false;

  const editor = h('canvas.anc-editor');
  const treeWrap = h('div.anc-tree');
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.classList.add('anc-lines');
  const cols = h('div.anc-cols');
  treeWrap.append(lines, cols);
  const status = h('span.mono.dim');
  const findBtn = h('button.primary', { onclick: () => start() }, icon('rewind'), 'Find parents');
  const rewindBtn = h('button', { onclick: () => rewind(5), title: 'Go back five generations, taking the smallest parent each time' }, 'Rewind 5 steps');
  const marginSel = h('select', { onchange: (e: Event) => { margin = +(e.target as HTMLSelectElement).value; } },
    h('option', { value: '1' }, 'within 1 cell of the pattern'), h('option', { value: '2' }, 'within 2 cells (slower)'));

  root.append(h('div.ancestors', {},
    h('header.view-head', {},
      h('h1', {}, 'Ancestors: running Life backwards'),
      h('p', {}, 'Life is easy to run forwards and hard to run backwards. A pattern can have thousands of possible parents, or none at all. Draw a pattern (or pick one), and the search finds every pattern in a box around it that turns into exactly that pattern one generation later. Click a parent to find its parents in turn, and the tree grows back in time, right to left.')),
    h('div.anc-layout', {},
      h('section.panel.anc-input', {},
        h('h3', {}, 'The present'),
        editor,
        h('div.fig-controls', {}, ...PRESETS.map((p) => h('button.small', { onclick: () => load(p.cells()) }, p.label)),
          h('button.small', { onclick: () => load([]) }, 'Clear')),
        h('label.small', {}, 'Look for parents ', marginSel),
        h('div.fig-controls', {}, findBtn, rewindBtn),
        status,
        h('p.small.dim', {}, 'Parents are listed smallest first. "None in the box" does not prove a pattern is a Garden of Eden: a parent might need live cells further out. It does prove there is no parent of that size.')),
      h('section.panel.anc-tree-panel', {}, h('h3', {}, 'Family tree (time runs right to left)'), treeWrap))));

  // ---- editor ----
  const current = (): Cell[] => [...cells].map((k) => k.split(',').map(Number) as Cell);
  function load(c: Cell[]) {
    if (busy) return;
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    const ox = c.length ? Math.floor((GW - (Math.max(...xs) - Math.min(...xs) + 1)) / 2) - Math.min(...xs) : 0;
    const oy = c.length ? Math.floor((GH - (Math.max(...ys) - Math.min(...ys) + 1)) / 2) - Math.min(...ys) : 0;
    cells = new Set(c.map(([x, y]) => `${x + ox},${y + oy}`));
    drawEditor();
    if (c.length) start();
    else { columns = []; renderTree(); }
  }
  function drawEditor() {
    fitCanvas(editor);
    const ctx = editor.getContext('2d')!;
    const dpr = editor.width / Math.max(1, editor.clientWidth);
    const W = editor.clientWidth, H = editor.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.min(W / GW, H / GH);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, W, H);
    drawBoardLines(ctx, GW * s, GH * s, s, 0, 0);
    const p = new CellPainter(s);
    for (const [x, y] of current()) p.add(x * s, y * s);
    p.fill(ctx, '--slate');
  }
  let painting: boolean | null = null;
  const cellAt = (e: PointerEvent): Cell | null => {
    const r = editor.getBoundingClientRect();
    const s = Math.min(r.width / GW, r.height / GH);
    const x = Math.floor((e.clientX - r.left) / s), y = Math.floor((e.clientY - r.top) / s);
    return x >= 0 && y >= 0 && x < GW && y < GH ? [x, y] : null;
  };
  const paint = (c: Cell | null) => {
    if (!c || painting === null) return;
    const k = `${c[0]},${c[1]}`;
    if (painting) cells.add(k); else cells.delete(k);
    drawEditor();
  };
  editor.addEventListener('pointerdown', (e) => {
    const c = cellAt(e);
    if (!c || busy) return;
    editor.setPointerCapture(e.pointerId);
    painting = !cells.has(`${c[0]},${c[1]}`);
    paint(c);
  });
  editor.addEventListener('pointermove', (e) => paint(cellAt(e)));
  editor.addEventListener('pointerup', () => { painting = null; });

  // ---- search ----
  const later = (f: () => void) => setTimeout(f, 30);

  function search(child: Cell[]): Column {
    const result = findPredecessors(child, { margin, maxSolutions: 400, maxNodes: MAX_NODES });
    const shown = [...result.parents].sort((a, b) => a.length - b.length).slice(0, SHOW);
    return { child, result, shown, picked: -1, cards: [] };
  }

  function start() {
    const t = current();
    if (!t.length || busy) { if (!t.length) status.textContent = 'Draw a pattern first.'; return; }
    busy = true;
    status.textContent = 'Searching…';
    columns = [{ child: t, result: null, shown: [t], picked: 0, cards: [] }];
    renderTree();
    later(() => {
      columns.push(search(t));
      busy = false;
      describe();
      renderTree();
    });
  }

  function pick(level: number, idx: number) {
    if (busy) return;
    const col = columns[level];
    col.picked = idx;
    columns = columns.slice(0, level + 1);
    busy = true;
    status.textContent = 'Searching…';
    renderTree();
    later(() => {
      columns.push(search(col.shown[idx]));
      busy = false;
      describe();
      renderTree();
    });
  }

  function rewind(steps: number) {
    if (busy) return;
    if (!columns.length) { start(); return; }
    let left = steps;
    const step = () => {
      const last = columns[columns.length - 1];
      if (!last.shown.length || left-- <= 0 || last === columns[0]) { busy = false; describe(); renderTree(); return; }
      last.picked = 0;
      busy = true;
      status.textContent = `Rewinding… ${columns.length - 1} generations back`;
      renderTree();
      later(() => { columns.push(search(last.shown[0])); step(); });
    };
    step();
  }

  /** Redo the last search looking one cell further out. */
  function widen() {
    if (busy || columns.length < 2) return;
    margin = 2;
    marginSel.value = '2';
    const child = columns[columns.length - 1].child;
    columns = columns.slice(0, -1);
    busy = true;
    status.textContent = 'Searching…';
    renderTree();
    later(() => {
      columns.push(search(child));
      busy = false;
      describe();
      renderTree();
    });
  }

  /** The column for a search that found nothing: say why, and what to try next. */
  function emptyState(r: PredecessorResult, level: number) {
    const box = `${r.box.w}×${r.box.h}`;
    const tryWider = margin < 2 ? h('button', { onclick: widen }, 'Look 2 cells out') : '';
    // Step back and pick the next parent along in the previous generation, if it has another.
    const prev = columns[level - 1];
    const other = level > 1 && prev.shown.length > 1 ? (prev.picked + 1) % prev.shown.length : -1;
    const back = other >= 0 ? h('button', { onclick: () => pick(level - 1, other) }, 'Try another parent') : '';
    if (r.exhausted) return h('div.state', {},
      h('h3', {}, level === 1 ? 'No parents in the box' : 'A dead end'),
      h('p', {}, `Nothing in the ${box} box turns into this pattern. It might be a Garden of Eden (a pattern with no past at all), or its parent needs live cells further out.${margin < 2 ? ' Widening the search can tell them apart, slowly.' : ''}`),
      tryWider || back ? h('div.actions', {}, tryWider, back) : '');
    return h('div.state', {},
      h('h3', {}, 'The search gave up'),
      h('p', {}, `It ran out of steps before finding a parent in the ${box} box, so this doesn't prove there isn't one. Smaller patterns search much faster${margin > 1 ? ', and so does looking only 1 cell out' : ''}.`),
      back ? h('div.actions', {}, back) : '');
  }

  function describe() {
    const last = columns[columns.length - 1];
    const r = last.result;
    if (!r) return;
    const depth = columns.length - 1;
    const box = `${r.box.w}×${r.box.h}`;
    if (!r.parents.length) status.textContent = r.exhausted ? `Generation −${depth}: no parent fits in the ${box} box.` : `Generation −${depth}: the search gave up before finding a parent.`;
    else status.textContent = `Generation −${depth}: ${r.capped || !r.exhausted ? `at least ${r.parents.length}` : r.parents.length} parent${r.parents.length === 1 ? '' : 's'} in the ${box} box${r.capped ? ' (search stopped at 400)' : !r.exhausted ? ' (search gave up)' : ', and that is all of them'}. ${r.nodes.toLocaleString()} search steps.`;
  }

  // ---- tree ----
  function renderTree() {
    cols.replaceChildren(...columns.map((col, level) => {
      const head = level === 0 ? 'Now' : `Generation −${level}`;
      const r = col.result;
      const note = level === 0 ? 'the target' : !r ? '' : !r.parents.length ? 'no parent in the box' : `${r.parents.length}${r.capped || !r.exhausted ? '+' : ''} parent${r.parents.length === 1 ? '' : 's'}${r.parents.length > SHOW ? `, smallest ${SHOW} shown` : ''}`;
      col.cards = col.shown.map((p, i) => {
        const c = h('canvas.thumb.anc');
        const card = h(`div.anc-card${col.picked === i && level < columns.length - 1 ? '.picked' : ''}`, { title: level === 0 ? '' : 'Find this pattern\'s parents' },
          c, h('span.small', {}, `${p.length} cells`),
          h('button.link.small', { onclick: (e: Event) => { e.stopPropagation(); emit('sim:load', { cells: p, name: level ? `Ancestor −${level}` : 'Target' }); emit('navigate', { route: 'sim' }); } }, 'simulate'));
        if (level > 0) card.addEventListener('click', () => pick(level, i));
        requestAnimationFrame(() => drawThumb(c, p, level === 0 ? '--shell' : '--slate', '--board', 3));
        return card;
      });
      return h('div.anc-col', {}, h('div.anc-col-head', {}, h('b', {}, head), h('span.small.dim', {}, note)), ...col.cards,
        r && !r.parents.length && !busy ? emptyState(r, level) : '');
    }).reverse());
    if (busy) cols.prepend(h('div.anc-col', {}, h('div.anc-col-head', {}, h('b', {}, `Generation −${columns.length}`)),
      h('div.anc-spinner', {}, h('span.stones-loading', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), 'Searching for parents…')));
    requestAnimationFrame(drawLines);
    treeWrap.scrollLeft = 0;
  }

  function drawLines() {
    const wr = treeWrap.getBoundingClientRect();
    lines.setAttribute('width', String(treeWrap.scrollWidth));
    lines.setAttribute('height', String(treeWrap.scrollHeight));
    const paths: string[] = [];
    for (let level = 0; level + 1 < columns.length; level++) {
      const col = columns[level];
      const from = col.cards[col.picked];
      if (!from) continue;
      const a = from.getBoundingClientRect();
      for (const to of columns[level + 1].cards) {
        const b = to.getBoundingClientRect();
        const x1 = a.left - wr.left + treeWrap.scrollLeft, y1 = a.top + a.height / 2 - wr.top;
        const x2 = b.right - wr.left + treeWrap.scrollLeft, y2 = b.top + b.height / 2 - wr.top;
        const mx = (x1 + x2) / 2;
        paths.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" />`);
      }
    }
    lines.innerHTML = paths.join('');
  }
  window.addEventListener('resize', () => requestAnimationFrame(drawLines));
  onTheme(() => { drawEditor(); renderTree(); });

  let first = true;
  return {
    activate() {
      requestAnimationFrame(() => {
        drawEditor();
        if (first) { first = false; load(patternCells('glider')); }
        else drawLines();
      });
    },
    deactivate() {},
  };
}
