/**
 * Duel: Immigration, Life for two players, against the computer or a friend
 * on the same device, on a 13-line Go board. Each round both sides take turns placing three stones, then the
 * board runs eight generations. A newborn takes the colour of most of its
 * parents, so you grow by being the majority where stones are born. After
 * five rounds, whoever has more stones on the board wins.
 *
 * Play by pointer, or by keyboard: arrows move the cursor, Space or Enter
 * places a stone. Your opponent, level, the preview setting and your record
 * against the computer are kept in localStorage.
 */
import { type Level, type Side, chooseMove, run, score, step } from '../engine/immigration';
import { fitCanvas, h, select, toggle } from './dom';
import { icon } from './icons';
import { alpha, onTheme, reducedMotion, tok } from './theme';
import { CellPainter, drawBoardLines, drawStarPoints } from './thumb';
import * as sfx from './sfx';

const N = 13;
const ROUNDS = 5;
const PER = 3;    // stones each side places per round
const GENS = 8;   // generations run after each round
const STORE = 'life-tree:duel:v1';
const GO_COLS = 'ABCDEFGHJKLMN';
const LEVELS: { value: Level; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
];
type Opponent = 'cpu' | 'friend';
const OPPONENTS: { value: Opponent; label: string }[] = [
  { value: 'cpu', label: 'Computer' },
  { value: 'friend', label: 'A friend on this device' },
];

interface Saved { opponent: Opponent; level: Level; preview: boolean; record: Record<Level, [number, number, number]> }
function loadSaved(): Saved {
  const blank: Saved = { opponent: 'cpu', level: 'normal', preview: true, record: { easy: [0, 0, 0], normal: [0, 0, 0], hard: [0, 0, 0] } };
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || '{}');
    if (OPPONENTS.some((o) => o.value === s.opponent)) blank.opponent = s.opponent;
    if (LEVELS.some((l) => l.value === s.level)) blank.level = s.level;
    if (typeof s.preview === 'boolean') blank.preview = s.preview;
    for (const l of LEVELS) if (Array.isArray(s.record?.[l.value]) && s.record[l.value].length === 3) blank.record[l.value] = s.record[l.value];
  } catch { /* storage blocked: start fresh */ }
  return blank;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pointName = (i: number) => `${GO_COLS[i % N]}${N - Math.floor(i / N)}`;

/** A placed stone drops onto the board on a spring; this is its scale over time (ms). */
function dropScale(ms: number): number {
  if (ms >= 360) return 1;
  const t = ms / 1000;
  return 1 + 0.18 * Math.exp(-22 * t) * Math.cos(30 * t);
}

export function createDuelView(root: HTMLElement) {
  const saved = loadSaved();
  const persist = () => { try { localStorage.setItem(STORE, JSON.stringify(saved)); } catch { /* not kept */ } };

  let board: Uint8Array = new Uint8Array(N * N);
  let round = 1, placedYou = 0, placedCpu = 0, gen = 0;
  let phase: 'you' | 'cpu' | 'run' | 'over' = 'you';
  let level: Level = saved.level;
  let opponent: Opponent = saved.opponent;
  // The side placing a stone now; in a game against a friend both sides are people.
  let turn: Side = 1;
  let last = -1;
  let cursor = -1, hover = -1;
  let active = false, timer = 0, raf = 0, wonAt = 0, winner: Side | 0 = 0;
  const dropping = new Map<number, number>();
  const fading = new Map<number, { side: number; t0: number }>();

  // ---------- layout ----------
  const canvas = h('canvas.duel-canvas', {
    tabindex: '0',
    role: 'application',
    'aria-roledescription': 'Go board',
    'aria-label': 'Duel board, 13 by 13. Arrow keys move the cursor, Space or Enter places a stone on your turn.',
  });
  const roundEl = h('h2', {}, '');
  const youN = h('b.readout', {}, '0');
  const cpuN = h('b.readout', {}, '0');
  const youLabel = h('span', {}, 'You');
  const cpuLabel = h('span', {}, 'Computer');
  const bar = h('div.duel-bar', { 'aria-hidden': 'true' }, h('i'), h('i'));
  const status = h('p.duel-status', { 'aria-live': 'polite' });
  const forecast = h('p.duel-forecast.readout');
  const record = h('p.duel-record');
  const verdict = h('div.duel-verdict', { 'aria-live': 'polite' });
  const opponentSel = select(OPPONENTS, opponent, (v) => { saved.opponent = v as Opponent; persist(); newGame(); });
  const levelSel = select(LEVELS, level, (v) => { saved.level = v as Level; persist(); newGame(); });
  const preview = toggle('Show where it ends up', saved.preview, (v) => { saved.preview = v; persist(); draw(); });
  const newBtn = h('button', { type: 'button', onclick: () => newGame() }, 'New game');

  root.append(h('div.duel', {},
    h('header.view-head', {},
      h('h1', {}, 'Duel'),
      h('p', {}, 'Life for two players, a variant called Immigration. You play black against the computer\u2019s white, or pass the device back and forth with a friend. Take turns placing stones, then the board runs: a new stone takes the colour of most of the stones that made it. After five rounds, the side with more stones wins.')),
    h('div.duel-layout', {},
      h('section.duel-main', {}, status, canvas, forecast),
      h('aside.panel.duel-side', {},
        roundEl,
        h('div.duel-score', {},
          h('div.duel-you', {}, h('span.duel-stone.black'), youLabel, youN),
          h('div.duel-cpu', {}, h('span.duel-stone.white'), cpuLabel, cpuN)),
        bar,
        verdict,
        h('label.duel-opponent', {}, 'Opponent ', opponentSel),
        h('div.duel-controls', {}, h('label', {}, 'Level ', levelSel), newBtn),
        preview.el,
        record,
        h('details.duel-how', {},
          h('summary', {}, 'How to win'),
          h('ul', {},
            h('li', {}, 'A lone stone dies, and so does a pair. Three in a row make a blinker, which keeps going, and four in a square make a block, which stays forever.'),
            h('li', {}, 'Births go to the colour with two or three of the parents. Put your stones next to the computer’s groups and you can take their children.'),
            h('li', {}, 'The last stone before a run counts most. White opens rounds 1, 3 and 5, so in those rounds black places the last stone, including the last stone of the game.'),
            h('li', {}, 'With the preview on, pointing at a point shows how the board ends up after the run if you play there, assuming nobody else moves.')))))));

  // ---------- game flow ----------
  // The last stone before a run matters most, so the computer opens rounds 1, 3 and 5 and you place the last stone of the game.
  const firstThisRound = (): Side => (round % 2 === 1 ? 2 : 1);
  function whoseTurn(): Side | 0 {
    if (placedYou >= PER && placedCpu >= PER) return 0;
    if (placedYou >= PER) return 2;
    if (placedCpu >= PER) return 1;
    // Stones alternate, starting with whoever leads this round.
    const placed = placedYou + placedCpu;
    const first = firstThisRound();
    return placed % 2 === 0 ? first : first === 1 ? 2 : 1;
  }

  function newGame() {
    clearTimeout(timer);
    level = saved.level;
    opponent = saved.opponent;
    (levelSel as HTMLSelectElement).disabled = opponent === 'friend';
    board = new Uint8Array(N * N);
    round = 1; placedYou = 0; placedCpu = 0; gen = 0; last = -1; winner = 0;
    dropping.clear(); fading.clear();
    verdict.replaceChildren();
    next();
  }

  function next() {
    const t = whoseTurn();
    if (t) turn = t;
    if (t === 1 || (t === 2 && opponent === 'friend')) { phase = 'you'; }
    else if (t === 2) { phase = 'cpu'; timer = window.setTimeout(cpuMove, reducedMotion() ? 150 : 420); }
    else { phase = 'run'; gen = 0; timer = window.setTimeout(runStep, 380); }
    paint();
  }

  function place(i: number, side: Side) {
    board[i] = side;
    last = i;
    dropping.set(i, performance.now());
    // The computer's stones land a little softer than a person's.
    sfx.stone(side === 2 && opponent === 'cpu' ? 0.75 : 1);
    if (side === 1) placedYou++; else placedCpu++;
  }

  function youPlay(i: number) {
    if (phase !== 'you' || i < 0 || board[i]) return;
    place(i, turn);
    hover = -1;
    next();
  }

  function cpuMove() {
    if (phase !== 'cpu') return;
    const i = chooseMove(board, N, N, 2, GENS, level);
    if (i >= 0) place(i, 2);
    else placedCpu = PER;
    next();
  }

  function runStep() {
    const nx = step(board, N, N);
    const now = performance.now();
    for (let i = 0; i < N * N; i++) {
      if (nx[i] && !board[i]) dropping.set(i, now);
      if (!nx[i] && board[i]) fading.set(i, { side: board[i], t0: now });
    }
    board = nx;
    gen++;
    last = -1;
    if (gen < GENS) timer = window.setTimeout(runStep, 260);
    else if (round < ROUNDS) { round++; placedYou = 0; placedCpu = 0; timer = window.setTimeout(next, 520); }
    else timer = window.setTimeout(finish, 520);
    paint();
  }

  function finish() {
    phase = 'over';
    const [k, s] = score(board);
    winner = k > s ? 1 : s > k ? 2 : 0;
    // Only games against the computer count towards your record.
    if (opponent === 'cpu') {
      const r = saved.record[level];
      r[winner === 1 ? 0 : winner === 2 ? 1 : 2]++;
      persist();
    }
    wonAt = performance.now();
    if (winner === 1 || (winner === 2 && opponent === 'friend')) sfx.chime(5);
    else if (winner === 2) sfx.thud();
    const again = h('button.primary', { type: 'button', onclick: () => newGame() }, 'Play again', icon('arrow'));
    const friend = opponent === 'friend';
    const line =
      winner === 1 ? (friend ? `Black wins, ${k} to ${s}.` : `You win, ${k} to ${s}.`) :
      winner === 2 ? (friend ? `White wins, ${s} to ${k}.` : `The computer wins, ${s} to ${k}.`) :
      `A draw, ${k} each.`;
    const sub = friend ? '' : winner === 1 && level !== 'hard' ? ' Try the next level up.' : winner === 2 ? ' Try placing next to its groups to steal the births.' : '';
    verdict.replaceChildren(h('p', {}, h('b', {}, line), sub), again);
    paint();
  }

  // ---------- panel ----------
  function paint() {
    const [k, s] = score(board);
    youN.textContent = String(k);
    cpuN.textContent = String(s);
    const total = Math.max(1, k + s);
    (bar.children[0] as HTMLElement).style.flexGrow = String(k / total);
    (bar.children[1] as HTMLElement).style.flexGrow = String(s / total);
    bar.classList.toggle('empty', k + s === 0);
    roundEl.textContent = phase === 'over' ? 'Game over' : `Round ${round} of ${ROUNDS}`;
    const friend = opponent === 'friend';
    youLabel.textContent = friend ? 'Black' : 'You';
    cpuLabel.textContent = friend ? 'White' : 'Computer';
    const left = PER - (turn === 1 ? placedYou : placedCpu);
    status.textContent =
      phase === 'you' && friend ? `${turn === 1 ? 'Black' : 'White'} to play: place a stone. ${plural(left, 'stone')} left this round.` :
      phase === 'you' ? `Your move: place a stone. ${plural(left, 'stone')} left this round.` :
      phase === 'cpu' ? 'The computer is choosing a point…' :
      phase === 'run' ? `The board is running: generation ${gen} of ${GENS}.` :
      'Five rounds played.';
    const [w, l, d] = saved.record[level];
    record.textContent = friend ? 'Games against a friend don\u2019t count towards your record.' : w + l + d ? `Your record on ${LEVELS.find((x) => x.value === level)!.label}: ${plural(w, 'win')}, ${l} ${l === 1 ? 'loss' : 'losses'}, ${plural(d, 'draw')}.` : '';
    canvas.setAttribute('aria-busy', String(phase === 'cpu' || phase === 'run'));
    draw();
  }

  // ---------- drawing ----------
  function geometry() { const W = canvas.clientWidth; return { W, s: W / N }; }

  function draw() {
    if (!active) return;
    fitCanvas(canvas);
    const ctx = canvas.getContext('2d')!;
    const dpr = canvas.width / Math.max(1, canvas.clientWidth);
    const { W, s } = geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--board');
    ctx.fillRect(0, 0, W, W);
    drawBoardLines(ctx, W, W, s, 0, 0);
    drawStarPoints(ctx, N, N, s, 0, 0);
    const now = performance.now();
    const motion = !reducedMotion();
    const at = (i: number): [number, number] => [(i % N) * s, Math.floor(i / N) * s];
    let animating = false;

    // Where it ends up: ghosts of the board after the run, if you play at the point you're aiming at.
    const aim = cursor >= 0 ? cursor : hover;
    forecast.textContent = '';
    if (phase === 'you' && saved.preview && aim >= 0 && !board[aim]) {
      const t = new Uint8Array(board);
      t[aim] = turn;
      const end = run(t, N, N, GENS);
      const [k, w] = score(end);
      const ghostB = new CellPainter(s), ghostW = new CellPainter(s);
      for (let i = 0; i < N * N; i++) if (end[i]) (end[i] === 1 ? ghostB : ghostW).add(...at(i));
      ctx.globalAlpha = 0.22;
      ghostB.fill(ctx, '--slate', false);
      ghostW.fill(ctx, '--shell', false);
      ctx.globalAlpha = 1;
      forecast.textContent = opponent === 'friend'
        ? `${pointName(aim)}: if nobody else moved, the run would end with black on ${k} and white on ${w}.`
        : `${pointName(aim)}: if nobody else moved, the run would end with you on ${k} and the computer on ${w}.`;
    }

    const blacks = new CellPainter(s), whites = new CellPainter(s);
    let order = 0;
    for (let i = 0; i < N * N; i++) {
      if (!board[i]) continue;
      const t0 = dropping.get(i);
      let sc = 1;
      if (t0 !== undefined && motion) { sc = dropScale(now - t0); if (now - t0 >= 360) dropping.delete(i); else animating = true; }
      else dropping.delete(i);
      // The winner's stones breathe once at the end, one after another.
      if (winner && board[i] === winner && motion && now - wonAt < 1200) {
        const u = Math.min(1, Math.max(0, (now - wonAt - order * 18) / 420));
        sc *= 1 + 0.12 * Math.sin(u * Math.PI);
        animating = true;
      }
      if (board[i] === winner) order++;
      if (sc === 1) { (board[i] === 1 ? blacks : whites).add(...at(i)); continue; }
      const p = new CellPainter(s * sc);
      const [px, py] = at(i);
      p.add(px - (s * (sc - 1)) / 2, py - (s * (sc - 1)) / 2);
      p.fill(ctx, board[i] === 1 ? '--slate' : '--shell');
    }
    blacks.fill(ctx, '--slate');
    whites.fill(ctx, '--shell');

    // Stones that died this generation lift off and fade.
    for (const [i, f] of fading) {
      const u = (now - f.t0) / 300;
      if (u >= 1 || !motion) { fading.delete(i); continue; }
      animating = true;
      const p = new CellPainter(s * (1 + u * 0.15));
      const [px, py] = at(i);
      ctx.globalAlpha = 1 - u;
      p.add(px - (s * u * 0.15) / 2, py - (s * u * 0.15) / 2 - u * s * 0.3);
      p.fill(ctx, f.side === 1 ? '--slate' : '--shell', false);
      ctx.globalAlpha = 1;
    }

    // The last stone placed carries a small mark, as in a Go game record.
    if (last >= 0 && board[last]) {
      const [px, py] = at(last);
      ctx.strokeStyle = tok(board[last] === 1 ? '--shell' : '--slate');
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (phase === 'you' && aim >= 0 && !board[aim]) {
      const [px, py] = at(aim);
      ctx.strokeStyle = alpha('--board-line', cursor >= 0 ? 0.9 : 0.55);
      ctx.lineWidth = cursor >= 0 ? 2 : 1.5;
      ctx.beginPath();
      ctx.arc(px + s / 2, py + s / 2, s * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (animating && !raf) raf = requestAnimationFrame(() => { raf = 0; draw(); });
  }

  // ---------- input ----------
  function pointAt(e: PointerEvent): number {
    const r = canvas.getBoundingClientRect();
    const s = r.width / N;
    const x = Math.floor((e.clientX - r.left) / s), y = Math.floor((e.clientY - r.top) / s);
    return x >= 0 && y >= 0 && x < N && y < N ? y * N + x : -1;
  }
  canvas.addEventListener('pointerdown', (e) => { cursor = -1; youPlay(pointAt(e)); });
  canvas.addEventListener('pointermove', (e) => {
    const p = e.pointerType === 'mouse' ? pointAt(e) : -1;
    if (p !== hover) { hover = p; draw(); }
  });
  canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
  canvas.addEventListener('keydown', (e) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = moves[e.key];
    if (d) {
      e.preventDefault();
      const c = cursor >= 0 ? cursor : Math.floor((N * N) / 2);
      const x = Math.min(N - 1, Math.max(0, (c % N) + d[0])), y = Math.min(N - 1, Math.max(0, Math.floor(c / N) + d[1]));
      cursor = y * N + x;
      if (!(saved.preview && phase === 'you')) status.textContent = `${pointName(cursor)}: ${board[cursor] ? (opponent === 'friend' ? (board[cursor] === 1 ? 'a black stone' : 'a white stone') : board[cursor] === 1 ? 'your stone' : 'a computer stone') : 'empty point'}.`;
      draw();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (cursor < 0) cursor = Math.floor((N * N) / 2);
      youPlay(cursor);
    }
  });
  canvas.addEventListener('blur', () => { cursor = -1; draw(); });
  window.addEventListener('resize', () => draw());
  onTheme(() => draw());

  newGame();
  return {
    activate() { active = true; requestAnimationFrame(() => draw()); },
    deactivate() { active = false; },
  };
}
