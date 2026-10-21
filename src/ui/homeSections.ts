/**
 * Home page sections below the story: a toy that shows the whole rule on one
 * neighbourhood, a band of numbers, and cards for every view whose little
 * boards come alive when you point at them.
 */
import { type Cell, bounds, evolveSparse } from '../engine/life';
import { getPattern, patternCells } from '../engine/patterns';
import { fmt, h } from './dom';
import { icon } from './icons';
import { CellPainter } from './thumb';
import { alpha, onTheme, reducedMotion, tok } from './theme';

// ---------- the rule toy ----------

const DIRS = ['north-west', 'north', 'north-east', 'west', '', 'east', 'south-west', 'south', 'south-east'];

type Outcome = 'stays' | 'born' | 'lonely' | 'crowded' | 'empty';
const VERDICT: Record<Outcome, string> = {
  stays: 'stays. A stone with two or three neighbours survives.',
  born: 'gets a new stone. An empty point with exactly three neighbours is born.',
  lonely: 'comes off. A stone with fewer than two neighbours dies of loneliness.',
  crowded: 'comes off. A stone with more than three neighbours is crowded out.',
  empty: 'stays empty. An empty point needs exactly three neighbours.',
};

export function ruleToy() {
  // Start on the most interesting case: three neighbours around an empty point.
  const on = [true, false, true, false, false, false, false, true, false];
  const pts = DIRS.map((d, i) => {
    const b = h('button.rt-pt', { type: 'button', 'aria-pressed': String(on[i]), 'aria-label': i === 4 ? 'The middle point' : `Neighbour to the ${d}` }, h('i'));
    b.addEventListener('click', () => { on[i] = !on[i]; b.setAttribute('aria-pressed', String(on[i])); update(true); });
    return b;
  });
  const ghosts = DIRS.map(() => h('span.rt-pt', {}, h('i')) as HTMLElement);
  const countEl = h('b.rt-count', {}, '0');
  const countWord = h('span', {}, 'neighbours');
  const verdict = h('p.rt-verdict', { 'aria-live': 'polite' });
  const next = ghosts[4];

  function update(animate: boolean) {
    const n = on.reduce((s, x, i) => s + (i !== 4 && x ? 1 : 0), 0);
    const alive = on[4];
    const out: Outcome = alive ? (n < 2 ? 'lonely' : n > 3 ? 'crowded' : 'stays') : n === 3 ? 'born' : 'empty';
    countEl.textContent = String(n);
    countWord.textContent = n === 1 ? 'neighbour' : 'neighbours';
    verdict.replaceChildren(h('b', {}, alive ? 'The stone in the middle ' : 'The empty middle point '), VERDICT[out]);
    ghosts.forEach((g, i) => { if (i !== 4) g.classList.toggle('on', on[i]); });
    next.className = 'rt-pt';
    // Restart the animation even when the outcome is the same as before.
    void next.offsetWidth;
    next.classList.add(`is-${out}`);
    if (!animate || reducedMotion()) next.classList.add('still');
  }
  update(false);

  return h('section.home-section.rule-section', { 'aria-labelledby': 'h-rule' },
    h('h2', { id: 'h-rule' }, 'The whole rule, on nine points'),
    h('p.intro', {}, 'Tap the points around the middle, or the middle itself. What happens to the middle point next turn depends only on how many of its eight neighbours hold a stone.'),
    h('div.rt', {},
      h('figure.rt-side', {}, h('div.rt-grid', { role: 'group', 'aria-label': 'This turn' }, ...pts), h('figcaption', {}, 'This turn')),
      h('div.rt-mid', { 'aria-hidden': 'true' }, countEl, countWord, icon('arrow')),
      h('figure.rt-side', {}, h('div.rt-grid.next', { 'aria-hidden': 'true' }, ...ghosts), h('figcaption', {}, 'Next turn')),
      verdict));
}

// ---------- numbers ----------

export function numberBand() {
  // null is 2^50, written with a superscript.
  const items: [number | null, string][] = [
    [1970, 'The year Conway settled the rules, by hand on a Go board.'],
    [1103, 'Generations five stones take to settle, from the R-pentomino.'],
    [262144, 'Life-like rules, eighteen of them running side by side in the atlas.'],
    [null, 'Generations ahead that Deep time can jump in one go.'],
  ];
  const nums: { el: HTMLElement; to: number }[] = [];
  const list = h('ul.numbers', {}, ...items.map(([to, label]) => {
    const b = h('b.num.readout', {}, to === null ? '' : to === 1970 ? '1970' : fmt(to));
    if (to === null) b.append('2', h('sup', {}, '50'));
    else if (to !== 1970) nums.push({ el: b, to });
    return h('li', {}, b, h('span', {}, label));
  }));
  const el = h('section.home-section.numbers-section', { 'aria-labelledby': 'h-numbers' }, h('h2', { id: 'h-numbers' }, 'Life in four numbers'), list);

  // The counts run up once, the first time they come into view.
  if (!reducedMotion() && 'IntersectionObserver' in window) {
    nums.forEach((n) => (n.el.textContent = '0'));
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 1100);
        const e = 1 - Math.pow(1 - k, 4);
        nums.forEach((n) => (n.el.textContent = fmt(Math.round(n.to * e))));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, { threshold: 0.4 });
    io.observe(list);
  }
  return el;
}

// ---------- view cards ----------

interface Card { route: string; name: string; what: string; pattern: string }
const GROUPS: [string, Card[]][] = [
  ['Watch it run', [
    { route: 'sim', name: 'Board', what: 'Draw, run and record patterns on a board up to 1,024 lines wide.', pattern: 'gosper' },
    { route: 'space', name: 'Spacetime', what: 'Stack the generations into a 3D sculpture you can turn.', pattern: 'pulsar' },
    { route: 'deep', name: 'Deep time', what: 'Jump up to 2^50 generations ahead with the Hashlife algorithm.', pattern: 'acorn' },
  ]],
  ['Trace where it came from', [
    { route: 'lineage', name: 'Lineage', what: 'A family tree of every object: which ones split, merged and died.', pattern: 'rpentomino' },
    { route: 'ancestors', name: 'Ancestors', what: 'Run the board backwards to find what could have come before.', pattern: 'piheptomino' },
    { route: 'basins', name: 'State space', what: 'Map every state of a small board to where it ends up.', pattern: 'toad' },
  ]],
  ['Try other rules', [
    { route: 'atlas', name: 'Rule atlas', what: 'Eighteen of the 262,144 Life-like rules running side by side, sorted by behaviour.', pattern: 'bheptomino' },
    { route: 'evolve', name: 'Evolution', what: 'Breed rules with a genetic algorithm and watch them get better at a task.', pattern: 'lwss' },
    { route: 'puzzles', name: 'Puzzles', what: 'Ten challenges, from a still life to a spaceship, checked by the engine.', pattern: 'glider' },
  ]],
  ['Understand it', [
    { route: 'math', name: 'Math', what: 'Nineteen sections, from the rules themselves to running time backwards.', pattern: 'pentadecathlon' },
    { route: 'apps', name: 'Applications', what: 'Live models of traffic, heart rhythms, snowflakes and more.', pattern: 'rabbits' },
  ]],
];

const FRAMES = 32;

/** A small board that plays a pattern while you point at its card, and rests on its first generation otherwise. */
function livingThumb(id: string) {
  const canvas = h('canvas.vc-thumb', { 'aria-hidden': 'true' });
  let frames: Cell[][] | null = null;
  let box = { x0: 0, y0: 0, x1: 1, y1: 1 };
  let f = 0, timer = 0, hold = 0;

  function ensure() {
    if (frames) return frames;
    const first = patternCells(getPattern(id)!);
    frames = [first];
    for (let i = 1; i < FRAMES; i++) frames.push(evolveSparse(frames[i - 1], 1));
    const all = frames.flat();
    const b = bounds(all)!;
    box = { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 };
    return frames;
  }

  function draw() {
    const fr = ensure();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, W, H);
    const cw = box.x1 - box.x0 + 1, ch = box.y1 - box.y0 + 1;
    const s = Math.min(W / cw, H / ch, 16);
    const ox = (W - cw * s) / 2, oy = (H - ch * s) / 2;
    if (s >= 6) {
      ctx.strokeStyle = alpha('--board-line', 0.32);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ox % s + s / 2; x < W; x += s) { const q = Math.round(x) + 0.5; ctx.moveTo(q, 0); ctx.lineTo(q, H); }
      for (let y = oy % s + s / 2; y < H; y += s) { const q = Math.round(y) + 0.5; ctx.moveTo(0, q); ctx.lineTo(W, q); }
      ctx.stroke();
    }
    const p = new CellPainter(s);
    for (const [x, y] of fr[f]) p.add(ox + (x - box.x0) * s, oy + (y - box.y0) * s);
    p.fill(ctx, '--slate');
  }

  function play() {
    if (timer || reducedMotion()) return;
    hold = 0;
    timer = window.setInterval(() => {
      if (f === FRAMES - 1) { if (++hold < 6) return; f = 0; hold = 0; }
      else f++;
      draw();
    }, 110);
  }
  function stop() { clearInterval(timer); timer = 0; f = 0; draw(); }
  return { canvas, draw, play, stop };
}

export function viewCards() {
  const thumbs: ReturnType<typeof livingThumb>[] = [];
  const card = (c: Card) => {
    const t = livingThumb(c.pattern);
    thumbs.push(t);
    const a = h('a.vc', { href: `#${c.route}` }, t.canvas, h('div.vc-text', {}, h('b', {}, c.name, icon('arrow')), h('span', {}, c.what)));
    a.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType !== 'touch') t.play(); });
    a.addEventListener('pointerleave', () => t.stop());
    a.addEventListener('focus', () => t.play());
    a.addEventListener('blur', () => t.stop());
    return h('li', {}, a);
  };
  const el = h('section.home-section.views-section', { 'aria-labelledby': 'h-views' },
    h('h2', { id: 'h-views' }, 'Eleven ways to read one board'),
    h('p.intro', {}, 'Every view starts from the same board. Draw something once, then follow it forward in time, backward to its possible parents, across other rules, or into the maths behind it. Point at a card to see its board move.'),
    h('div.vc-groups', {}, ...GROUPS.map(([title, cards]) => h('div.vc-group', {}, h('h3', {}, title), h('ul', {}, ...cards.map(card))))));

  const paint = () => thumbs.forEach((t) => t.draw());
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); paint(); } });
    io.observe(el);
  }
  onTheme(paint);
  window.addEventListener('resize', paint);
  return { el, paint };
}
