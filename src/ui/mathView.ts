import katex from 'katex';
import 'katex/dist/katex.min.css';
import { Life } from '../engine/life';
import { RULE_PRESETS, parseRule, type Rule } from '../engine/rules';
import { analyzeStateSpace } from '../engine/basins';
import { evolveSparse } from '../engine/life';
import { patternCells } from '../engine/patterns';
import { diversity, mergeCensus, mulberry32, randomSoup, runSoup } from '../engine/census';
import { gklRule, icWithOnes, localMajorityRule, runToConsensus } from '../engine/evolve';
import { CLASS_INFO, type RuleClass, classifyRule, langtonLambda, randomRule } from '../engine/classify';
import { Sandpile, linearFit, logBins, sandpileGroupOrder, sandpileIdentity } from '../engine/models/sandpile';
import { burnsideCount } from '../engine/exhaustive';
import { createBoxFigures } from './boxFigure';
import { createPastFigure } from './pastFigure';
import { type Series, drawChart } from './chart';
import { fitCanvas, fmt, h, select, slider } from './dom';

const tex = (s: string, display = false) => katex.renderToString(s, { displayMode: display, throwOnError: false });

/** Render $...$ and $$...$$ inside a template string. */
function md(html: string): string {
  return html
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => tex(t, true))
    .replace(/\$([^$\n]+?)\$/g, (_, t) => tex(t));
}

function section(id: string, title: string, body: string, ...figures: HTMLElement[]) {
  return h('section.math-section', { id }, h('h2', {}, title), h('div.prose', { html: md(body) }), ...figures);
}

function figure(caption: string, ...content: (HTMLElement | string)[]) {
  return h('figure.fig', {}, ...content, h('figcaption', { html: md(caption) }));
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Mean-field map: probability a cell is alive next step, if cells are independent with density p. */
export function meanField(rule: Rule, p: number): number {
  const q = 1 - p;
  let out = 0;
  for (let n = 0; n <= 8; n++) {
    const pn = binom(8, n) * Math.pow(p, n) * Math.pow(q, 8 - n);
    out += pn * (p * (rule.survive[n] ? 1 : 0) + q * (rule.birth[n] ? 1 : 0));
  }
  return out;
}

export function createMathView(root: HTMLElement) {
  const toc = [
    ['rules', '1. The rule as a formula'],
    ['neighbourhood', '2. Neighbourhoods & convolution'],
    ['counting', '3. Counting rules and states'],
    ['meanfield', '4. Mean-field theory'],
    ['order', '5. Order from chaos: entropy'],
    ['chaos', '6. Sensitivity & damage spreading'],
    ['speed', '7. The speed of light'],
    ['growth', '8. Growth rates & guns'],
    ['phase', '9. Phase space, basins & Gardens of Eden'],
    ['lineage', '10. Why the lineage tree is well defined'],
    ['linear', '11. A linear rule: the replicator'],
    ['computation', '12. Universality & undecidability'],
    ['algorithms', '13. Algorithms: from loops to Hashlife'],
    ['census', '14. A census of random soups'],
    ['criticality', '15. Criticality & the sandpile group'],
    ['edge', '16. Rule space & the edge of chaos'],
    ['density', '17. Evolving computation: density classification'],
    ['box', '18. Every pattern in a 4×4 box'],
    ['backwards', '19. Running time backwards'],
  ];

  const past = createPastFigure();

  const box = createBoxFigures();
  const burnsideRows = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<tr><td>${n}×${n}</td><td>${(2n ** BigInt(n * n)).toLocaleString('en-US')}</td><td>${burnsideCount(n).toLocaleString('en-US')}</td></tr>`).join('');

  // ---- Figure: accuracy against initial density for GKL and local majority ----
  const dcChart = h('canvas.chart.tall');
  const dcNote = h('span.mono', {}, 'computing…');
  const runDensityFigure = () => {
    const N = 149, per = 30;
    const ks: number[] = [];
    for (let k = 0; k <= N; k += 5) ks.push(k);
    if (!ks.includes(74)) ks.push(74);
    if (!ks.includes(75)) ks.push(75);
    ks.sort((a, b) => a - b);
    const rules = [gklRule(), localMajorityRule()];
    const acc: number[][] = [[], []];
    const rng = mulberry32(17);
    let i = 0;
    const batch = () => {
      for (let n = 0; n < 4 && i < ks.length; n++, i++) {
        const k = ks[i];
        rules.forEach((r, ri) => {
          let ok = 0;
          for (let t = 0; t < per; t++) if (runToConsensus(r, icWithOnes(N, k, rng), 2 * N) === (2 * k > N ? 1 : 0)) ok++;
          acc[ri].push((ok / per) * 100);
        });
      }
      const xs = ks.slice(0, acc[0].length).map((k) => k / N);
      drawChart(dcChart, [
        { values: acc[0], xs, color: '#7df9ff', label: 'GKL', width: 2, dots: true },
        { values: acc[1], xs, color: '#ff4fa3', label: 'local majority of 7', width: 2, dots: true },
      ], { xLabel: 'initial density of 1s', yLabel: '% correct', xMin: 0, xMax: 1, yMin: 0, yMax: 100, legend: true, marker: 0.5 });
      if (i < ks.length) setTimeout(batch, 0);
      else dcNote.textContent = `${per} random rings of ${N} cells per point · GKL dips only near ½; the local majority rule fails almost everywhere except at extreme densities`;
    };
    batch();
  };

  // ---- Figure: Langton's lambda vs activity for random rules ----
  const edgeChart = h('canvas.chart.tall');
  const edgeNote = h('span.mono');
  const edgeBars = h('canvas.chart.small');
  const edgePts: { lambda: number; activity: number; cls: RuleClass; rule: string }[] = [];
  let edgeSeed = 1;
  let edgeBusy = false;
  const drawEdge = () => {
    const series: Series[] = (Object.keys(CLASS_INFO) as RuleClass[]).map((c) => {
      const pts = edgePts.filter((p) => p.cls === c);
      return { values: pts.map((p) => p.activity * 100), xs: pts.map((p) => p.lambda), color: CLASS_INFO[c].colour, width: 0, dots: true, label: `${c} ${CLASS_INFO[c].name}` };
    });
    drawChart(edgeChart, series, { xLabel: "Langton's λ", yLabel: 'activity %', xMin: 0, xMax: 1, yMin: 0, legend: true, marker: 140 / 512 });
    // Share of each class by lambda band
    const bands = 10;
    const tot = new Array(bands).fill(0);
    const by: Record<RuleClass, number[]> = { I: new Array(bands).fill(0), II: new Array(bands).fill(0), III: new Array(bands).fill(0), IV: new Array(bands).fill(0) };
    for (const p of edgePts) {
      const b = Math.min(bands - 1, Math.floor(p.lambda * bands));
      tot[b]++;
      by[p.cls][b]++;
    }
    const used = tot.map((t, i) => (t >= 3 ? i : -1)).filter((i) => i >= 0);
    drawChart(edgeBars, (Object.keys(CLASS_INFO) as RuleClass[]).map((c) => ({
      values: used.map((i) => (by[c][i] / tot[i]) * 100), xs: used.map((i) => (i + 0.5) / bands), color: CLASS_INFO[c].colour, dots: true, width: 2, label: c,
    })), { xLabel: 'λ (bands of 0.1)', yLabel: '% of rules', xMin: 0, xMax: 1, yMin: 0, yMax: 100, legend: true, marker: 140 / 512 });
    const n = edgePts.length;
    const share = (c: RuleClass) => ((edgePts.filter((p) => p.cls === c).length / Math.max(1, n)) * 100).toFixed(0);
    edgeNote.textContent = `${n} random rules · I ${share('I')}% · II ${share('II')}% · III ${share('III')}% · IV ${share('IV')}% · the line marks Life (λ = 0.273)`;
  };
  const runEdge = (count: number) => {
    if (edgeBusy) return;
    edgeBusy = true;
    const rng = mulberry32(edgeSeed++ * 104729);
    let left = count;
    const batch = () => {
      for (let k = 0; k < 6 && left > 0; k++, left--) {
        const rule = randomRule(rng);
        const v = classifyRule(rule, { size: 50, gens: 250, seed: Math.floor(rng() * 1e6) });
        edgePts.push({ lambda: langtonLambda(parseRule(rule)), activity: v.activity, cls: v.cls, rule });
      }
      drawEdge();
      if (left > 0) setTimeout(batch, 0);
      else edgeBusy = false;
    };
    batch();
  };

  // ---- Figure: sandpile identity and avalanche statistics ----
  const idCanvas = h('canvas.demo-canvas.identity', { width: 128, height: 96 });
  const idNote = h('span.mono', {}, 'computing…');
  const avChart = h('canvas.chart');
  const avNote = h('span.mono');
  const orderRows = h('tbody');
  const runSandpileFigures = () => {
    const W = 128, H = 96;
    const t0 = performance.now();
    const e = sandpileIdentity(W, H);
    const ctx = idCanvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const pal = [[12, 14, 30], [40, 70, 160], [80, 190, 230], [250, 240, 200]];
    for (let i = 0; i < W * H; i++) {
      const c = pal[e[i]];
      img.data.set([c[0], c[1], c[2], 255], i * 4);
    }
    ctx.putImageData(img, 0, 0);
    idNote.textContent = `${W}×${H} identity computed in ${Math.round(performance.now() - t0)} ms`;
    const rows: HTMLElement[] = [];
    for (const [w, hh] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [8, 8], [10, 10]]) {
      const o = sandpileGroupOrder(w, hh);
      const str = o.toString();
      rows.push(h('tr', {}, h('td', {}, `${w}×${hh}`), h('td.mono', {}, str.length > 24 ? `${str.slice(0, 6)}… (${str.length} digits)` : str.replace(/\B(?=(\d{3})+(?!\d))/g, ','))));
    }
    orderRows.replaceChildren(...rows);
    setTimeout(() => {
      const L = 64;
      const pile = new Sandpile(L, L);
      for (let i = 0; i < L * L; i++) pile.h[i] = 3;
      const rng = mulberry32(2024);
      const sizes: number[] = [];
      for (let k = 0; k < 30000; k++) {
        const a = pile.add(Math.floor(rng() * L), Math.floor(rng() * L));
        if (a.size) sizes.push(a.size);
      }
      const { x, y } = logBins(sizes, 6);
      const lx = x.map(Math.log10), ly = y.map(Math.log10);
      const keep = lx.map((_, i) => i).filter((i) => lx[i] > 0.4 && lx[i] < 2.8);
      const fit = linearFit(keep.map((i) => lx[i]), keep.map((i) => ly[i]));
      drawChart(avChart, [
        { values: ly, xs: lx, color: '#7df9ff', dots: true, width: 0, label: 'measured P(s)' },
        { values: [fit.intercept + fit.slope * lx[0], fit.intercept + fit.slope * lx[lx.length - 1]], xs: [lx[0], lx[lx.length - 1]], color: '#ffb020', width: 1.5, dash: [4, 3], label: `fit: slope ${fit.slope.toFixed(2)}` },
      ], { xLabel: 'log₁₀ avalanche size s (topplings)', yLabel: 'log₁₀ P(s)', legend: true });
      avNote.textContent = `${sizes.length.toLocaleString()} avalanches on a ${L}×${L} pile · τ ≈ ${(-fit.slope).toFixed(2)}`;
    }, 30);
  };

  // ---- Figure: interactive neighbourhood ----
  const nb = [0, 1, 0, 0, 1, 0, 0, 1, 0];
  const nbGrid = h('div.nb-grid');
  const nbOut = h('div.nb-out');
  const drawNb = () => {
    nbGrid.replaceChildren(
      ...nb.map((v, i) =>
        h(`button.nb${v ? '.on' : ''}${i === 4 ? '.centre' : ''}` as 'button', {
          'aria-label': `cell ${i}`,
          onclick: () => {
            nb[i] ^= 1;
            drawNb();
          },
        }),
      ),
    );
    const n = nb.reduce((a, v, i) => a + (i === 4 ? 0 : v), 0);
    const s = nb[4];
    const next = s ? n === 2 || n === 3 : n === 3;
    nbOut.innerHTML = md(
      `$s = ${s},\\; n = \\sum_{y \\in N(x)} s(y) = ${n}$ <br>` +
        `$s' = [n = 3] + s\\,[n = 2] = [${n} = 3] + ${s}\\cdot[${n} = 2] = ${next ? 1 : 0}$ <br>` +
        `<span class="${next ? 'good' : 'bad'}">${s ? (next ? 'survives' : 'dies') : next ? 'is born' : 'stays dead'}</span>`,
    );
  };
  drawNb();

  // ---- Figure: mean field cobweb ----
  let mfRule = parseRule('B3/S23');
  let p0 = 0.5;
  const mfCanvas = h('canvas.chart.square');
  const mfInfo = h('p.blurb');
  let measured: { p: number[]; one: number[]; long: number[] } | null = null;
  const drawMF = () => {
    const ps: number[] = [];
    const fs: number[] = [];
    for (let i = 0; i <= 200; i++) {
      ps.push(i / 200);
      fs.push(meanField(mfRule, i / 200));
    }
    // Cobweb from p0.
    const cx: number[] = [];
    const cy: number[] = [];
    let p = p0;
    cx.push(p);
    cy.push(0);
    for (let k = 0; k < 40; k++) {
      const f = meanField(mfRule, p);
      cx.push(p, f);
      cy.push(f, f);
      p = f;
    }
    const series: Series[] = [
      { values: ps, xs: ps, color: '#5b6b8c', label: 'p′ = p', dash: [4, 4], width: 1 },
      { values: fs, xs: ps, color: '#7df9ff', label: 'f(p)', width: 2 },
      { values: cy, xs: cx, color: '#ffb020', label: 'cobweb', width: 1.2 },
    ];
    if (measured) {
      series.push({ values: measured.one, xs: measured.p, color: '#38e8a8', label: 'soup, 1 step', width: 0, dots: true });
      series.push({ values: measured.long, xs: measured.p, color: '#ff4fa3', label: 'soup, 300 steps', width: 0, dots: true });
    }
    drawChart(mfCanvas, series, { xMin: 0, xMax: 1, yMin: 0, yMax: 1, legend: true, xLabel: 'density p', yLabel: 'next density' });
    // Fixed points.
    const fixed: string[] = [];
    let prev = meanField(mfRule, 0) - 0;
    for (let i = 1; i <= 2000; i++) {
      const x = i / 2000;
      const g = meanField(mfRule, x) - x;
      if ((g <= 0) !== (prev <= 0)) {
        const xs = (i - 0.5) / 2000;
        const slope = (meanField(mfRule, xs + 1e-4) - meanField(mfRule, xs - 1e-4)) / 2e-4;
        fixed.push(`${xs.toFixed(3)} (${Math.abs(slope) < 1 ? 'stable' : 'unstable'}, slope ${slope.toFixed(2)})`);
      }
      prev = g;
    }
    mfInfo.innerHTML = md(
      `Fixed points of $f$ besides $p=0$: ${fixed.length ? fixed.join(', ') : 'none'}. Starting at $p_0 = ${p0.toFixed(2)}$ the cobweb converges to $${p.toFixed(4)}$.`,
    );
  };
  const measureBtn = h('button', {
    onclick: () => {
      measureBtn.textContent = 'Measuring…';
      setTimeout(() => {
        const ps: number[] = [], one: number[] = [], long: number[] = [];
        for (let i = 1; i <= 19; i++) {
          const p = i / 20;
          const g = new Life(160, 160, mfRule);
          g.randomize(p);
          g.step();
          ps.push(p);
          one.push(g.population() / (160 * 160));
          for (let k = 0; k < 299; k++) g.step();
          long.push(g.population() / (160 * 160));
        }
        measured = { p: ps, one, long };
        measureBtn.textContent = 'Measure real soups';
        drawMF();
      }, 20);
    },
  }, 'Measure real soups');
  const mfRuleSel = select(RULE_PRESETS.map((r) => ({ value: r.rule, label: r.name })), 'B3/S23', (v) => {
    mfRule = parseRule(v);
    measured = null;
    drawMF();
  });
  const p0Ctl = slider('Start density p₀', 0.01, 0.99, 0.01, p0, (v) => {
    p0 = v;
    drawMF();
  }, (v) => v.toFixed(2));

  // ---- Figure: entropy & density over time ----
  const entCanvas = h('canvas.chart');
  const runEntropy = () => {
    const g = new Life(200, 200);
    g.randomize(0.35);
    const dens: number[] = [];
    const ent: number[] = [];
    for (let t = 0; t <= 600; t++) {
      if (t % 3 === 0) {
        dens.push(g.population() / (200 * 200));
        ent.push(blockEntropy(g) / 4);
      }
      g.step();
    }
    const xs = dens.map((_, i) => i * 3);
    drawChart(entCanvas, [
      { values: ent, xs, color: '#c084fc', label: 'block entropy H₂ₓ₂ / 4 (bits per cell)', width: 2 },
      { values: dens, xs, color: '#38e8a8', label: 'density', width: 2 },
    ], { legend: true, xLabel: 'generation', yMin: 0 });
  };

  // ---- Figure: damage spreading ----
  const dmgCanvas = h('canvas.chart');
  const runDamage = () => {
    const series: Series[] = [];
    const colors = ['#ff4fa3', '#ffb020', '#7df9ff'];
    const rules = ['B3/S23', 'B36/S23', 'B3678/S34678'];
    rules.forEach((r, ri) => {
      const avg = new Array(201).fill(0);
      const trials = 6;
      for (let k = 0; k < trials; k++) {
        const a = new Life(128, 128, r);
        a.randomize(0.35);
        for (let t = 0; t < 50; t++) a.step(); // let the soup settle a little
        const b = new Life(128, 128, r);
        b.cells.set(a.cells);
        b.set(64, 64, b.get(64, 64) ? 0 : 1);
        for (let t = 0; t <= 200; t++) {
          let d = 0;
          for (let i = 0; i < a.cells.length; i++) d += a.cells[i] ^ b.cells[i];
          avg[t] += d / trials;
          a.step();
          b.step();
        }
      }
      series.push({ values: avg.map((v) => Math.max(v, 0.5)), color: colors[ri], label: RULE_PRESETS.find((p) => p.rule === r)!.name, width: 2 });
    });
    drawChart(dmgCanvas, series, { legend: true, logY: true, xLabel: 'generation', yLabel: 'Hamming distance' });
  };

  // ---- Figure: growth ----
  const growthCanvas = h('canvas.chart');
  const runGrowth = () => {
    const ids: [string, string][] = [['gosper', '#7df9ff'], ['switchengine', '#ffb020'], ['acorn', '#ff4fa3']];
    const series = ids.map(([id, color]) => {
      let c = patternCells(id);
      const v: number[] = [];
      const xs: number[] = [];
      for (let t = 0; t <= 1500; t += 10) {
        v.push(c.length);
        xs.push(t);
        c = evolveSparse(c, 10);
      }
      return { values: v, xs, color, label: id === 'gosper' ? 'Gosper gun' : id === 'switchengine' ? 'switch engine' : 'Acorn', width: 2 };
    });
    drawChart(growthCanvas, series, { legend: true, xLabel: 'generation', yLabel: 'population' });
  };

  // ---- Table: Gardens of Eden on small tori ----
  const goeTable = h('table.data');
  const runGoE = () => {
    const rows = [[3, 3], [3, 4], [4, 4], [3, 5]].map(([w, hh]) => {
      const s = analyzeStateSpace(w, hh);
      const cyc = new Map<number, number>();
      for (const b of s.basins) cyc.set(b.cycle.length, (cyc.get(b.cycle.length) ?? 0) + 1);
      return h('tr', {},
        h('td', {}, `${w} × ${hh}`),
        h('td', {}, fmt(s.count)),
        h('td', {}, fmt(s.basins.length)),
        h('td', {}, `${fmt(s.gardensOfEden)} (${((100 * s.gardensOfEden) / s.count).toFixed(1)}%)`),
        h('td', {}, String(Math.max(...s.basins.map((b) => b.maxDepth)))),
        h('td', {}, [...cyc.keys()].sort((a, b) => a - b).join(', ')),
      );
    });
    goeTable.replaceChildren(
      h('thead', {}, h('tr', {}, ...['Torus', 'States', 'Attractors', 'Gardens of Eden', 'Longest transient', 'Cycle lengths'].map((t) => h('th', {}, t)))),
      h('tbody', {}, ...rows),
    );
  };

  // ---- Figure: soup census ----
  const censusTotals = new Map<string, number>();
  const lifespans: number[] = [];
  let soupsDone = 0;
  let soupTarget = 0;
  let censusRng = mulberry32(2026);
  let objectsTotal = 0;
  const censusBars = h('div.census-bars');
  const zipfCanvas = h('canvas.chart');
  const lifeCanvas = h('canvas.chart');
  const censusStats = h('div.summary');
  const censusBtn = h('button', { onclick: () => startCensus(soupsDone + 100) }, 'Run 100 more soups');
  function censusUI() {
    return h('div', {},
      h('div.fig-controls', {}, censusBtn, h('button', { onclick: () => { censusTotals.clear(); lifespans.length = 0; soupsDone = 0; objectsTotal = 0; censusRng = mulberry32(Date.now() % 1e9); startCensus(40); } }, 'Restart with a new seed')),
      h('div.census-grid', {}, h('div', {}, h('h4', {}, 'Most common objects'), censusBars), h('div', {}, h('h4', {}, 'Summary'), censusStats)),
      h('div.census-grid', {}, h('div', {}, h('h4', {}, 'Rank–frequency (log–log)'), zipfCanvas), h('div', {}, h('h4', {}, 'Generations until the soup settles'), lifeCanvas)),
    );
  }
  function startCensus(target: number) {
    const wasIdle = soupTarget <= soupsDone;
    soupTarget = target;
    if (wasIdle) requestAnimationFrame(censusTick);
  }
  function censusTick() {
    const t0 = performance.now();
    while (soupsDone < soupTarget && performance.now() - t0 < 30) {
      const r = runSoup(randomSoup(16, 0.5, censusRng));
      mergeCensus(censusTotals, r.objects);
      lifespans.push(r.settledAt);
      soupsDone++;
    }
    renderCensus();
    if (soupsDone < soupTarget) requestAnimationFrame(censusTick);
  }
  function renderCensus() {
    const sorted = [...censusTotals.entries()].sort((a, b) => b[1] - a[1]);
    objectsTotal = sorted.reduce((a, [, v]) => a + v, 0);
    const max = sorted[0]?.[1] ?? 1;
    censusBars.replaceChildren(
      ...sorted.slice(0, 14).map(([name, v]) =>
        h('div.cbar', {}, h('span.cname', {}, name), h('span.ctrack', {}, h('i', { style: `width:${(100 * v) / max}%` })), h('b', {}, fmt(v))),
      ),
    );
    const Hs = diversity(censusTotals);
    const meanLife = lifespans.reduce((a, b) => a + b, 0) / Math.max(1, lifespans.length);
    const rows: [string, string][] = [
      ['Soups run', `${fmt(soupsDone)}${soupsDone < soupTarget ? ` of ${fmt(soupTarget)}…` : ''}`],
      ['Objects found', fmt(objectsTotal)],
      ['Distinct kinds', fmt(sorted.length)],
      ['Diversity H', `${Hs.toFixed(2)} bits (2^H ≈ ${Math.pow(2, Hs).toFixed(1)})`],
      ['Mean settling time', `${meanLife.toFixed(0)} gens`],
      ['Longest-lived soup', `${fmt(Math.max(0, ...lifespans))} gens`],
    ];
    censusStats.replaceChildren(h('dl', {}, ...rows.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
    // Rank-frequency with a least-squares fit in log-log space.
    const ranks = sorted.map((_, i) => Math.log10(i + 1));
    const freqs = sorted.map(([, v]) => Math.log10(v / Math.max(1, objectsTotal)));
    const n = Math.min(ranks.length, 12);
    let fit: Series | null = null;
    if (n >= 3) {
      const mx = ranks.slice(0, n).reduce((a, b) => a + b, 0) / n;
      const my = freqs.slice(0, n).reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (ranks[i] - mx) * (freqs[i] - my); sxx += (ranks[i] - mx) ** 2; }
      const slope = sxy / sxx;
      fit = { values: [my + slope * (ranks[0] - mx), my + slope * (ranks[n - 1] - mx)], xs: [ranks[0], ranks[n - 1]], color: '#ffb020', label: `fit: slope ${slope.toFixed(2)}`, dash: [4, 3], width: 1.5 };
    }
    drawChart(zipfCanvas, [{ values: freqs, xs: ranks, color: '#7df9ff', label: 'log₁₀ share', dots: true, width: 1 }, ...(fit ? [fit] : [])], { legend: true, xLabel: 'log₁₀ rank' });
    // Histogram of settling times.
    const bins = 20;
    const maxL = Math.max(100, ...lifespans);
    const hist = new Array(bins).fill(0);
    for (const l of lifespans) hist[Math.min(bins - 1, Math.floor((l / maxL) * bins))]++;
    drawChart(lifeCanvas, [{ values: hist, xs: hist.map((_, i) => ((i + 0.5) * maxL) / bins), color: '#c084fc', fill: true, label: 'soups', width: 2 }], { legend: true, xLabel: 'generations', yMin: 0 });
  }

  const content = h(
    'div.math',
    {},
    h('nav.toc', {}, h('h3', {}, 'Contents'), ...toc.map(([id, t]) => h('a', { href: `#math/${id}`, onclick: (e: Event) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); } }, t))),
    h(
      'article',
      {},
      h('header.math-hero', {}, h('h1', {}, 'The mathematics of Life'), h('p', { html: md('Conway\'s Game of Life (1970) is a **cellular automaton**: a grid of cells, each $0$ or $1$, updated in lockstep by one local rule. Everything on this page is live: the charts are computed in your browser from the same engine that runs the simulator.'.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')) })),

      section('rules', '1. The rule as a formula', `
<p>Let the state of cell $x \\in \\mathbb{Z}^2$ at time $t$ be $s_t(x) \\in \\{0,1\\}$, and let $N(x)$ be its 8 <em>Moore neighbours</em>. The live-neighbour count is</p>
$$n_t(x) = \\sum_{y \\in N(x)} s_t(y), \\qquad 0 \\le n_t(x) \\le 8.$$
<p>Conway's rule, written <code>B3/S23</code>, uses Iverson brackets ($[P] = 1$ if $P$ is true, else $0$):</p>
$$s_{t+1}(x) = [\\,n_t(x) = 3\\,] \\;+\\; s_t(x)\\,[\\,n_t(x) = 2\\,].$$
<p>A dead cell with exactly three live neighbours is <b>born</b>; a live cell with two or three <b>survives</b>; everything else is dead next step (loneliness or overcrowding). In general an <em>outer-totalistic</em> rule is given by a birth set $B$ and a survival set $S$:</p>
$$s_{t+1}(x) = \\big(1 - s_t(x)\\big)\\,[\\,n_t(x) \\in B\\,] + s_t(x)\\,[\\,n_t(x) \\in S\\,].$$
<p>The global map $F : \\{0,1\\}^{\\mathbb{Z}^2} \\to \\{0,1\\}^{\\mathbb{Z}^2}$ is <em>shift-invariant</em> and <em>continuous</em> in the product topology, and by the Curtis–Hedlund–Lyndon theorem every such map is a cellular automaton.</p>`,
        figure('Click the cells. The centre cell is outlined; the formula updates live.', h('div.nb-wrap', {}, nbGrid, nbOut)),
      ),

      section('neighbourhood', '2. Neighbourhoods & convolution', `
<p>The neighbour count is a 2-D <b>convolution</b> of the state with a kernel $K$:</p>
$$n_t = K * s_t, \\qquad K = \\begin{pmatrix} 1 & 1 & 1 \\\\ 1 & 0 & 1 \\\\ 1 & 1 & 1 \\end{pmatrix}.$$
<p>That makes one step of Life a convolution followed by a pointwise non-linearity, which is exactly the shape of a layer in a convolutional neural network. On an $n \\times n$ torus the convolution theorem gives $K * s = \\mathcal{F}^{-1}(\\mathcal{F}K \\cdot \\mathcal{F}s)$, so a step can be computed with FFTs in $O(n^2 \\log n)$; for a $3\\times3$ kernel the direct sum ($8n^2$ additions) is faster, and is what this app uses.</p>
<p>Continuous generalisations replace $K$ with a smooth ring-shaped kernel and the step function with a smooth growth curve. That is <b>Lenia</b> (Chan, 2019), which produces strikingly life-like "creatures".</p>`),

      section('counting', '3. Counting rules and states', `
<p>There are $2^9$ choices of $B$ and $2^9$ of $S$, so $2^{18} = 262{,}144$ outer-totalistic rules. Allowing the rule to depend on the exact arrangement of the 9 cells gives $2^{2^9} = 2^{512} \\approx 1.3 \\times 10^{154}$ rules.</p>
<p>A $w \\times h$ torus has $2^{wh}$ configurations. Because $F$ is deterministic, every trajectory on a finite torus is <em>eventually periodic</em>: by the pigeonhole principle some state must repeat within $2^{wh}+1$ steps, and from then on the sequence cycles.</p>`),

      section('meanfield', '4. Mean-field theory', `
<p>Pretend every cell is independently alive with probability $p$. Then $n \\sim \\mathrm{Binomial}(8, p)$ and the probability a cell is alive next step is</p>
$$f(p) = \\sum_{n=0}^{8} \\binom{8}{n} p^n (1-p)^{8-n} \\Big( p\\,[n \\in S] + (1-p)\\,[n \\in B] \\Big).$$
<p>For Life this is $f(p) = \\binom{8}{3}p^3q^5 + \\binom{8}{2}p^3q^6$ with $q = 1-p$. Iterating $p_{t+1} = f(p_t)$ predicts the density. The prediction is <b>exact for one step</b> from a random soup (cells really are independent then) but drifts afterwards, because Life builds correlations: real soups decay to "ash" with density of only about 3%, far below the mean-field fixed point. Press <em>Measure real soups</em> to see both effects.</p>`,
        figure('Mean-field map with cobweb iteration. Green dots: density after one step of a real 160×160 soup (matches theory). Pink dots: after 300 steps (correlations take over).',
          h('div.fig-controls', {}, mfRuleSel, p0Ctl.el, measureBtn), mfCanvas, mfInfo),
      ),

      section('order', '5. Order from chaos: entropy', `
<p>Shannon entropy measures disorder. Split the grid into $2\\times2$ blocks; each block is one of $16$ patterns with empirical frequency $\\pi_i$. The block entropy is</p>
$$H_{2\\times2} = -\\sum_{i=1}^{16} \\pi_i \\log_2 \\pi_i \\quad \\text{bits per block} \\;\\le\\; 4.$$
<p>A random soup starts near maximum entropy. As it evolves, structure appears (still lifes, oscillators, empty space) and the entropy falls. Life is not reversible, so it can "forget" and lower entropy, which a reversible physical law cannot do on its own.</p>`,
        figure('Density and normalised block entropy of a 200×200 soup with 35% initial density.', h('div.fig-controls', {}, h('button', { onclick: runEntropy }, 'Run again')), entCanvas),
      ),

      section('chaos', '6. Sensitivity & damage spreading', `
<p>Run two copies of a soup that differ in a <b>single</b> cell and track the Hamming distance $d_t = \\sum_x |s_t(x) - s'_t(x)|$. In chaotic systems the damage grows; the analogue of a Lyapunov exponent is $\\lambda = \\lim \\frac{1}{t} \\log d_t$ during the growth phase. Life sits on the edge: damage can grow, but it is often trapped and frozen into ash. Wolfram's classification puts Life in <b>Class IV</b>, "complex", between ordered (Class I/II) and chaotic (Class III) rules.</p>`,
        figure('Average Hamming distance after flipping one cell (log scale, 6 trials each).', h('div.fig-controls', {}, h('button', { onclick: runDamage }, 'Run again')), dmgCanvas),
      ),

      section('speed', '7. The speed of light', `
<p>Information moves at most one cell per generation (the neighbourhood has radius 1), so the "speed of light" is $c = 1$ cell/gen. Spaceship speeds are written as fractions of $c$: a ship that moves $d$ cells every $p$ generations has speed $\\tfrac{d}{p}c$.</p>
<ul>
<li>The <b>glider</b> moves 1 cell diagonally every 4 generations: $c/4$.</li>
<li>The <b>light/middle/heavyweight spaceships</b> move 2 cells orthogonally every 4: $c/2$.</li>
<li>The <b>copperhead</b> moves 1 cell every 10: $c/10$.</li>
</ul>
<p>It can be proven that no spaceship travelling into empty space can exceed $c/2$ orthogonally or $c/4$ diagonally. The glider and the LWSS are already as fast as possible in their directions.</p>`),

      section('growth', '8. Growth rates & guns', `
<p>Conway conjectured in 1970 that no finite pattern grows forever. Bill Gosper disproved it with the <b>glider gun</b>, which emits a 5-cell glider every 30 generations, so its population grows linearly:</p>
$$P(t) \\approx P_0 + \\tfrac{5}{30}\\,t = P_0 + \\tfrac{t}{6}.$$
<p>A <b>switch engine</b> moves while leaving blocks behind (also linear growth). <em>Breeders</em> (puffers that leave guns behind) grow quadratically, $P(t) = \\Theta(t^2)$, which is the maximum possible since a pattern's bounding box can only grow at speed $c$, so $P(t) = O(t^2)$. A methuselah like <b>Acorn</b> grows for thousands of generations and then stops.</p>`,
        figure('Population over time (exact, computed on an unbounded plane).', growthCanvas),
      ),

      section('phase', '9. Phase space, basins & Gardens of Eden', `
<p>On a finite torus $F$ is a function from a finite set to itself, so its <b>state transition graph</b> (one arrow $\\sigma \\to F(\\sigma)$ per state) is a <em>functional graph</em>. Each connected component contains exactly one cycle, the <b>attractor</b>, with trees of transient states flowing into it: a <b>basin of attraction</b>. The tree view on the <em>State-space trees</em> tab draws all of them.</p>
<p>A state with no predecessor is a <b>Garden of Eden</b>. On a finite set, $F$ has a Garden of Eden iff it is not injective iff it is not surjective. On the infinite plane the <b>Garden of Eden theorem</b> (Moore 1962, Myhill 1963) says:</p>
$$F \\text{ is surjective} \\iff F \\text{ is injective on finite configurations.}$$
<p>Life is clearly not injective (all patterns that die map to the empty grid), so Gardens of Eden must exist. The first explicit one was found by Roger Banks in 1971.</p>`,
        figure('Exhaustive analysis of Life on small tori (computed now, in your browser).', goeTable),
      ),

      section('lineage', '10. Why the lineage tree is well defined', `
<p>The <em>Lineage tree</em> tab groups live cells into objects: two cells are in the same object if they are linked by a chain of cells, each within Chebyshev distance $2$ of the next. The key fact is a locality lemma:</p>
<p><b>Lemma.</b> Every live cell at time $t+1$ descends from exactly one object at time $t$.</p>
<p><em>Proof.</em> A cell $c$ alive at $t+1$ either was alive at $t$ or was born, so its closed neighbourhood $\\bar N(c)$ contains at least one live cell at $t$. Any two cells $a, b \\in \\bar N(c)$ satisfy $\\|a-b\\|_\\infty \\le 2$, so all live cells in $\\bar N(c)$ belong to the same object. $\\square$</p>
<p>This gives a parent map from objects at $t+1$ to objects at $t$ (an object can have several parents if it was formed by a collision). Compressing chains of one-to-one steps into <em>segments</em> yields a directed acyclic graph, which is a tree whenever nothing collides: a genealogy of the pattern. Leaves are deaths, surviving still lifes and oscillators, or spaceships escaping to infinity.</p>`),

      section('linear', '11. A linear rule: the replicator', `
<p>The rule <code>B1357/S1357</code> sets a cell alive iff it has an <em>odd</em> number of live neighbours. Over the field $\\mathbb{F}_2$ that is</p>
$$s_{t+1}(x) = \\sum_{y \\in N(x)} s_t(y) \\pmod 2,$$
<p>which is <b>linear</b>. Represent a pattern as a polynomial $P(u,v) \\in \\mathbb{F}_2[u^{\\pm1}, v^{\\pm1}]$; one step multiplies it by $K(u,v) = (1+u+u^{-1})(1+v+v^{-1}) - 1$. Over $\\mathbb{F}_2$ the Frobenius identity $(a+b)^2 = a^2 + b^2$ gives</p>
$$K^{2^k} = K(u^{2^k}, v^{2^k}),$$
<p>so at time $t = 2^k$ (once $2^k$ exceeds the pattern size) the pattern is reproduced as 8 copies at distance $2^k$. Every pattern self-replicates. Try it: choose <em>Replicator</em> in the simulator and draw anything.</p>`),

      section('computation', '12. Universality & undecidability', `
<p>Gliders can carry bits, and glider collisions implement logic: two glider streams crossing at the right phase annihilate, giving NOT and AND gates; eaters and reflectors route signals; block-pushing gives unbounded memory. Berlekamp, Conway and Guy sketched a full construction in <em>Winning Ways</em> (1982), Paul Rendell built an explicit Turing machine in 2000, and the OTCA metapixel (2006) even runs Life inside Life.</p>
<p>So Life is <b>Turing complete</b>, and the halting problem transfers: there is no algorithm that decides, for every finite pattern, whether it eventually dies out (or becomes periodic, or ever produces a given object). Some questions about Life are provably unanswerable in general, even though each step is trivial.</p>`),

      section('algorithms', '13. Algorithms: from loops to Hashlife', `
<ul>
<li><b>Direct loop</b> (this app's simulator): $O(wh)$ per step with a sliding three-column sum.</li>
<li><b>Sparse / list-based</b>: only touch live cells and their neighbours, $O(P)$ per step for population $P$ (used here for exact growth curves).</li>
<li><b>Bit-parallel</b>: pack 64 cells per word and compute the neighbour count with bitwise adders.</li>
<li><b>GPU</b>: one fragment shader thread per cell. The renderer here already runs one GPU thread per pixel.</li>
<li><b>Hashlife</b> (Gosper, 1984): store the universe as a quadtree with hash-consed nodes and memoise the result of advancing each $2^k \\times 2^k$ node by $2^{k-2}$ generations. Regular patterns can be advanced exponentially far, e.g. $2^{100}$ generations of a glider gun. Try it on the <a href="#deep">Deep time</a> tab, which runs a Hashlife engine written for this project.</li>
</ul>
<p>Why it works: a level-$k$ node is split into nine overlapping level-$(k-1)$ squares, each advanced recursively, then recombined into four squares and advanced again. With memoisation the cost depends on the number of <em>distinct</em> squares in space-time, not on area or time, so a pattern with regular structure costs $O(\log t)$ to advance $t$ generations.</p>`),

      section('census', '14. A census of random soups', `
<p>What does Life "usually" make? Fill a $16\times16$ square at random with density $\tfrac12$, run it until it stabilises, and identify everything left over (spaceships that fly away are counted with ↗). Repeat many times. This is what Adam Goucher's <em>apgsearch</em> does across thousands of volunteer computers for the public census <a href="https://catagolue.hatsya.com" target="_blank" rel="noopener">Catagolue</a>; the most common objects there are the block, blinker, beehive, glider and loaf.</p>
<p>Two statistics are worth watching. The <b>rank–frequency</b> plot (log–log) tests for <b>Zipf-like</b> behaviour $f(r) \propto r^{-s}$, a straight line of slope $-s$. The <b>Shannon diversity</b> $H = -\sum_i p_i \log_2 p_i$ measures how evenly the ash is spread over object types; $2^H$ is the "effective number" of species.</p>`,
        figure('Census of random 16×16 soups, computed live (seeded, so each run is reproducible).', censusUI()),
      ),

      section('criticality', '15. Criticality & the sandpile group', `
<p>Life sits near the "edge of chaos" only because Conway chose its rule carefully. The <b>Abelian sandpile</b> of Bak, Tang and Wiesenfeld (1987) gets there on its own. Each site $v$ of an $m\\times n$ grid holds $c_v \\ge 0$ grains; a site with $c_v \\ge 4$ <b>topples</b>:
$$c \\;\\longmapsto\\; c - \\Delta e_v, \\qquad \\Delta = 4I - A,$$
where $A$ is the adjacency matrix of the grid and grains pushed off the edge are lost. $\\Delta$ is the (reduced) <b>graph Laplacian</b>, the same operator as the discrete heat equation.</p>
<p><b>Abelian property.</b> If two sites are unstable, toppling one never stops the other from being unstable, and the vectors $\\Delta e_v$ commute. So every order of topplings reaches the same stable configuration $\\operatorname{stab}(c)$ with the same number of topplings at each site (Dhar, 1990). The apps page and the test suite check this on random drops.</p>
<p><b>The sandpile group.</b> The <em>recurrent</em> stable configurations (those you keep returning to when adding grains at random) form a group under $a \\oplus b = \\operatorname{stab}(a+b)$, isomorphic to $\\mathbb{Z}^{mn} / \\Delta\\mathbb{Z}^{mn}$. Its order is $\\det \\Delta$, which by Kirchhoff's <b>matrix-tree theorem</b> also counts the spanning trees of the grid with its boundary wired to one sink vertex. The test suite enumerates all $4^{mn}$ configurations of small grids, applies Dhar's burning test, and confirms the count equals $\\det\\Delta$. The identity element $e = \\operatorname{stab}\\bigl(6 - \\operatorname{stab}(6)\\bigr)$ is an unexpectedly intricate fractal picture:</p>`,
        figure('The identity of the sandpile group on a 128×96 grid (colours = 0, 1, 2, 3 grains). Adding it to any recurrent configuration and relaxing changes nothing.', idCanvas, h('div.fig-controls', {}, idNote)),
        figure('Order of the sandpile group, $|G| = \\det \\Delta$ = number of spanning trees, computed exactly with BigInt Bareiss elimination.', h('table.goe', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Grid'), h('th', {}, '|G| = det Δ'))), orderRows)),
        h('div.prose', { html: md(`<p><b>Self-organised criticality.</b> Drop grains at random. Each drop triggers an avalanche of $s$ topplings, and in the steady state
$$P(s) \\sim s^{-\\tau}$$
up to a cut-off set by the grid size: there is no typical avalanche size, the hallmark of a critical point, reached with no parameter tuned. Numerical studies put $\\tau$ a little above $1$ for the 2D sandpile (the exact value is still debated because of strong finite-size corrections); the fit below is a quick measurement on a small pile.</p>`) }),
        figure('Avalanche-size distribution, measured live with log-binned densities.', avChart, h('div.fig-controls', {}, avNote)),
      ),

      section('edge', '16. Rule space & the edge of chaos', `
<p>Life-like rules form a space of $2^9 \\cdot 2^9 = 262{,}144$ points. In 1984 Stephen Wolfram sorted cellular automata into four classes by their long-run behaviour: <b>I</b> uniform, <b>II</b> periodic, <b>III</b> chaotic and <b>IV</b> complex, with persistent localised structures that interact. Life is the textbook class IV rule. The <a href="#atlas">Rule atlas</a> tab classifies rules live with a simple test: whether the board dies or repeats with a short period, and otherwise how many cells change per step.</p>
<p>Chris Langton (1990) asked where class IV lives. His parameter is the fraction of neighbourhood configurations that produce a live cell:
$$\\lambda = \\frac{1}{512}\\sum_{n=0}^{8} \\binom{8}{n}\\bigl([n\\in B] + [n\\in S]\\bigr), \\qquad \\lambda_{\\text{Life}} = \\frac{56 + 28 + 56}{512} = \\frac{140}{512} \\approx 0.273.$$
Small $\\lambda$ means almost every neighbourhood dies (order); $\\lambda$ near $\\tfrac12$ means maximal randomness. Langton argued that complex behaviour concentrates in a transition region between the two, the "edge of chaos". The scatter below classifies random rules on a $50\\times50$ torus and plots their activity against $\\lambda$. You will see the claim is a tendency, not a law: $\\lambda$ alone does not decide the class (Mitchell, Hraber & Crutchfield, 1993), because <em>which</em> counts are switched on matters as much as how many.</p>
<p>A cautionary example from the test suite: the replicator rule <code>B1357/S1357</code> computes $x_{t+1} = Tx_t$ with $T = (1+\\sigma_x+\\sigma_x^{-1})(1+\\sigma_y+\\sigma_y^{-1}) - 1$ over $\\mathbb{F}_2$, where $\\sigma$ are shifts. Because squaring is additive in characteristic 2, $T^{2^k} = (1+\\sigma_x^{2^k}+\\sigma_x^{-2^k})(\\cdots) - 1$, and on a $2^k\\times 2^k$ torus $\\sigma^{2^k} = 1$, so $T^{2^k} = 1\\cdot 1 - 1 = 0$: <b>every</b> pattern vanishes within $2^k$ generations. On a $66\\times66$ torus the same rule churns forever. Board size can change the class.</p>`,
        figure('Random rules (no B0) classified live. Each dot is one rule; the vertical line is Life.', edgeChart, h('div.fig-controls', {}, h('button', { onclick: () => runEdge(150) }, 'Classify 150 more rules'), edgeNote)),
        figure('The share of each class in each λ band (bands with at least 3 rules). Chaos takes over as λ rises; complex rules are rare everywhere.', edgeBars),
      ),

      section('density', '17. Evolving computation: density classification', `
<p>Can purely local rules make a <em>global</em> decision? Take a ring of $N$ cells (odd, so there are no ties) and a radius-$r$ rule $\\phi : \\{0,1\\}^{2r+1} \\to \\{0,1\\}$. The <b>density classification task</b> asks for a rule that drives every initial configuration $x$ to all 1s if $\\rho(x) = \\tfrac1N\\sum_i x_i > \\tfrac12$ and to all 0s otherwise, within about $2N$ steps. With $r = 3$ a rule is a table of $2^7 = 128$ bits, so there are $2^{128} \\approx 3.4\\times10^{38}$ candidates.</p>
<p><b>Why the obvious rule fails.</b> "Copy the majority of the 7 cells you can see" seems natural, but any run of 4 equal cells is a fixed island: every cell in a run of four 1s sees at least four 1s, so it stays 1, and likewise for 0s. A random ring of 149 cells almost surely contains runs of both, so the rule freezes into stripes and never reaches consensus (the test suite checks the island property). Information has to <em>travel</em>.</p>
<p><b>A designed answer.</b> The Gács–Kurdyumov–Levin rule (1978) looks one way or the other depending on its own state:
$$\\phi_{\\text{GKL}}(x)_i = \\begin{cases}\\operatorname{maj}(x_{i-3}, x_{i-1}, x_i) & x_i = 0\\\\ \\operatorname{maj}(x_i, x_{i+1}, x_{i+3}) & x_i = 1\\end{cases}$$
It creates three kinds of domain (all 0, all 1, and a checkerboard) whose boundaries move at fixed speeds like particles. When a white and a black region meet, a checkerboard grows between them, and the speeds of the boundaries are arranged so that, as they collide, the larger region tends to win. On unbiased rings of 149 cells it is right about 82% of the time, and the app's test suite reproduces that figure.</p>
<p><b>Evolved answers.</b> Mitchell, Crutchfield and Das (1994–96) let a genetic algorithm search the table space with fitness
$$F(\\phi) = \\frac{1}{I}\\sum_{k=1}^{I} \\bigl[\\,\\phi^{T}(x^{(k)}) = \\text{the correct uniform state}\\,\\bigr]$$
on fresh random rings each generation. Runs pass through recognisable epochs: random rules, then "default" rules that always answer 0 or always 1 (about 50% on training rings), then "block-expanding" rules that grow a large block of one colour (about 65–70% on unbiased rings), and occasionally "particle" rules that rediscover GKL-like signalling. Watch it happen on the <a href="#evolve">Evolution</a> tab, which also draws the winning rule's family tree.</p>
<p><b>The limit.</b> Land and Belew (1995) proved that no two-state rule of any radius solves the task perfectly for all $N$. The best rules found since score around 86–89% at $N = 149$. The task is a small model of a big question: how decentralised systems, from cells in an embryo to nodes in a network, reach agreement with only local communication.</p>`,
        figure('Accuracy against the initial density of 1s, computed live. Near ρ = ½ the decision is hardest.', dcChart, h('div.fig-controls', {}, dcNote)),
      ),

      section('box', '18. Every pattern in a 4×4 box', `
<p>Soups (§14) sample the space of patterns at random. For small boxes we can do better and try <em>every</em> pattern. A $4\\times4$ box has $2^{16} = 65{,}536$ fillings, but a pattern and its rotations and mirror images behave identically, so we only need one per <b>orbit</b> of the dihedral group $D_4$ (the 8 symmetries of the square).</p>
<p><b>Burnside's lemma</b> counts the orbits without listing them: the number of orbits of a group $G$ acting on a set $X$ is the average number of points each element fixes,
$$|X/G| = \\frac{1}{|G|}\\sum_{g\\in G}|\\mathrm{Fix}(g)|.$$
A filling is fixed by $g$ exactly when it is constant on every cycle of $g$'s action on the 16 cells, so $|\\mathrm{Fix}(g)| = 2^{c(g)}$ where $c(g)$ is the number of cycles. For $4\\times4$: the identity has 16 cycles, the quarter turns 4 each, the half turn 8, the two mirror lines through edges 8 each, and the two diagonals 10 each (4 fixed cells plus 6 swapped pairs):
$$\\frac{2^{16} + 2\\cdot2^{4} + 2^{8} + 2\\cdot2^{8} + 2\\cdot2^{10}}{8} = \\frac{65536 + 32 + 256 + 512 + 2048}{8} = 8548.$$</p>
<table class="mini-table"><thead><tr><th>Box</th><th>Fillings</th><th>Up to symmetry</th></tr></thead><tbody>${burnsideRows}</tbody></table>
<p>The counts grow like $2^{n^2}/8$, so $5\\times5$ (4.2 million) is already a long job and $6\\times6$ is out of reach for a browser. The code builds the orbit table by keeping each mask that is the smallest in its orbit, and the test suite checks it against Burnside's formula and brute force.</p>
<p><b>Running them all.</b> Each of the 8548 patterns runs on a $192\\times192$ field until its state repeats exactly (found by hashing every generation). Anything that reaches the border is a departing spaceship; it is removed whole and the pattern is marked as having fired gliders. This is an approximation of the infinite plane: debris that drifts very far, or a glider that would have hit something on the way out, is handled slightly differently from the true answer. The R-pentomino (which fits in a $3\\times3$ box) checks the method: it settles at generation 1103 into 116 cells, 30 of them in six escaping gliders, matching the classic result.</p>
<p>The results show a familiar pattern from Life soups: most small patterns die or freeze within a few dozen generations, a handful become oscillators, and a tiny tail runs for thousands of generations. Those long-lived <b>methuselahs</b> are the gallery below; the longest settle after about 4000 generations, so each pattern gets up to 6000 generations. Click one to watch it in the simulator.</p>`,
        figure('The fate of all 8548 patterns, computed live in your browser (in a background thread; it takes about a minute and is saved for your next visit).', box.figures.outcomes),
        figure('Fate by starting size. Patterns of 0–2 cells always vanish and 3 cells almost always do; mid-sized patterns of 6 to 12 cells are the most varied and the likeliest to fire gliders; the full box dies of overcrowding.', box.figures.byCells),
        figure('How long patterns take to settle, counted in bins a quarter of a decade wide (both axes logarithmic). Most settle within 30 generations, and the tail stretches past 4000. The bumps far out are families: many different starts collapse into one shared long history within a few generations.', box.figures.lifeChart),
        figure('The 12 longest-lived histories in the box (the white one is the champion). Starts that merge into the same history after a generation or two are shown once. Each card gives the generations until it settles and its final population, not counting gliders that flew away.', box.figures.gallery),
      ),

      section('backwards', '19. Running time backwards', `
<p>Running Life forwards is easy: each cell needs only its 8 neighbours. Running it backwards is a different kind of problem. A <b>parent</b> (predecessor) of a pattern $T$ is any $P$ with $F(P) = T$. Each cell $x$ gives one equation in the 9 unknown cells around it,
$$\\big(1 - p(x)\\big)\\,[\\,n_P(x) \\in B\\,] + p(x)\\,[\\,n_P(x) \\in S\\,] = T(x),$$
and a parent is a simultaneous solution of all of them. That is a constraint-satisfaction problem, the same family as Sudoku and Boolean satisfiability, and Life researchers do use SAT solvers to find parents and Gardens of Eden. The <a href="#ancestors">Ancestors</a> tab solves small cases with a backtracking search: it fills in the box around $T$ one cell at a time and, after every choice, checks whether each affected equation can still be satisfied given how many neighbours are already alive and how many are still unknown. The test suite checks it against brute force over every pattern in the box.</p>
<p><b>Many pasts, one present.</b> To see how lopsided $F$ is, step every one of the $2^{25} = 33{,}554{,}432$ patterns of a $5\\times5$ box and record the $3\\times3$ pattern in the middle (the only part the box fully determines). If every past is equally likely, the chance of a present $y$ is
$$\\Pr(y) = \\frac{|F^{-1}(y)|}{2^{25}}, \\qquad H = -\\sum_y \\Pr(y)\\log_2 \\Pr(y) \\le 9 \\text{ bits}.$$
The empty $3\\times3$ is by far the most common present: about 15% of all pasts lead to it. The rarest is a ring of 8 live cells around a dead centre, with only 5,728 pasts. The entropy comes out well below 9 bits: even from perfectly random input, the presents Life produces are already far from random. This is the information-theoretic face of "order from chaos" (§5) and of irreversibility.</p>
<p><b>Orphans.</b> Every $3\\times3$ pattern turns out to have a $5\\times5$ past, so there are no orphans this small. An <em>orphan</em> is a finite pattern that cannot appear, whatever surrounds it; any pattern containing one is a Garden of Eden. The Moore–Myhill theorem (§9) guarantees orphans exist because Life is not injective, but they have to be much larger than $3\\times3$.</p>
<p><b>Why it matters.</b> Reconstructing a cause from its effect is an <em>inverse problem</em>, as in recovering a sharp image from a blurred one, a body's interior from CT projections, or yesterday's atmosphere from today's measurements. They share the difficulty seen here: many causes fit one effect, so extra assumptions (here, "smallest parent first") are needed to pick one. Functions that are easy to compute and hard to invert are also the raw material of cryptography; Wolfram proposed the Rule 30 automaton (see Applications) as a random-number generator for exactly that reason.</p>`,
        figure('Every 5×5 pattern stepped once, computed live. Each point is one of the 512 possible 3×3 presents, sorted by how many pasts lead to it; the vertical axis is logarithmic.', past.el),
      ),
    ),
  );
  root.append(content);

  let drawn = false;
  return {
    activate() {
      requestAnimationFrame(() => {
        fitCanvas(mfCanvas);
        drawMF();
        box.redraw();
        if (!drawn) {
          drawn = true;
          runEntropy();
          runGrowth();
          runGoE();
          setTimeout(runDamage, 50);
          setTimeout(() => startCensus(40), 400);
          setTimeout(runSandpileFigures, 900);
          setTimeout(() => runEdge(300), 1600);
          setTimeout(runDensityFigure, 2400);
          box.watch(document.getElementById('box')!);
          past.watch(document.getElementById('backwards')!);
        }
      });
    },
    deactivate() {},
  };
}

function blockEntropy(g: Life): number {
  const counts = new Array(16).fill(0);
  let total = 0;
  for (let y = 0; y + 1 < g.h; y += 2)
    for (let x = 0; x + 1 < g.w; x += 2) {
      const i = y * g.w + x;
      const k = g.cells[i] | (g.cells[i + 1] << 1) | (g.cells[i + g.w] << 2) | (g.cells[i + g.w + 1] << 3);
      counts[k]++;
      total++;
    }
  let H = 0;
  for (const c of counts) if (c) H -= (c / total) * Math.log2(c / total);
  return H;
}
