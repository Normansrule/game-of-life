/**
 * The home page, which is also the website on GitHub Pages.
 *
 * Its centrepiece is a real 19-line Go board. It places a famous pattern stone
 * by stone, runs it, lifts the stones into the lid and moves on to the next.
 * Touch the board and it's yours: place stones, run them, or send them to the
 * full simulator.
 */
import { type Cell, bounds, normalize } from '../engine/life';
import { getPattern, patternCells } from '../engine/patterns';
import { emit } from './bus';
import { h } from './dom';
import { isInstalledApp, openGetApp } from './getApp';
import { icon } from './icons';
import { onTheme, reducedMotion, tok } from './theme';

const N = 19;
const GO_COLS = 'ABCDEFGHJKLMNOPQRST'; // Go boards skip the letter I

interface Seed { id: string; name: string; gens: number; caption: string }
const SEEDS: Seed[] = [
  { id: 'rpentomino', name: 'R-pentomino', gens: 70, caption: 'The R-pentomino: five stones that take 1,103 generations to settle on an open board. This board is small, so it hits the edge long before that.' },
  { id: 'glider', name: 'Glider', gens: 44, caption: 'A glider: five stones that walk one line diagonally every four generations, until the edge of the board stops them.' },
  { id: 'pulsar', name: 'Pulsar', gens: 24, caption: 'A pulsar: 48 stones that repeat every three generations. Births alternate black and white, so the colours cycle too.' },
  { id: 'acorn', name: 'Acorn', gens: 70, caption: 'The acorn: seven stones that keep changing for 5,206 generations when they have room to grow.' },
];

export function createHomeView(root: HTMLElement) {
  // ---------- the board ----------
  const canvas = h('canvas', {
    tabindex: '0',
    role: 'application',
    'aria-roledescription': 'Go board',
    'aria-label': 'A 19 by 19 Go board playing the Game of Life. Arrow keys move the cursor, Space places or lifts a stone, P plays or pauses.',
    'aria-describedby': 'home-caption',
  });
  const ctx = canvas.getContext('2d')!;
  const playBtn = h('button.primary', { type: 'button', onclick: () => { const was = playing; takeOver(() => setPlaying(!was)); } }, icon('pause'), 'Pause');
  const stepBtn = h('button', { type: 'button', onclick: () => takeOver(() => { setPlaying(false); tick(); }) }, 'Next generation');
  const clearBtn = h('button', { type: 'button', onclick: () => takeOver(() => { setPlaying(false); liftAll(); }) }, 'Clear');
  const genEl = h('dd', {}, '0');
  const onEl = h('dd', {}, '0');
  const lidEl = h('dd', {}, '0');
  const caption = h('p.board-caption', { id: 'home-caption', 'aria-live': 'polite' });

  const sendBtn = h('button.primary', { type: 'button', onclick: () => openOnBoard() }, 'Open the board', icon('arrow'));
  const hero = h('div.hero', {},
    h('div', {},
      h('h1', {}, 'Life began on a Go board.'),
      h('p.lede', {}, 'In 1970 John Conway and his students in Cambridge worked out the Game of Life by hand, with stones on a Go board. Life Tree gives you that board, then lets you follow every stone forward, backward and into the math behind it.'),
      h('div.actions', {}, sendBtn, h('a.cta-link', { href: '#math' }, 'How the rules work'))),
    h('div.home-board', {},
      canvas,
      h('div.board-bar', {},
        h('dl.board-count', {},
          h('div', {}, h('dt', {}, 'Generation'), genEl),
          h('div', {}, h('dt', {}, 'On the board'), onEl),
          h('div', {}, h('dt', {}, 'In the lid'), lidEl)),
        h('div.board-buttons', {}, playBtn, stepBtn, clearBtn)),
      caption));

  // ---------- the rest of the page ----------
  const view = (route: string, name: string, what: string) =>
    h('li', {}, h('a', { href: `#${route}` }, h('b', {}, name), h('span', {}, what), icon('arrow')));
  const group = (title: string, ...items: HTMLElement[]) => h('div.view-group', {}, h('h3', {}, title), h('ul', {}, ...items));

  const views = h('section.home-section', { 'aria-labelledby': 'h-views' },
    h('h2', { id: 'h-views' }, 'Eleven ways to read one board'),
    h('p.intro', {}, 'Every view starts from the same board. Draw something once, then follow it forward in time, backward to its possible parents, across other rules, or into the maths behind it.'),
    h('div.view-groups', {},
      group('Watch it run',
        view('sim', 'Board', 'Draw, run and record patterns on a board up to 1,024 lines wide.'),
        view('space', 'Spacetime', 'Stack the generations into a 3D sculpture you can turn.'),
        view('deep', 'Deep time', 'Jump up to 2^50 generations ahead with the Hashlife algorithm.')),
      group('Trace where it came from',
        view('lineage', 'Lineage', 'A family tree of every object: which ones split, merged and died.'),
        view('ancestors', 'Ancestors', 'Run the board backwards to find what could have come before.'),
        view('basins', 'State space', 'Map every state of a small board to where it ends up.')),
      group('Try other rules',
        view('atlas', 'Rule atlas', 'Eighteen of the 262,144 Life-like rules running side by side, sorted by behaviour.'),
        view('evolve', 'Evolution', 'Breed rules with a genetic algorithm and watch them get better at a task.'),
        view('puzzles', 'Puzzles', 'Ten challenges, from a still life to a spaceship, checked by the engine.')),
      group('Understand it',
        view('math', 'Math', 'Nineteen sections, from the rules themselves to running time backwards.'),
        view('apps', 'Applications', 'Live models of traffic, heart rhythms, snowflakes and more.'))));

  const history = h('section.home-section', { 'aria-labelledby': 'h-history' },
    h('h2', { id: 'h-history' }, 'Where it started'),
    h('dl.history', {},
      h('div', {}, h('dt', {}, '1970'), h('dd', {}, 'John Conway settles on the rules after trying many variations by hand: a stone survives with two or three neighbours, and an empty point with exactly three gets a new stone.')),
      h('div', {}, h('dt', {}, 'October 1970'), h('dd', {}, 'Martin Gardner describes the game in his Mathematical Games column in Scientific American, and readers start running it on paper and on computers.')),
      h('div', {}, h('dt', {}, 'November 1970'), h('dd', {}, 'Bill Gosper finds the glider gun, a pattern that grows forever, and wins the $50 prize Conway offered for one.')),
      h('div', {}, h('dt', {}, 'Today'), h('dd', {}, 'Life is known to be able to simulate any computer, and people are still finding new patterns in it.'))));

  const install = isInstalledApp() ? null : h('section.home-section', { 'aria-labelledby': 'h-install' },
    h('h2', { id: 'h-install' }, 'Take it with you'),
    h('p.intro', {}, 'Life Tree works offline once you install it from the browser, and there is a desktop app for Windows, macOS and Linux built from the same code.'),
    h('div.install', {}, h('button', { type: 'button', onclick: () => openGetApp() }, icon('download'), 'Get the app')));

  const foot = h('footer.home-foot', {},
    h('span', {}, 'Open source under the MIT License. ', h('a', { href: 'https://github.com/Normansrule/game-of-life', target: '_blank', rel: 'noopener' }, 'Source on GitHub')),
    h('span', {}, 'Rendered with WebGL2 (Web Graphics Library), with a plain canvas fallback.'));

  root.append(h('div.home', {}, hero, views, history, install, foot));

  // ---------- board state ----------
  let alive = new Uint8Array(N * N);
  const color = new Uint8Array(N * N); // 0 slate, 1 shell
  const p = new Float32Array(N * N);   // presence, animated by a spring
  const v = new Float32Array(N * N);
  const delay = new Float32Array(N * N);
  let gen = 0, lid = 0, playing = true, auto = true, seedIdx = 0, ranFor = 0;
  let stepClock = 0, holdClock = 0, phase: 'placing' | 'running' | 'resting' = 'placing';
  let cursor = { x: 9, y: 9 }, focused = false, visible = false, active = false, raf = 0, last = 0;
  let m = 0, g = 1;

  const count = () => alive.reduce((s, x) => s + x, 0);
  function stats() { genEl.textContent = String(gen); onEl.textContent = String(count()); lidEl.textContent = String(lid); }

  function place(seed: Seed) {
    const cells = normalize(patternCells(getPattern(seed.id)!));
    const b = bounds(cells)!;
    const ox = Math.floor((N - (b.x1 + 1)) / 2), oy = Math.floor((N - (b.y1 + 1)) / 2);
    // Place in reading order, the way you'd put stones down by hand.
    const order = [...cells].sort((a, c) => a[1] - c[1] || a[0] - c[0]);
    order.forEach(([x, y], k) => {
      const i = (y + oy) * N + x + ox;
      alive[i] = 1; color[i] = 0; p[i] = 0; v[i] = 0;
      delay[i] = reducedMotion() ? 0 : 0.25 + k * Math.min(0.12, 2.4 / order.length);
    });
    gen = 0; lid = 0; ranFor = 0;
    phase = 'placing';
    holdClock = reducedMotion() ? 0 : 0.25 + order.length * Math.min(0.12, 2.4 / order.length) + 0.5;
    caption.textContent = seed.caption;
    stats();
  }

  function tick() {
    const nx = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < N && yy < N) n += alive[yy * N + xx];
      }
      const i = y * N + x;
      nx[i] = n === 3 || (n === 2 && alive[i]) ? 1 : 0;
      if (nx[i] && !alive[i]) { color[i] = (gen + 1) % 2; p[i] = 0; v[i] = 0; delay[i] = 0; }
      if (!nx[i] && alive[i]) lid++;
    }
    const same = nx.every((x, i) => x === alive[i]);
    alive = nx; gen++; ranFor++;
    stats();
    return same;
  }

  function liftAll() {
    for (let i = 0; i < N * N; i++) if (alive[i]) { alive[i] = 0; lid++; delay[i] = 0; }
    stats();
  }

  function setPlaying(on: boolean) {
    playing = on;
    playBtn.replaceChildren(icon(on ? 'pause' : 'play'), on ? 'Pause' : 'Play');
    kick();
  }

  /** The first time someone touches the board, the demo stops and the board is theirs. */
  function takeOver(f: () => void) {
    if (auto) {
      auto = false;
      for (let i = 0; i < N * N; i++) delay[i] = 0;
      holdClock = 0;
      phase = 'running';
      setPlaying(false);
      caption.textContent = 'Your board now. Tap a point to place or lift a stone, then press Play. Open the board to keep going on a bigger one.';
    }
    f();
    kick();
  }

  function openOnBoard() {
    const cells: Cell[] = [];
    for (let i = 0; i < N * N; i++) if (alive[i]) cells.push([i % N, Math.floor(i / N)]);
    if (cells.length) emit('sim:load', { cells, name: auto ? SEEDS[seedIdx].name : 'Your pattern' });
    emit('navigate', { route: 'sim' });
  }

  // ---------- loop ----------
  function frame(t: number) {
    raf = 0;
    const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
    last = t;
    let moving = false;
    if (playing) {
      moving = true;
      if (holdClock > 0) holdClock -= dt;
      else if (auto && phase === 'resting') { seedIdx = (seedIdx + 1) % SEEDS.length; place(SEEDS[seedIdx]); }
      else {
        phase = phase === 'placing' ? 'running' : phase;
        stepClock += dt;
        if (stepClock > 0.32) {
          stepClock = 0;
          const settled = tick();
          if (auto && (count() === 0 || settled || ranFor >= SEEDS[seedIdx].gens)) {
            liftAll();
            phase = 'resting';
            holdClock = 1.1;
          }
        }
      }
    }
    for (let i = 0; i < N * N; i++) {
      if (delay[i] > 0) { delay[i] -= dt; moving = true; continue; }
      const target = alive[i] ? 1 : 0;
      if (reducedMotion()) { p[i] = target; v[i] = 0; continue; }
      // Placed stones land on an underdamped spring (a small click); lifted stones ease off without bouncing.
      const k = alive[i] ? 520 : 260, c = alive[i] ? 22 : 32;
      v[i] += (-k * (p[i] - target) - c * v[i]) * dt;
      p[i] += v[i] * dt;
      if (Math.abs(p[i] - target) > 0.002 || Math.abs(v[i]) > 0.01) moving = true;
      else { p[i] = target; v[i] = 0; }
    }
    draw();
    if (moving && visible && active) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!raf && visible && active) { last = performance.now(); raf = requestAnimationFrame(frame); }
    else if (!raf) draw();
  }

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const S = canvas.clientWidth || 480;
    if (canvas.width !== Math.round(S * dpr)) { canvas.width = Math.round(S * dpr); canvas.height = Math.round(S * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, S, S);
    // Faint straight grain.
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = tok('--board-line');
    for (let k = 0; k < 24; k++) {
      const x0 = (k * 37.3) % S;
      ctx.beginPath();
      for (let y = 0; y <= S; y += 8) ctx.lineTo(x0 + Math.sin(y / 61 + k) * 3 + Math.sin(y / 17 + k * 2) * 0.8, y);
      ctx.stroke();
    }
    ctx.restore();
    m = S * 0.055;
    g = (S - 2 * m) / (N - 1);
    const line = tok('--board-line');
    ctx.strokeStyle = line;
    ctx.globalAlpha = 0.78;
    ctx.lineWidth = Math.max(0.8, S / 560);
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const q = Math.round(m + i * g) + 0.5;
      ctx.moveTo(m, q); ctx.lineTo(S - m, q); ctx.moveTo(q, m); ctx.lineTo(q, S - m);
    }
    ctx.stroke();
    ctx.fillStyle = line;
    for (const a of [3, 9, 15]) for (const b of [3, 9, 15]) { ctx.beginPath(); ctx.arc(m + a * g + 0.5, m + b * g + 0.5, Math.max(2, g * 0.1), 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    const r = g * 0.47;
    for (let i = 0; i < N * N; i++) {
      const pr = delay[i] > 0 ? 0 : p[i];
      if (pr < 0.01) continue;
      const x = m + (i % N) * g, y0 = m + Math.floor(i / N) * g;
      let sc: number, off: number, a: number;
      if (alive[i]) { sc = 1 + (1 - pr) * 0.3; off = -(1 - Math.min(pr, 1)) * g * 0.35; a = Math.min(1, Math.max(0, pr * 1.8)); }
      else { sc = 1 + (1 - pr) * 0.1; off = -(1 - pr) * g * 0.5; a = pr; }
      const y = y0 + off, rr = r * sc;
      ctx.globalAlpha = a * 0.32 * Math.max(0, Math.min(1, 1 + off / (g * 0.3)));
      ctx.fillStyle = '#1b0f00';
      ctx.beginPath(); ctx.ellipse(x + r * 0.14, y0 + r * 0.2, r, r * 0.92, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a;
      const gr = ctx.createRadialGradient(x - rr * 0.35, y - rr * 0.4, rr * 0.1, x, y, rr);
      if (color[i] === 0) { gr.addColorStop(0, '#5b5a57'); gr.addColorStop(0.55, '#232220'); gr.addColorStop(1, '#141312'); }
      else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.6, '#f1ece0'); gr.addColorStop(1, '#cdc6b5'); }
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (focused) {
      ctx.strokeStyle = tok('--focus');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(m + cursor.x * g, m + cursor.y * g, r + 3, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ---------- input ----------
  function toggleAt(x: number, y: number) {
    const i = y * N + x;
    if (alive[i]) { alive[i] = 0; lid++; }
    else { alive[i] = 1; color[i] = gen % 2; p[i] = 0; v[i] = 0; delay[i] = 0; }
    stats();
  }
  canvas.addEventListener('pointerdown', (e) => {
    const rc = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(N - 1, Math.round((e.clientX - rc.left - m) / g)));
    const y = Math.max(0, Math.min(N - 1, Math.round((e.clientY - rc.top - m) / g)));
    cursor = { x, y };
    takeOver(() => toggleAt(x, y));
  });
  const describe = () => {
    const i = cursor.y * N + cursor.x;
    caption.textContent = `${GO_COLS[cursor.x]}${N - cursor.y}: ${alive[i] ? (color[i] ? 'white stone' : 'black stone') : 'empty point'}.`;
  };
  canvas.addEventListener('focus', () => { focused = true; kick(); });
  canvas.addEventListener('blur', () => { focused = false; kick(); });
  canvas.addEventListener('keydown', (e) => {
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[e.key];
    if (d) {
      e.preventDefault();
      cursor = { x: Math.max(0, Math.min(N - 1, cursor.x + d[0])), y: Math.max(0, Math.min(N - 1, cursor.y + d[1])) };
      describe(); kick();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      takeOver(() => { setPlaying(false); toggleAt(cursor.x, cursor.y); describe(); });
    } else if (e.key.toLowerCase() === 'p') {
      e.preventDefault();
      const was = playing;
      takeOver(() => setPlaying(!was));
    }
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es.some((x) => x.isIntersecting); kick(); }).observe(canvas);
  } else visible = true;
  window.addEventListener('resize', () => kick());
  onTheme(() => kick());

  // Reduced motion: show the first pattern settled and wait for Play instead of running on its own.
  place(SEEDS[0]);
  if (reducedMotion()) setPlaying(false);

  return {
    activate() { active = true; document.title = "Life Tree: Conway's Game of Life on a Go board"; kick(); },
    deactivate() { active = false; },
  };
}
