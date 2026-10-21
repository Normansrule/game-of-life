import { type Cell, Life, bounds, normalize } from '../engine/life';
import { RULE_PRESETS, parseRule, ruleToString } from '../engine/rules';
import { PATTERNS, type PatternDef, getPattern, patternCells, transform } from '../engine/patterns';
import { parsePlaintext, parseRLE, toRLE } from '../engine/rle';
import { PALETTES, getPalette } from '../render/palettes';
import { type GridRenderer, type View, createRenderer } from '../render/renderer';
import { drawChart } from './chart';
import { fitCanvas, fmt, h, select, slider, toast, toggle } from './dom';
import { type IconName, icon, setIcon } from './icons';
import { emit, on } from './bus';
import { drawThumb } from './thumb';
import { alpha, boardTheme, onTheme, reducedMotion, tok } from './theme';

type Tool = 'draw' | 'erase' | 'pan';

interface Stamp {
  name: string;
  cells: Cell[];
  rot: number;
  flip: boolean;
}

const HISTORY = 600;

export function createSimulator(root: HTMLElement) {
  let life = new Life(256, 256);
  let palette = getPalette('turns');
  const opts = { grid: true, trails: true, wrap: true, sinceStep: 1 };
  let lastStepAt = 0;
  const view: View = { cx: 128, cy: 128, zoom: 4 };
  let running = true;
  let speed = 30;
  let tool: Tool = 'draw';
  let stamp: Stamp | null = null;
  let seedName = 'Your pattern';
  let active = false;
  let snapshot: { cells: Uint8Array; gen: number } | null = null;
  const pop: number[] = [];
  const births: number[] = [];
  const deaths: number[] = [];
  let hashes: number[] = [];
  let status = '';
  let measuredRate = 0;

  // ---------- DOM ----------
  const glCanvas = h('canvas.sim-gl', { 'aria-label': 'Game of Life grid' });
  const overlay = h('canvas.sim-overlay');
  const ib = (title: string, name: IconName, onclick: () => void) => h('button.icon', { title, 'aria-label': title, onclick }, icon(name));
  const playBtn = h('button.icon.primary', { title: 'Play / pause (Space)', 'aria-label': 'Pause', onclick: () => setRunning(!running) }, icon('pause'));
  const toolBtns: Record<Tool, HTMLButtonElement> = {
    draw: ib('Draw (D)', 'draw', () => setTool('draw')),
    erase: ib('Erase (E)', 'erase', () => setTool('erase')),
    pan: ib('Pan (H). You can also drag with the right mouse button.', 'pan', () => setTool('pan')),
  };
  const toolbar = h(
    'div.toolbar',
    {},
    playBtn,
    ib('Step one generation (N)', 'step', () => stepOnce()),
    ib('Reset to the state when you last pressed play (R)', 'reset', () => reset()),
    h('span.sep'),
    toolBtns.draw,
    toolBtns.erase,
    toolBtns.pan,
    h('span.sep'),
    ib('Zoom in (+)', 'plus', () => zoomBy(1.4)),
    ib('Zoom out (-)', 'minus', () => zoomBy(1 / 1.4)),
    ib('Fit to live cells (0)', 'fit', () => fit()),
    h('span.sep'),
    ib('Random soup', 'dice', () => randomize()),
    ib('Clear (C)', 'clear', () => clearAll()),
  );
  const hud = h('div.hud');
  const stampHint = h('div.stamp-hint');
  // Shown when the board is empty, so a cleared board says what to do next.
  const emptyState = h('div.state.center.empty-board', { hidden: true },
    h('h3', {}, 'The board is empty'),
    h('p', {}, 'Tap points to place stones, pick a pattern from the library, or scatter a random soup and press play.'),
    h('div.actions', {},
      h('button.primary', { onclick: () => { randomize(); setRunning(true); } }, icon('dice'), 'Random soup'),
      h('button', { onclick: () => beginStamp('Glider', patternCells(getPattern('glider')!)) }, 'Place a glider'),
      h('button', { onclick: () => patternsPanel.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' }) }, 'Browse patterns')));
  const stage = h('div.stage', {}, glCanvas, overlay, toolbar, hud, stampHint, emptyState);

  // Stats panel
  const statEls = {
    gen: h('b'), pop: h('b'), density: h('b'), births: h('b'), deaths: h('b'), rate: h('b'), status: h('b.status'),
  };
  const chart = h('canvas.chart');
  const statsPanel = panel(
    'Statistics',
    h(
      'div.stats',
      {},
      stat('Generation', statEls.gen), stat('Population', statEls.pop), stat('Density', statEls.density),
      stat('Births', statEls.births), stat('Deaths', statEls.deaths), stat('Gen / sec', statEls.rate),
    ),
    h('div.status-row', {}, 'State: ', statEls.status),
    chart,
  );

  const speedCtl = slider('Speed', 1, 61, 1, speed, (v) => (speed = v), (v) => (v > 60 ? 'max' : `${v}/s`));
  const runPanel = panel('Speed', speedCtl.el);

  // Rule
  const ruleInput = h('input.rule-input', { type: 'text', value: 'B3/S23', spellcheck: 'false', 'aria-label': 'Rule in B/S notation' });
  const ruleBlurb = h('p.blurb', {}, RULE_PRESETS[0].blurb);
  const rulePreset = select(
    [...RULE_PRESETS.map((r) => ({ value: r.rule, label: `${r.name} (${r.rule})` })), { value: 'custom', label: 'Custom…' }],
    'B3/S23',
    (v) => {
      if (v === 'custom') return ruleInput.focus();
      setRule(v);
    },
  );
  ruleInput.addEventListener('change', () => setRule(ruleInput.value));
  const rulePanel = panel(
    'Rule',
    rulePreset,
    h('div.row', {}, ruleInput, h('button', { onclick: () => setRule(ruleInput.value) }, 'Apply')),
    ruleBlurb,
  );

  // World
  const sizeSel = select(
    [64, 128, 256, 512, 1024].map((n) => ({ value: String(n), label: `${n} × ${n}` })),
    '256',
    (v) => resize(+v),
  );
  let density = 0.3;
  const densityCtl = slider('Soup density', 0.02, 0.9, 0.01, density, (v) => (density = v), (v) => `${Math.round(v * 100)}%`);
  const worldPanel = panel(
    'World',
    h('div.row', {}, h('span', {}, 'Size'), sizeSel),
    toggle('Wrap edges (torus)', opts.wrap, (v) => { opts.wrap = v; life.wrap = v; }).el,
    densityCtl.el,
    h(
      'div.row',
      {},
      h('button', { onclick: () => randomize() }, 'Random soup'),
      h('button', { onclick: () => randomize(true) }, 'Symmetric soup'),
    ),
  );

  // Look
  const trailCtl = slider('Trail length', 1, 60, 1, 25, (v) => (life.trailDecay = Math.round(255 / v)), (v) => `${v} gen`);
  const lookPanel = panel(
    'Appearance',
    h(
      'div.row',
      {},
      h('span', {}, 'Stones'),
      select(PALETTES.map((p) => ({ value: p.id, label: p.name })), palette.id, (v) => {
        palette = getPalette(v);
        renderer.setPalette(palette);
      }),
    ),
    toggle('Board lines', opts.grid, (v) => (opts.grid = v)).el,
    toggle('Marks where stones were lifted', opts.trails, (v) => (opts.trails = v)).el,
    trailCtl.el,
  );

  // Patterns
  const patternList = h('div.pattern-list');
  const thumbs: [HTMLCanvasElement, PatternDef][] = [];
  const cats = [...new Set(PATTERNS.map((p) => p.category))];
  for (const cat of cats) {
    patternList.append(h('h4', {}, cat));
    const grid = h('div.pattern-grid');
    for (const p of PATTERNS.filter((q) => q.category === cat)) {
      const c = h('canvas.thumb');
      thumbs.push([c, p]);
      grid.append(
        h(
          'button.pattern',
          {
            title: `${p.name}: ${p.description}${p.speed ? ` Speed ${p.speed}.` : ''}${p.period ? ` Period ${p.period}.` : ''}`,
            onclick: () => beginStamp(p.name, patternCells(p)),
          },
          c,
          h('span', {}, p.name),
        ),
      );
    }
    patternList.append(grid);
  }
  const patternsPanel = panel('Pattern library', h('p.blurb', {}, 'Pick a pattern, then tap the board to place it. R rotates, F flips, Esc cancels.'), patternList);

  // Import / export
  const recBtn = h('button', { onclick: () => toggleRecording() }, icon('record'), 'Record video');
  const rleBox = h('textarea.rle', { rows: 5, spellcheck: 'false', placeholder: 'Paste RLE or plaintext (O = alive) here…' });
  const ioPanel = panel(
    'Import / export',
    rleBox,
    h(
      'div.row.wrap',
      {},
      h('button', { onclick: () => importText() }, 'Load'),
      h('button', { onclick: () => exportRLE() }, 'Export RLE'),
      h('button', { onclick: () => screenshot() }, 'Save PNG'),
      recBtn,
    ),
  );

  const treeBtn = h('button.primary.wide', { onclick: () => growTree() }, icon('tree'), 'Grow a lineage tree from this pattern');
  const treePanel = panel(
    'Send this pattern to…',
    h('p.blurb', {}, 'The lineage tree follows every object as it splits, merges and dies. Works best on small seeds (methuselahs).'),
    treeBtn,
    h(
      'div.row.wrap',
      {},
      h('button', { onclick: () => sendTo('space') }, icon('cube'), '3D spacetime'),
      h('button', { onclick: () => sendTo('deep') }, icon('forward'), 'Deep time (Hashlife)'),
    ),
  );

  const side = h('aside.side', {}, statsPanel, runPanel, patternsPanel, rulePanel, worldPanel, lookPanel, treePanel, ioPanel);
  root.append(h('div.sim', {}, stage, side));

  const renderer: GridRenderer = createRenderer(glCanvas, palette, boardTheme());
  onTheme(() => { renderer.setTheme(boardTheme()); drawPatternThumbs(); });
  life.trailDecay = Math.round(255 / 25);
  randomize();
  setRunning(true);
  setTool('draw');

  // ---------- behaviour ----------
  function panel(title: string, ...children: (Node | string)[]) {
    return h('section.panel', {}, h('h3', {}, title), ...children);
  }
  function stat(label: string, el: HTMLElement) {
    return h('div.stat', {}, h('span', {}, label), el);
  }

  function setRunning(v: boolean) {
    if (v && !running) snapshot = { cells: life.snapshot(), gen: life.generation };
    if (v && !snapshot) snapshot = { cells: life.snapshot(), gen: life.generation };
    running = v;
    setIcon(playBtn, v ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', v ? 'Pause' : 'Play');
    playBtn.classList.toggle('playing', v);
  }

  function setTool(t: Tool) {
    tool = t;
    for (const [k, b] of Object.entries(toolBtns)) { b.classList.toggle('on', k === t); b.setAttribute('aria-pressed', String(k === t)); }
    overlay.style.cursor = t === 'pan' ? 'grab' : 'crosshair';
  }

  function setRule(text: string) {
    try {
      const r = parseRule(text);
      life.rule = r;
      ruleInput.value = ruleToString(r);
      const preset = RULE_PRESETS.find((p) => p.rule === ruleToString(r));
      rulePreset.value = preset ? preset.rule : 'custom';
      ruleBlurb.textContent = preset ? preset.blurb : 'A custom outer-totalistic rule. One of 262,144 in this family.';
      hashes = [];
    } catch (e) {
      toast((e as Error).message);
    }
  }

  function resize(n: number) {
    const old = life;
    const next = new Life(n, n, old.rule);
    next.wrap = old.wrap;
    next.trailDecay = old.trailDecay;
    // Keep the old content centred.
    const dx = Math.floor((n - old.w) / 2);
    const dy = Math.floor((n - old.h) / 2);
    for (const [x, y] of old.liveCells()) next.set(x + dx, y + dy, 1);
    life = next;
    view.cx = n / 2;
    view.cy = n / 2;
    resetHistory();
    fit(true);
  }

  function resetHistory() {
    pop.length = births.length = deaths.length = 0;
    hashes = [];
    status = '';
  }

  function randomize(symmetric = false) {
    life.randomize(density);
    if (symmetric) {
      for (let y = 0; y < life.h; y++)
        for (let x = 0; x < life.w / 2; x++) {
          const v = life.get(x, y);
          life.set(life.w - 1 - x, y, v);
        }
      for (let y = 0; y < life.h / 2; y++)
        for (let x = 0; x < life.w; x++) life.set(x, life.h - 1 - y, life.get(x, y));
    }
    resetHistory();
    snapshot = { cells: life.snapshot(), gen: 0 };
  }

  function clearAll() {
    life.clear();
    resetHistory();
    setRunning(false);
    snapshot = null;
  }

  function reset() {
    if (!snapshot) return;
    life.restore(snapshot.cells, snapshot.gen);
    resetHistory();
    setRunning(false);
  }

  function stepOnce() {
    setRunning(false);
    doStep();
  }

  function doStep() {
    const s = life.step();
    lastStepAt = performance.now();
    pop.push(s.population);
    births.push(s.births);
    deaths.push(s.deaths);
    if (pop.length > HISTORY) {
      pop.shift();
      births.shift();
      deaths.shift();
    }
    const hsh = life.hash();
    const look = Math.min(hashes.length, 60);
    status = 'evolving';
    if (s.population === 0) status = 'extinct';
    else
      for (let p = 1; p <= look; p++)
        if (hashes[hashes.length - p] === hsh) {
          status = p === 1 ? 'still (period 1)' : `oscillating (period ${p})`;
          break;
        }
    hashes.push(hsh);
    if (hashes.length > 120) hashes.shift();
  }

  function zoomBy(f: number, sx?: number, sy?: number) {
    const W = overlay.clientWidth, H = overlay.clientHeight;
    sx ??= W / 2;
    sy ??= H / 2;
    const before = screenToWorld(sx, sy);
    view.zoom = Math.min(64, Math.max(0.25, view.zoom * f));
    const after = screenToWorld(sx, sy);
    view.cx += before[0] - after[0];
    view.cy += before[1] - after[1];
  }

  function fit(whole = false) {
    const cells = whole ? [] : life.liveCells();
    const b = bounds(cells) ?? { x0: 0, y0: 0, x1: life.w - 1, y1: life.h - 1 };
    const W = overlay.clientWidth || 800, H = overlay.clientHeight || 600;
    const cw = b.x1 - b.x0 + 1, ch = b.y1 - b.y0 + 1;
    view.zoom = Math.min(40, Math.max(0.25, Math.min((W * 0.85) / cw, (H * 0.85) / ch)));
    view.cx = (b.x0 + b.x1 + 1) / 2;
    view.cy = (b.y0 + b.y1 + 1) / 2;
  }

  function screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - overlay.clientWidth / 2) / view.zoom + view.cx, (sy - overlay.clientHeight / 2) / view.zoom + view.cy];
  }

  function beginStamp(name: string, cells: Cell[]) {
    stamp = { name, cells: normalize(cells), rot: 0, flip: false };
    stampHint.textContent = `Placing ${name}: click to place · R rotate · F flip · Esc cancel`;
    stampHint.classList.add('show');
  }

  function stampCells(): Cell[] {
    if (!stamp) return [];
    const t = normalize(transform(stamp.cells, stamp.rot, stamp.flip));
    const b = bounds(t)!;
    const ox = Math.floor((b.x1 + 1) / 2), oy = Math.floor((b.y1 + 1) / 2);
    return t.map(([x, y]) => [x - ox, y - oy] as Cell);
  }

  function endStamp() {
    stamp = null;
    stampHint.classList.remove('show');
  }

  function importText() {
    const text = rleBox.value.trim();
    if (!text) return toast('Paste a pattern first');
    try {
      let cells: Cell[];
      let name = 'Imported pattern';
      if (/^\s*(#|x\s*=)/m.test(text) || /[bo$!]/.test(text.replace(/\s/g, '')) && !/[O*.]/.test(text)) {
        const r = parseRLE(text);
        cells = r.cells;
        if (r.name) name = r.name;
        if (r.rule) setRule(r.rule);
      } else cells = parsePlaintext(text);
      if (!cells.length) return toast('No live cells found in that text');
      beginStamp(name, cells);
      toast(`Loaded ${fmt(cells.length)} cells. Click to place.`);
    } catch (e) {
      toast((e as Error).message);
    }
  }

  function exportRLE() {
    const cells = life.liveCells();
    const text = toRLE(cells, { rule: ruleToString(life.rule), name: `Generation ${life.generation}` });
    rleBox.value = text;
    navigator.clipboard?.writeText(text).then(
      () => toast('RLE copied to clipboard'),
      () => toast('RLE written to the box'),
    );
  }

  // Video capture: MediaRecorder on the canvas stream (WebM, plays in browsers and VLC).
  let recorder: MediaRecorder | null = null;
  function toggleRecording() {
    if (recorder) {
      recorder.stop();
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !glCanvas.captureStream) return toast('Video recording is not supported in this browser');
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return toast('No supported video format in this browser');
    const chunks: Blob[] = [];
    const startGen = life.generation;
    recorder = new MediaRecorder(glCanvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 8_000_000 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type });
      const a = document.createElement('a');
      a.download = `life-${seedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-gen${startGen}-${life.generation}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      recorder = null;
      setIcon(recBtn, 'record', 'Record video');
      recBtn.classList.remove('recording');
      toast(`Saved ${(blob.size / 1e6).toFixed(1)} MB video`);
    };
    recorder.start(250);
    setIcon(recBtn, 'stop', 'Stop recording');
    recBtn.classList.add('recording');
    toast('Recording… press Stop to save');
  }

  function screenshot() {
    draw();
    const a = document.createElement('a');
    a.download = `life-gen-${life.generation}.png`;
    a.href = glCanvas.toDataURL('image/png');
    a.click();
  }

  function growTree() {
    const cells = life.liveCells();
    if (!cells.length) return toast('Draw or place a pattern first');
    if (cells.length > 2500) return toast('That is a lot of cells. Try a smaller seed (under 2,500 cells).');
    emit('lineage:load', { cells: normalize(cells), name: seedName });
    emit('navigate', { route: 'lineage' });
  }

  function sendTo(route: 'space' | 'deep') {
    const cells = life.liveCells();
    if (!cells.length) return toast('Draw or place a pattern first');
    if (route === 'space' && cells.length > 4000) return toast('Too many cells for the 3D view. Try a smaller pattern.');
    // Centre the pattern on the origin so wrapped coordinates don't matter.
    const n = normalize(cells);
    emit(route === 'space' ? 'space:load' : 'deep:load', { cells: n, name: seedName });
    emit('navigate', { route });
  }

  on('sim:load', ({ cells, name, rule }) => {
    if (rule) setRule(rule);
    life.clear();
    resetHistory();
    const b = bounds(cells)!;
    const ox = Math.floor(life.w / 2 - (b.x1 - b.x0) / 2) - b.x0;
    const oy = Math.floor(life.h / 2 - (b.y1 - b.y0) / 2) - b.y0;
    life.stamp(cells, ox, oy);
    snapshot = { cells: life.snapshot(), gen: 0 };
    setRunning(false);
    fit();
    toast(`Loaded ${name}`);
  });

  function drawPatternThumbs() {
    const col = tok('--ink');
    for (const [c, p] of thumbs) drawThumb(c, patternCells(p), col);
  }

  // ---------- input ----------
  const pointers = new Map<number, { x: number; y: number }>();
  let painting: { value: number; last: [number, number] } | null = null;
  let panning: { x: number; y: number; cx: number; cy: number } | null = null;
  let pinch: { d: number; zoom: number; mid: [number, number]; cx: number; cy: number } | null = null;
  let hover: [number, number] | null = null;

  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  overlay.addEventListener('pointerdown', (e) => {
    overlay.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      painting = null;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], cx: view.cx, cy: view.cy };
      return;
    }
    if (e.button === 1 || e.button === 2 || tool === 'pan') {
      panning = { x: p.x, y: p.y, cx: view.cx, cy: view.cy };
      overlay.style.cursor = 'grabbing';
      return;
    }
    const [wx, wy] = screenToWorld(p.x, p.y).map(Math.floor) as [number, number];
    if (stamp) {
      for (const [x, y] of stampCells()) life.set(wx + x, wy + y, 1);
      seedName = life.population() === stamp.cells.length ? stamp.name : 'Your pattern';
      if (!e.shiftKey) endStamp();
      return;
    }
    const value = tool === 'erase' ? 0 : life.get(wx, wy) ? 0 : 1;
    painting = { value, last: [wx, wy] };
    seedName = 'Your pattern';
    life.set(wx, wy, value);
  });
  overlay.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    hover = screenToWorld(p.x, p.y).map(Math.floor) as [number, number];
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      view.zoom = Math.min(64, Math.max(0.25, (pinch.zoom * d) / pinch.d));
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      view.cx = pinch.cx - (mid[0] - pinch.mid[0]) / view.zoom;
      view.cy = pinch.cy - (mid[1] - pinch.mid[1]) / view.zoom;
      return;
    }
    if (panning) {
      view.cx = panning.cx - (p.x - panning.x) / view.zoom;
      view.cy = panning.cy - (p.y - panning.y) / view.zoom;
      return;
    }
    if (painting) {
      const [x0, y0] = painting.last;
      const [x1, y1] = hover;
      line(x0, y0, x1, y1, (x, y) => life.set(x, y, painting!.value));
      painting.last = hover;
    }
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    painting = null;
    if (panning) {
      panning = null;
      overlay.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
    }
  };
  overlay.addEventListener('pointerup', end);
  overlay.addEventListener('pointercancel', end);
  overlay.addEventListener('pointerleave', () => (hover = null));
  overlay.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const p = local(e);
      zoomBy(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (!active) return;
    const tgt = e.target as HTMLElement;
    if (tgt && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      setRunning(!running);
    } else if (k === 'n' || k === '.') stepOnce();
    else if (k === 'c') clearAll();
    else if (k === 'd') setTool('draw');
    else if (k === 'e') setTool('erase');
    else if (k === 'h') setTool('pan');
    else if (k === '+' || k === '=') zoomBy(1.4);
    else if (k === '-') zoomBy(1 / 1.4);
    else if (k === '0') fit();
    else if (k === 'escape') endStamp();
    else if (k === 'r') {
      if (stamp) stamp.rot = (stamp.rot + 1) % 4;
      else reset();
    } else if (k === 'f' && stamp) stamp.flip = !stamp.flip;
  });

  function local(e: MouseEvent) {
    const r = overlay.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  // ---------- loop ----------
  let acc = 0;
  let last = performance.now();
  let rateWindow: number[] = [];
  let lastStats = 0;

  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!active) return;
    if (running) {
      if (speed > 60) {
        const t0 = performance.now();
        let n = 0;
        while (performance.now() - t0 < 12 && n < 400) {
          doStep();
          n++;
        }
        rateWindow.push(n);
      } else {
        acc += dt * speed;
        let n = 0;
        while (acc >= 1 && n < 60) {
          doStep();
          acc -= 1;
          n++;
        }
        if (n >= 60) acc = 0;
        rateWindow.push(n);
      }
    } else rateWindow.push(0);
    if (rateWindow.length > 30) rateWindow.shift();
    measuredRate = (rateWindow.reduce((a, b) => a + b, 0) / Math.max(1, rateWindow.length)) / Math.max(dt, 1 / 240);
    draw();
    if (now - lastStats > 120) {
      lastStats = now;
      updateStats();
    }
  }

  function draw() {
    fitCanvas(glCanvas);
    fitCanvas(overlay);
    // Stones only animate at speeds slow enough to see it; faster runs show the settled board.
    opts.sinceStep = reducedMotion() || (running && speed > 12) ? 1 : (performance.now() - lastStepAt) / 1000;
    renderer.draw(life, view, opts);
    drawOverlay();
  }

  function drawOverlay() {
    const ctx = overlay.getContext('2d')!;
    const dpr = overlay.width / Math.max(1, overlay.clientWidth);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = overlay.clientWidth, H = overlay.clientHeight;
    ctx.clearRect(0, 0, W, H);
    const z = view.zoom;
    const sx = (x: number) => (x - view.cx) * z + W / 2;
    const sy = (y: number) => (y - view.cy) * z + H / 2;
    // World border
    ctx.strokeStyle = alpha('--ink', 0.35);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(sx(0), sy(0), life.w * z, life.h * z);
    ctx.setLineDash([]);
    if (hover && !panning) {
      if (stamp) {
        // A ghost of the pattern, as stones held just above the board.
        ctx.fillStyle = alpha('--slate', 0.45);
        for (const [x, y] of stampCells()) {
          if (z >= 5) { ctx.beginPath(); ctx.arc(sx(hover[0] + x + 0.5), sy(hover[1] + y + 0.5) - z * 0.08, z * 0.44, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(sx(hover[0] + x), sy(hover[1] + y), z, z);
        }
      } else if (z >= 4) {
        ctx.strokeStyle = alpha('--ink', 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx(hover[0] + 0.5), sy(hover[1] + 0.5), Math.max(2, z * 0.47), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function updateStats() {
    const p = pop.length ? pop[pop.length - 1] : life.population();
    statEls.gen.textContent = fmt(life.generation);
    statEls.pop.textContent = fmt(p);
    statEls.density.textContent = `${((p / (life.w * life.h)) * 100).toFixed(2)}%`;
    statEls.births.textContent = fmt(births.at(-1) ?? 0);
    statEls.deaths.textContent = fmt(deaths.at(-1) ?? 0);
    statEls.rate.textContent = running ? measuredRate.toFixed(0) : '0';
    statEls.status.textContent = status || (running ? 'evolving' : 'paused');
    statEls.status.dataset.s = status.split(' ')[0];
    emptyState.hidden = p > 0 || !!stamp;
    hud.textContent = `Generation ${fmt(life.generation)} · ${fmt(p)} stones · ${life.rule.name}${renderer.kind === 'webgl2' ? '' : ' · Canvas mode'}${hover ? ` · ${hover[0]}, ${hover[1]}` : ''}`;
    const start = Math.max(0, life.generation - pop.length);
    const xs = pop.map((_, i) => start + i + 1);
    drawChart(
      chart,
      [
        { values: pop, xs, color: tok('--ink'), label: 'population', fill: true },
        { values: births, xs, color: tok('--data-pine'), label: 'births', width: 1 },
        { values: deaths, xs, color: tok('--data-shu'), label: 'deaths', width: 1 },
      ],
      { legend: true },
    );
  }

  requestAnimationFrame(frame);

  return {
    activate() {
      active = true;
      last = performance.now();
      requestAnimationFrame(() => {
        draw();
        if (!thumbsDrawn) {
          drawPatternThumbs();
          thumbsDrawn = true;
        }
        if (!fitted) {
          // Open close enough that cells read as stones on a board.
          view.cx = life.w / 2;
          view.cy = life.h / 2;
          view.zoom = 11;
          fitted = true;
        }
      });
    },
    deactivate() {
      active = false;
    },
  };
}

let thumbsDrawn = false;
let fitted = false;

/** Bresenham line between two cells. */
function line(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    plot(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
