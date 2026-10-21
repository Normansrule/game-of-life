/**
 * Evolution tab: a genetic algorithm (in a Web Worker) breeds radius-3
 * one-dimensional rules for the density classification task. Shows the
 * fitness curves, space–time diagrams of the champion against the
 * hand-designed GKL rule, and the champion's family tree.
 */
import katex from 'katex';
import { gklRule, randomIC, stepRing, type RuleTable } from '../engine/evolve';
import { mulberry32 } from '../engine/census';
import { drawChart } from './chart';
import { fitCanvas, h, select } from './dom';
import { type Command, type GenMessage, createRunner } from './gaRunner';
import { sampleRamp } from '../render/palettes';
import { alpha, onTheme, rgb, tok } from './theme';

const N = 149;
const T = 149;

interface Gen {
  generation: number;
  individuals: GenMessage['individuals'];
}

export function createEvolveView(root: HTMLElement) {
  let worker: { postMessage(m: Command): void; terminate(): void } | null = null;
  let running = false;
  let seed = 2; // a run that finds a good strategy early
  let popSize = 60;
  const gens: Gen[] = [];
  const bestF: number[] = [], meanF: number[] = [], perfX: number[] = [], perfY: number[] = [];
  let best: GenMessage['best'] | null = null;
  let icSeed = 7;
  let active = false;

  const startBtn = h('button.primary', { onclick: () => toggle() }, 'Start evolving');
  const popSel = select([{ value: '40', label: 'Population 40' }, { value: '60', label: 'Population 60' }, { value: '100', label: 'Population 100' }], String(popSize), (v) => { popSize = +v; restart(); });
  const stats = { gen: h('b', {}, '0'), best: h('b', {}, '—'), mean: h('b', {}, '—'), perf: h('b', {}, '—'), lambda: h('b', {}, '—'), ms: h('b', {}, '—') };
  const fitChart = h('canvas.chart.tall');
  const treeCanvas = h('canvas.evo-tree');
  const champST = h('canvas.evo-st', { width: N, height: T });
  const gklST = h('canvas.evo-st', { width: N, height: T });
  const champVerdict = h('div.evo-verdict');
  const gklVerdict = h('div.evo-verdict');
  const hexEl = h('code.evo-hex', {}, 'not evolved yet');
  const runState = h('span.small.dim');

  const stat = (label: string, el: HTMLElement) => h('div.stat', {}, h('span', {}, label), el);
  root.append(
    h('div.evolve', {},
      h('header.view-head', {},
        h('h1', {}, 'Evolving a cellular automaton'),
        h('p', { html:
          `Can a row of cells that only see their 3 neighbours on each side reach a <b>global</b> decision? In the <b>density classification task</b> a ring of ${N} cells must turn all 1s if the majority started as 1 and all 0s otherwise. ` +
          `Nobody tells the cells the rule. A <b>genetic algorithm</b> breeds rule tables of ${katex.renderToString('2^7 = 128')} bits: each generation every rule is tested on fresh random rings, the best 20% survive, and the rest are replaced by crossed-over, mutated children of the survivors. ` +
          `This is the experiment of Mitchell, Crutchfield and Das (1994–96), running live in a background thread.` })),
      h('div.controls', {}, startBtn, h('button', { onclick: () => { seed++; restart(); } }, 'New run'), popSel,
        h('button', { onclick: () => { icSeed++; drawST(); } }, 'New test ring'), runState),
      h('div.evo-grid', {},
        h('section.panel', {}, h('h3', {}, 'Progress'), h('div.stats.two', {},
          stat('Generation', stats.gen), stat('Best fitness (training)', stats.best), stat('Mean fitness', stats.mean),
          stat('Champion on unbiased rings', stats.perf), stat('Champion λ (share of 1s)', stats.lambda), stat('Time per generation', stats.ms)),
          fitChart,
          h('p.small.dim', {}, 'Training rings have a random density between 0 and 1, so "always answer 0" already scores about 50%. The red curve is the harder benchmark: rings where every cell is a fair coin flip, so the majority is narrow.')),
        h('section.panel', {}, h('h3', {}, 'Space–time: champion vs. GKL'),
          h('div.evo-st-pair', {},
            h('figure', {}, champST, h('figcaption', {}, 'Evolved champion'), champVerdict),
            h('figure', {}, gklST, h('figcaption', {}, 'GKL rule (designed by hand, 1978)'), gklVerdict)),
          h('p.small.dim', {}, 'Time runs down; each row is the ring at one step, from the same random start. Look for the strategy: the early "block-expanding" rules grow solid blocks of the colour they guess; the best rules send "particles" (diagonal boundaries) that carry information across the ring and cancel each other out.'),
          h('div.small', {}, 'Champion rule table (hex): ', hexEl)),
      ),
      h('section.panel.evo-tree-panel', {}, h('h3', {}, "The champion's family tree"),
        h('p.small.dim', {}, 'A phylogeny of rules. Each horizontal line is one rule, from the generation it was born to the last generation it survived selection (coloured by fitness, red through ochre to green). Curves join a child to its two parents. The champion is blue and its main line of descent (always through the parent that gave it most of its rule table) is drawn in heavy ink: follow it left to see the chain of crossovers and mutations that built it. Only rules that survived at least one round of selection are drawn.'),
        treeCanvas),
    ),
  );

  /** Prefer a Web Worker; fall back to running between frames if workers are blocked. */
  function ensureWorker() {
    if (worker) return worker;
    const local = () => {
      const handle = createRunner(onGen, () => performance.now());
      return { postMessage: handle, terminate: () => handle({ type: 'stop' }) };
    };
    try {
      const w = new Worker(new URL('./evolveWorker.ts', import.meta.url), { type: 'module' });
      let heard = false;
      const pending: Command[] = [];
      w.onmessage = (e: MessageEvent<GenMessage>) => { heard = true; onGen(e.data); };
      w.onerror = () => {
        if (heard) return;
        w.terminate();
        worker = local();
        for (const m of pending) worker.postMessage(m);
      };
      worker = { postMessage: (m) => { if (!heard) pending.push(m); w.postMessage(m); }, terminate: () => w.terminate() };
    } catch {
      worker = local();
    }
    return worker;
  }

  function restart() {
    gens.length = bestF.length = meanF.length = perfX.length = perfY.length = 0;
    best = null;
    hexEl.textContent = 'not evolved yet';
    if (running) ensureWorker().postMessage({ type: 'start', opts: { seed, popSize } });
    else if (worker) { worker.terminate(); worker = null; }
    updateStats();
    updateRunState();
    drawAll();
  }

  /** Say what the GA is doing; the first generation takes a moment to arrive. */
  function updateRunState() {
    if (running && !gens.length) runState.replaceChildren(h('span.stones-loading', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), ' Breeding the first generation…');
    else if (!running && gens.length) runState.replaceChildren(`Paused at generation ${gens[gens.length - 1].generation}`);
    else runState.replaceChildren();
  }

  function toggle() {
    running = !running;
    startBtn.textContent = running ? 'Pause' : gens.length ? 'Resume' : 'Start evolving';
    const w = ensureWorker();
    if (running) w.postMessage(gens.length ? { type: 'resume' } : { type: 'start', opts: { seed, popSize } });
    else w.postMessage({ type: 'pause' });
    updateRunState();
  }

  function onGen(m: GenMessage) {
    gens.push({ generation: m.generation, individuals: m.individuals });
    bestF.push(m.best.fitness * 100);
    meanF.push(m.mean * 100);
    if (m.perf !== undefined) { perfX.push(m.generation); perfY.push(m.perf * 100); stats.perf.textContent = `${(m.perf * 100).toFixed(1)}%`; }
    best = m.best;
    hexEl.textContent = m.best.hex;
    stats.ms.textContent = `${m.ms.toFixed(0)} ms`;
    updateStats();
    if (gens.length === 1) updateRunState();
    dirty = true;
  }

  // Draw at most once per frame, and the (heavier) family tree at most once a second.
  let dirty = false, lastTree = 0, lastBestId = -1;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (!active || !dirty) return;
    dirty = false;
    drawCharts();
    if (best && best.id !== lastBestId) { lastBestId = best.id; drawST(); }
    if (now - lastTree > 1000) { lastTree = now; drawTree(); }
  }
  requestAnimationFrame(frame);

  function updateStats() {
    stats.gen.textContent = String(gens.length ? gens[gens.length - 1].generation : 0);
    stats.best.textContent = bestF.length ? `${bestF[bestF.length - 1].toFixed(0)}%` : '—';
    stats.mean.textContent = meanF.length ? `${meanF[meanF.length - 1].toFixed(0)}%` : '—';
    stats.lambda.textContent = best ? best.lambda.toFixed(2) : '—';
    if (!perfY.length) stats.perf.textContent = '—';
  }

  function drawAll() {
    drawCharts();
    drawST();
    drawTree();
  }

  function drawCharts() {
    drawChart(fitChart, [
      { values: bestF, color: '--ink', label: 'best (training)', width: 1.5 },
      { values: meanF, color: '--muted', label: 'mean (training)', width: 1.2 },
      { values: perfY, xs: perfX, color: '--data-shu', label: 'champion, unbiased rings', width: 1.5, dots: true },
      { values: [81.6, 81.6], xs: [0, Math.max(10, bestF.length)], color: '--data-indigo', label: 'GKL ≈ 82%', width: 1, dash: [4, 3] },
    ], { yMin: 0, yMax: 100, xMin: 0, xLabel: 'generation', yLabel: '% correct', legend: true });
  }

  function spaceTime(canvas: HTMLCanvasElement, rule: RuleTable | null, verdict: HTMLElement) {
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(N, T);
    const rng = mulberry32(Math.imul(icSeed, 2654435761) >>> 0);
    for (let k = 0; k < 4; k++) rng(); // decorrelate small seeds
    const ic = randomIC(N, rng);
    const ones = ic.reduce((a, b) => a + b, 0);
    if (!rule) {
      ctx.fillStyle = tok('--board');
      ctx.fillRect(0, 0, N, T);
      verdict.textContent = 'Start evolving to see the champion';
      verdict.className = 'evo-verdict';
      return;
    }
    // One canvas px per cell, a couple of CSS px on screen: flat slate on the kaya board.
    const on = rgb('--slate'), off = rgb('--board');
    let a = ic.slice(), b = new Uint8Array(N);
    for (let t = 0; t < T; t++) {
      for (let i = 0; i < N; i++) {
        const k = (t * N + i) * 4;
        const v = a[i] ? on : off;
        img.data[k] = v[0]; img.data[k + 1] = v[1]; img.data[k + 2] = v[2]; img.data[k + 3] = 255;
      }
      stepRing(a, b, rule);
      [a, b] = [b, a];
    }
    ctx.putImageData(img, 0, 0);
    // Run on to 2N steps to give the final answer.
    for (let t = T; t < 2 * N; t++) { stepRing(a, b, rule); [a, b] = [b, a]; }
    const fin = a.reduce((s, v) => s + v, 0);
    const answer = fin === N ? 1 : fin === 0 ? 0 : -1;
    const truth = ones * 2 > N ? 1 : 0;
    verdict.textContent = `${ones} of ${N} cells start as 1 · ` + (answer < 0 ? 'no consensus, so wrong' : `answers ${answer ? 'majority 1' : 'majority 0'}, ${answer === truth ? 'correct' : 'wrong'}`);
    verdict.className = `evo-verdict ${answer === truth ? 'ok' : 'bad'}`;
  }

  const gkl = gklRule();
  function drawST() {
    spaceTime(champST, best ? Uint8Array.from(best.rule) : null, champVerdict);
    spaceTime(gklST, gkl, gklVerdict);
  }

  /**
   * Phylogeny of rules. An elite copy is the same rule living on, so each
   * distinct rule becomes one horizontal life line from the generation it was
   * born to the last generation it survived. Only rules that survived at
   * least one round of selection are drawn; branches join a child to its
   * two parents at its birth.
   */
  function drawTree() {
    fitCanvas(treeCanvas);
    const ctx = treeCanvas.getContext('2d')!;
    const dpr = treeCanvas.width / Math.max(1, treeCanvas.clientWidth);
    const W = treeCanvas.clientWidth, H = treeCanvas.clientHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tok('--ground');
    ctx.fillRect(0, 0, W, H);
    if (gens.length < 2) {
      ctx.fillStyle = tok('--muted');
      ctx.font = `15px ${tok('--text')}`;
      ctx.fillText('The tree appears as generations are bred.', 16, 28);
      return;
    }
    interface Life { root: number; born: number; last: number; parents: number[]; fit: number; best: number }
    const rootOf = new Map<number, number>();
    const lives = new Map<number, Life>();
    gens.forEach((gen, gi) =>
      gen.individuals.forEach((ind, r) => {
        const root = ind.elite ? rootOf.get(ind.parents[0]) ?? ind.parents[0] : ind.id;
        rootOf.set(ind.id, root);
        let L = lives.get(root);
        if (!L) {
          L = { root, born: gi, last: gi, parents: ind.parents.map((p) => rootOf.get(p) ?? p), fit: ind.fitness, best: r };
          lives.set(root, L);
        }
        L.last = gi;
        L.fit = ind.fitness;
        L.best = Math.min(L.best, r);
      }),
    );
    const G = gens.length;
    const champRoot = rootOf.get(gens[G - 1].individuals[0].id)!;
    const shown = [...lives.values()].filter((L) => L.last > L.born || L.root === champRoot).sort((a, b) => a.born - b.born || a.best - b.best);
    // Greedy lane assignment so life lines never overlap.
    const laneEnd: number[] = [];
    const lane = new Map<number, number>();
    for (const L of shown) {
      let k = laneEnd.findIndex((e) => e < L.born - 1);
      if (k < 0) { k = laneEnd.length; laneEnd.push(0); }
      laneEnd[k] = L.last;
      lane.set(L.root, k);
    }
    const lanes = Math.max(1, laneEnd.length);
    const padL = 16, padR = 16, padT = 14, padB = 30;
    const x = (g: number) => padL + (g / Math.max(1, G - 1)) * (W - padL - padR);
    const y = (k: number) => padT + ((k + 0.5) / lanes) * (H - padT - padB);
    // The champion's main line of descent: always follow the parent that gave most of the rule table.
    const anc = new Set<number>();
    for (let r: number | undefined = champRoot; r !== undefined && !anc.has(r); r = lives.get(r)?.parents[0]) anc.add(r);
    // Fitness from low to high: vermilion, ochre, pine.
    const ramp = [rgb('--data-shu'), rgb('--data-ochre'), rgb('--data-pine')];
    const colour = (f: number) => { const [r, g, b] = sampleRamp(ramp, f); return `rgb(${r | 0},${g | 0},${b | 0})`; };
    // Branches
    for (const pass of [0, 1])
      for (const L of shown) {
        const isAnc = anc.has(L.root);
        if ((pass === 1) !== isAnc) continue;
        ctx.strokeStyle = isAnc ? tok('--ink') : alpha('--ink', 0.14);
        ctx.lineWidth = isAnc ? 1.6 : 1;
        for (const p of isAnc ? L.parents.slice(0, 1) : L.parents) {
          const k = lane.get(p);
          if (k === undefined) continue;
          const x0 = x(Math.max(0, L.born - 1)), x1 = x(L.born);
          ctx.beginPath();
          ctx.moveTo(x0, y(k));
          ctx.bezierCurveTo((x0 + x1) / 2, y(k), (x0 + x1) / 2, y(lane.get(L.root)!), x1, y(lane.get(L.root)!));
          ctx.stroke();
        }
      }
    // Life lines
    for (const L of shown) {
      const k = lane.get(L.root)!;
      const isAnc = anc.has(L.root);
      ctx.strokeStyle = L.root === champRoot ? tok('--data-indigo') : isAnc ? tok('--ink') : colour(L.fit);
      ctx.globalAlpha = isAnc ? 1 : L.last === G - 1 ? 0.8 : 0.4;
      ctx.lineWidth = isAnc ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(x(L.born), y(k));
      ctx.lineTo(Math.max(x(L.last), x(L.born) + 2), y(k));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const c = lives.get(champRoot)!;
    ctx.fillStyle = tok('--data-indigo');
    ctx.beginPath();
    ctx.arc(x(G - 1), y(lane.get(champRoot)!), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tok('--ink-2');
    ctx.font = `12px ${tok('--ui')}`;
    const depth = [...anc].length;
    ctx.fillText(`${shown.length} rules survived selection over ${G} generations · the champion was born in generation ${gens[c.born].generation}; its main line of descent has ${depth - 1} ancestors`, padL, H - 8);
  }

  window.addEventListener('resize', () => active && drawAll());
  onTheme(() => active && drawAll());
  drawAll();
  return {
    activate() { active = true; requestAnimationFrame(drawAll); },
    deactivate() { active = false; },
  };
}
