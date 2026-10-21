/**
 * The opening of the home page: a scroll story on a 3D Go board.
 *
 * The page scrolls normally; a stage stays pinned while you pass through four
 * chapters, and your scroll position drives what happens on the board:
 * five stones drop into place, the rule runs generation by generation, then
 * every generation is kept and stacked into a tower you see from the side.
 * Scroll back up and it all runs backwards. Nothing plays on its own except a
 * slow drift of the camera, and with reduced motion the camera holds still
 * and stones appear without falling.
 */
import { Board3D, type Board3DColors, STONE_STRIDE } from '../render/board3d';
import { lookAt, multiply, perspective } from '../render/spacetime';
import { getPattern, patternCells } from '../engine/patterns';
import { bounds, normalize } from '../engine/life';
import { fmt, h } from './dom';
import { icon } from './icons';
import { isDark, onTheme, reducedMotion, rgb } from './theme';

const N = 19;
const G = 48;          // generations in the run and in the tower
const GAP = 0.44;      // height of one generation in the tower, in board lines
const TOWER_SCALE = 0.9;

/** Scroll ranges (0..1 through the stage) for each chapter's action. */
const PLACE = [0.1, 0.3] as const;
const RUN = [0.35, 0.6] as const;
const BRIDGE = [0.6, 0.66] as const;
const TOWER = [0.66, 0.94] as const;

/** When each chapter's words are on screen: fade in, hold, fade out. */
const CHAPTERS: [number, number][] = [[-1, 0.09], [0.12, 0.31], [0.35, 0.61], [0.66, 2]];

interface Key { p: number; yaw: number; pitch: number; dist: number; ty: number }
const KEYS: Key[] = [
  { p: 0, yaw: -0.6, pitch: 0.34, dist: 33, ty: 0 },
  { p: 0.12, yaw: -0.38, pitch: 0.6, dist: 37, ty: 0 },
  { p: 0.31, yaw: -0.14, pitch: 0.92, dist: 37, ty: 0 },
  { p: 0.4, yaw: 0, pitch: 1.22, dist: 37, ty: 0 },
  { p: 0.6, yaw: 0.12, pitch: 1.22, dist: 37, ty: 0 },
  { p: 0.68, yaw: 0.35, pitch: 0.8, dist: 44, ty: 2.5 },
  { p: 0.94, yaw: 1.55, pitch: 0.3, dist: 66, ty: 10.5 },
];
/** With reduced motion the camera doesn't fly: each chapter has one still view. */
const STILL: Key[] = [KEYS[0], KEYS[2], KEYS[3], KEYS[6]];

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x: number) => x * x * (3 - 2 * x);
const span = (p: number, r: readonly [number, number]) => clamp((p - r[0]) / (r[1] - r[0]));

/** Run the R-pentomino on a bounded 19×19 board and remember every generation and who was born when. */
function history() {
  const cells = normalize(patternCells(getPattern('rpentomino')!));
  const b = bounds(cells)!;
  const ox = Math.floor((N - (b.x1 + 1)) / 2) + 1, oy = Math.floor((N - (b.y1 + 1)) / 2);
  const frames: Uint8Array[] = [];
  const colours: Uint8Array[] = [];
  let alive = new Uint8Array(N * N);
  let colour = new Uint8Array(N * N);
  for (const [x, y] of cells) alive[(y + oy) * N + x + ox] = 1;
  frames.push(alive); colours.push(colour);
  for (let gen = 0; gen < G; gen++) {
    const nx = new Uint8Array(N * N), nc = new Uint8Array(colour);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N) n += alive[yy * N + xx];
      }
      const i = y * N + x;
      nx[i] = n === 3 || (n === 2 && alive[i]) ? 1 : 0;
      // Births alternate black and white by generation, as on the main board.
      if (nx[i] && !alive[i]) nc[i] = (gen + 1) % 2;
    }
    alive = nx; colour = nc;
    frames.push(alive); colours.push(colour);
  }
  // The order the first five stones go down in: reading order, as by hand.
  const order: number[] = [];
  for (let i = 0; i < N * N; i++) if (frames[0][i]) order.push(i);
  return { frames, colours, order };
}

export function createStory(opts: { onOpenBoard: () => void }) {
  const { frames, colours, order } = history();
  const towerStones = frames.reduce((s, f) => s + f.reduce((a, x) => a + x, 0), 0);

  const canvas = h('canvas.story-canvas', { role: 'img', 'aria-label': 'An empty Go board, seen from low down at its edge.' });
  const genEl = h('span.readout', {}, 'Generation 0');
  const towerEl = h('span.readout', {}, '');
  const cue = h('div.story-cue', { 'aria-hidden': 'true' }, h('i'), 'Scroll');
  const rail = h('ol.story-rail', { 'aria-hidden': 'true' }, h('li'), h('li'), h('li'), h('li'));

  const chapters = [
    h('article.story-ch.ch-title', {},
      h('h1', {}, 'Life began on a Go board.'),
      h('p.lede', {}, 'In 1970 John Conway and his students in Cambridge worked out the Game of Life by hand, with stones on a Go board. Life Tree gives you that board, then lets you follow every stone forward, backward and into the math behind it.'),
      h('div.actions', {},
        h('button.primary', { type: 'button', onclick: () => opts.onOpenBoard() }, 'Open the board', icon('arrow')),
        h('a.cta-link', { href: '#math' }, 'How the rules work'))),
    h('article.story-ch', {},
      h('p.story-kicker', {}, 'One'),
      h('h2', {}, 'Five stones.'),
      h('p', {}, 'This is the R-pentomino, one of the first patterns Conway’s group tried. It looks like nothing much. On an open board it keeps changing for 1,103 generations.')),
    h('article.story-ch', {},
      h('p.story-kicker', {}, 'Two'),
      h('h2', {}, 'One rule.'),
      h('p', {}, 'Every turn, a stone with two or three neighbours stays. An empty point with exactly three neighbours gets a new stone. Every other stone comes off the board.'),
      h('p.story-meter', {}, genEl)),
    h('article.story-ch', {},
      h('p.story-kicker', {}, 'Three'),
      h('h2', {}, 'Time is the third dimension.'),
      h('p', {}, 'Run it again, but keep every generation and stack it on the last. The whole life of a pattern becomes one shape you can walk around.'),
      h('p.story-meter', {}, towerEl),
      h('div.actions', {}, h('a.button.primary', { href: '#space' }, 'Turn it in 3D', icon('arrow')))),
  ];
  const copy = h('div.story-copy', {}, ...chapters);
  const stage = h('div.story-stage', {}, canvas, copy, rail, cue);
  const el = h('section.story', { 'aria-label': 'Introduction' }, stage);

  let gl: Board3D | null = null;
  const colors = (): Board3DColors => ({ board: rgb('--board'), edge: rgb('--board-edge'), line: rgb('--board-line'), slate: rgb('--slate'), shell: rgb('--shell'), dark: isDark() });
  try {
    gl = new Board3D(canvas, N, colors());
  } catch (e) {
    // No WebGL2: the chapters become an ordinary stack of paragraphs.
    console.warn(e);
    el.classList.add('flat');
  }

  const data = new Float32Array(Math.max(towerStones, N * N * 2) * STONE_STRIDE);
  let progress = -1, active = false, visible = false, raf = 0, t0 = performance.now();
  const ptr = { x: 0, z: 0, nx: 0, ny: 0, on: 0, target: 0 };
  const cam = { yaw: 0, pitch: 0, dist: 30, ty: 0 };

  function readProgress() {
    const r = el.getBoundingClientRect();
    const total = el.offsetHeight - stage.offsetHeight;
    return total > 0 ? clamp(-r.top / total) : 0;
  }

  /** Fill the instance buffer for scroll position p. */
  function build(p: number) {
    const still = reducedMotion();
    let k = 0;
    const put = (i: number, lift: number, c: number, a: number, s = 1) => {
      const o = k * STONE_STRIDE;
      data[o] = i % N; data[o + 1] = lift; data[o + 2] = Math.floor(i / N); data[o + 3] = s;
      data[o + 4] = c; data[o + 5] = a; data[o + 6] = ((i * 0.618034) % 1); data[o + 7] = 0;
      k++;
    };
    if (p < RUN[0]) {
      // Chapter one: the stones drop in one at a time.
      const u = span(p, PLACE) * order.length;
      order.forEach((i, j) => {
        const d = clamp(u - j);
        if (d <= 0) return;
        put(i, still ? 0 : 5 * Math.pow(1 - d, 2.4), 0, clamp(d * 3));
      });
    } else if (p < BRIDGE[0]) {
      // Chapter two: generation by generation. Newborns fall in, the dead lift away.
      const fg = span(p, RUN) * G;
      const f = Math.min(G - 1, Math.floor(fg)), t = fg - f;
      const a = frames[f], b = frames[f + 1];
      for (let i = 0; i < N * N; i++) {
        if (a[i] && b[i]) put(i, 0, colours[f][i], 1);
        else if (a[i]) put(i, still ? 0 : ease(t) * 1.4, colours[f][i], 1 - ease(t));
        else if (b[i]) put(i, still ? 0 : 1.6 * Math.pow(1 - t, 2), colours[f + 1][i], clamp(t * 2.5));
      }
      genEl.textContent = `Generation ${t < 0.5 ? f : f + 1} of ${G}`;
    } else if (p < TOWER[0]) {
      // Between chapters: the last generation clears and the first comes back.
      const t = ease(span(p, BRIDGE));
      for (let i = 0; i < N * N; i++) {
        if (frames[G][i]) put(i, still ? 0 : t * 2, colours[G][i], 1 - t);
        if (frames[0][i]) put(i, 0, 0, t);
      }
      genEl.textContent = `Generation ${G} of ${G}`;
    } else {
      // Chapter three: each generation is kept and the next is laid on top.
      const m = span(p, TOWER) * G;
      const top = Math.floor(m), t = m - top;
      let shown = 0;
      for (let g = 0; g <= Math.min(G, top + 1); g++) {
        const isNew = g === top + 1;
        if (isNew && top >= G) break;
        const lift = g * GAP + (isNew && !still ? (1 - ease(t)) * 1.5 : 0);
        const a = isNew ? clamp(t * 2.5) : 1;
        if (isNew && a <= 0) break;
        for (let i = 0; i < N * N; i++) if (frames[g][i]) { put(i, lift, colours[g][i], a, g === 0 ? 1 : TOWER_SCALE); if (!isNew) shown++; }
      }
      towerEl.textContent = `${Math.min(G, top) + 1} generations, ${fmt(shown)} stones`;
    }
    gl!.setStones(data, k);
  }

  function camera(p: number, time: number) {
    let key: Key;
    if (reducedMotion()) {
      key = STILL[chapterAt(p)];
    } else {
      let i = 0;
      while (i < KEYS.length - 1 && KEYS[i + 1].p <= p) i++;
      const a = KEYS[i], b = KEYS[Math.min(KEYS.length - 1, i + 1)];
      const t = b === a ? 0 : ease(clamp((p - a.p) / (b.p - a.p)));
      key = { p, yaw: a.yaw + (b.yaw - a.yaw) * t, pitch: a.pitch + (b.pitch - a.pitch) * t, dist: a.dist + (b.dist - a.dist) * t, ty: a.ty + (b.ty - a.ty) * t };
    }
    const sway = reducedMotion() ? 0 : Math.sin(time * 0.22) * 0.05;
    const par = reducedMotion() ? 0 : 1;
    // The camera eases toward its key, so pointer parallax and scroll both feel weighted.
    const k = reducedMotion() ? 1 : 0.14;
    cam.yaw += (key.yaw + sway + ptr.nx * 0.07 * par - cam.yaw) * k;
    cam.pitch += (key.pitch - ptr.ny * 0.04 * par - cam.pitch) * k;
    cam.dist += (key.dist - cam.dist) * k;
    cam.ty += (key.ty - cam.ty) * k;
    const settled = Math.abs(key.yaw + sway + ptr.nx * 0.07 * par - cam.yaw) < 1e-4 && Math.abs(key.dist - cam.dist) < 1e-3;
    return settled;
  }

  function chapterAt(p: number) {
    let c = 0;
    CHAPTERS.forEach(([a], i) => { if (p >= a) c = i; });
    return c;
  }

  function paintCopy(p: number) {
    const still = reducedMotion();
    chapters.forEach((ch, i) => {
      const [a, b] = CHAPTERS[i];
      const fade = 0.035;
      const o = clamp(Math.min((p - a) / fade, (b - p) / fade));
      ch.style.opacity = String(o);
      ch.style.transform = still ? '' : `translateY(${(1 - o) * (p < a + fade ? 24 : -24)}px)`;
      ch.classList.toggle('on', o > 0.5);
    });
    const c = chapterAt(p);
    [...rail.children].forEach((li, i) => li.classList.toggle('on', i === c));
    cue.style.opacity = String(clamp(1 - p * 25));
    const labels = [
      'An empty Go board, seen from low down at its edge.',
      `The R-pentomino going down on the board: ${Math.round(span(p, PLACE) * 5)} of 5 stones placed.`,
      `The R-pentomino running on the board, seen from above. ${genEl.textContent}.`,
      `A tower of stones: each generation of the R-pentomino stacked on the one before. ${towerEl.textContent}.`,
    ];
    canvas.setAttribute('aria-label', labels[c]);
  }

  function frame(now: number) {
    raf = 0;
    if (!gl || !active || !visible) return;
    const p = readProgress();
    if (p !== progress) { progress = p; build(p); paintCopy(p); }
    ptr.on += (ptr.target - ptr.on) * 0.12;
    const settled = camera(p, (now - t0) / 1000);
    draw();
    // Keep drawing while the camera drifts; with reduced motion, only until it lands.
    if (!reducedMotion() || !settled || Math.abs(ptr.target - ptr.on) > 0.01) raf = requestAnimationFrame(frame);
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = canvas.clientWidth, hh = canvas.clientHeight;
    if (!w || !hh) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hh * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hh * dpr); }
    const target = [0, cam.ty, 0];
    const cp = Math.cos(cam.pitch);
    // Portrait screens stand further back so the whole board, and the whole tower, fits across.
    const dist = cam.dist * (w / hh < 1 ? 1.3 : 1);
    const eye = [target[0] + dist * cp * Math.sin(cam.yaw), target[1] + dist * Math.sin(cam.pitch), target[2] + dist * cp * Math.cos(cam.yaw)];
    const wide = w > 900;
    const aspect = w / hh;
    // Narrow screens see more of the board by widening the lens; wide ones push the board right of the words.
    const fov = aspect < 1 ? 0.62 / Math.max(0.55, aspect) : 0.62;
    const proj = perspective(fov, aspect, 0.5, 400);
    const shift = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    shift[12] = wide ? 0.32 : 0;
    shift[13] = wide ? 0 : 0.3;
    const viewProj = multiply(shift, multiply(proj, lookAt(eye, target, [0, 1, 0])));
    const key = [-0.5, 0.9, 0.42];
    const kl = Math.hypot(key[0], key[1], key[2]);
    gl!.draw({ eye, viewProj }, {
      key: key.map((v) => v / kl),
      pointer: [ptr.x, 5, ptr.z, ptr.on * 0.9],
      hover: [ptr.x, ptr.z, reducedMotion() ? 0 : ptr.on],
    });
  }

  function kick() {
    if (!raf && gl && active && visible) raf = requestAnimationFrame(frame);
  }

  // The pointer light and the hover lift: a mouse or pen only, so a scrolling finger doesn't drag light around.
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !gl) return;
    const rc = canvas.getBoundingClientRect();
    ptr.nx = ((e.clientX - rc.left) / rc.width) * 2 - 1;
    ptr.ny = ((e.clientY - rc.top) / rc.height) * 2 - 1;
    const hit = gl.pick(e.clientX - rc.left, e.clientY - rc.top);
    if (hit && !reducedMotion()) { ptr.x = hit.x; ptr.z = hit.z; ptr.target = 1; }
    else ptr.target = 0;
    kick();
  });
  canvas.addEventListener('pointerleave', () => { ptr.target = 0; ptr.nx = 0; ptr.ny = 0; kick(); });

  // Tabbing to a link in a chapter that isn't showing scrolls the page to that chapter.
  chapters.forEach((ch, i) => ch.addEventListener('focusin', () => {
    if (ch.classList.contains('on') || el.classList.contains('flat')) return;
    const [a, b] = CHAPTERS[i];
    const p = clamp((Math.max(0, a) + Math.min(1, b)) / 2);
    const total = el.offsetHeight - stage.offsetHeight;
    window.scrollTo({ top: el.offsetTop + p * total, behavior: 'instant' as ScrollBehavior });
  }));

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', () => { progress = -1; kick(); });
  onTheme(() => { gl?.setColors(colors()); progress = -1; kick(); });
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); kick(); }).observe(el);
  else visible = true;

  if (el.classList.contains('flat')) chapters.forEach((ch) => ch.classList.add('on'));
  else { const k0 = KEYS[0]; Object.assign(cam, { yaw: k0.yaw, pitch: k0.pitch, dist: k0.dist, ty: k0.ty }); }

  return {
    el,
    activate() { active = true; progress = -1; kick(); },
    deactivate() { active = false; },
  };
}
