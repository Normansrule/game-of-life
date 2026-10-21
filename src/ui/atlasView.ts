/**
 * Rule atlas: many Life-like rules running side by side from the same kind
 * of soup, each classified live into Wolfram-style classes I–IV.
 */
import { CLASS_INFO, type RuleClass, RuleRun, langtonLambda, randomRule, ruleNeighbours } from '../engine/classify';
import { RULE_PRESETS, parseRule } from '../engine/rules';
import { mulberry32 } from '../engine/census';
import type { Cell } from '../engine/life';
import { emit } from './bus';
import { h, select } from './dom';
import { rgb, tok } from './theme';

const SIZE = 80;
const DECIDE_AT = 300;

/** Class colours from the data palette: I neutral, II indigo, III vermilion, IV pine. */
const CLASS_TOKEN: Record<RuleClass, string> = { I: '--muted', II: '--data-indigo', III: '--data-shu', IV: '--data-pine' };
const classVar = (c: RuleClass) => `var(${CLASS_TOKEN[c]})`;

type SetId = 'famous' | 'neighbours' | 'random';

interface Card {
  rule: string;
  name?: string;
  run: RuleRun;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  img: ImageData;
  badge: HTMLElement;
  meta: HTMLElement;
  spark: HTMLCanvasElement;
  cls?: RuleClass;
  seed: number;
}

export function createAtlasView(root: HTMLElement) {
  let set: SetId = 'famous';
  let seedBase = 1;
  let cards: Card[] = [];
  let active = false;
  const grid = h('div.atlas-grid');
  const summary = h('div.atlas-summary');
  const intro = h('p.atlas-intro');

  const setSel = select<SetId>(
    [
      { value: 'famous', label: 'Famous rules' },
      { value: 'neighbours', label: "Life and its 17 neighbours" },
      { value: 'random', label: 'Random rules' },
    ],
    set,
    (v) => { set = v; build(); },
  );

  root.append(
    h('div.atlas', {},
      h('header.view-head', {},
        h('h1', {}, 'Rule atlas'),
        h('p', {}, 'Conway\'s rule is one of 262,144 "Life-like" rules (choose any set of neighbour counts for birth and for survival). Here many of them run side by side from random soups on an 80×80 torus. After 300 generations each one is classified automatically from its activity, density and whether the board repeats, into the four classes Stephen Wolfram proposed in 1984. λ is Langton\'s parameter: the fraction of the 512 possible neighbourhoods that produce a live cell.')),
      h('div.controls', {},
        h('label', {}, 'Show ', setSel),
        h('button', { onclick: () => { seedBase += 100; build(); } }, 'New soups'),
        h('button', { onclick: () => { set = 'random'; setSel.value = 'random'; seedBase += 100; build(); } }, 'Shuffle random rules'),
        summary),
      intro,
      grid,
      h('div.atlas-legend', {}, ...(Object.keys(CLASS_INFO) as RuleClass[]).map((c) =>
        h('div', {}, h('span.cls-dot', { style: `background:${classVar(c)}` }), h('b', {}, `Class ${c}: ${CLASS_INFO[c].name}. `), CLASS_INFO[c].blurb))),
    ),
  );

  function rulesForSet(): { rule: string; name?: string }[] {
    if (set === 'famous') return RULE_PRESETS.map((p) => ({ rule: p.rule, name: p.name })).concat(
      [{ rule: 'B2/S23', name: 'Dense chaos' }, { rule: 'B3/S238', name: 'EightLife' }, { rule: 'B34/S34', name: '34 Life' }, { rule: 'B35/S236', name: 'B35/S236' }, { rule: 'B1/S1', name: 'Gnarl' }, { rule: 'B3/S2', name: 'Fragile Life' }],
    );
    if (set === 'neighbours') return [{ rule: 'B3/S23', name: "Conway's Life" }, ...ruleNeighbours('B3/S23').map((rule) => ({ rule }))];
    const rng = mulberry32(seedBase * 7919);
    const out: { rule: string }[] = [];
    const seen = new Set<string>();
    while (out.length < 18) {
      const r = randomRule(rng);
      if (!seen.has(r)) { seen.add(r); out.push({ rule: r }); }
    }
    return out;
  }

  function build() {
    const list = rulesForSet();
    intro.textContent =
      set === 'neighbours'
        ? 'Every rule here differs from Life by a single birth or survival count. Most of Life\'s neighbours either die, freeze or boil over: Life sits on a narrow ridge between order and chaos.'
        : set === 'random'
          ? 'Random rules (each count switched on with a random probability). Most land in class I, II or III; complex class IV rules are rare.'
          : 'Named rules from the simulator\'s presets and a few more. Click a card to open the rule in the simulator with a fresh soup.';
    cards = list.map(({ rule, name }, i) => {
      const seed = seedBase + i;
      const canvas = h('canvas.atlas-canvas', { width: SIZE, height: SIZE });
      const ctx = canvas.getContext('2d')!;
      const badge = h('span.cls-badge', {}, '…');
      const meta = h('div.atlas-meta');
      const spark = h('canvas.atlas-spark');
      const el = h('article.atlas-card', { title: 'Open in the simulator', onclick: () => open(rule, name) },
        canvas,
        h('div.atlas-head', {}, h('b.mono', {}, rule), badge),
        name ? h('div.atlas-name', {}, name) : h('div.atlas-name.dim', {}, ' '),
        meta, spark);
      const run = new RuleRun(rule, SIZE, 0.5, seed);
      meta.textContent = `λ = ${langtonLambda(parseRule(rule)).toFixed(3)}`;
      return { rule, name, run, el, canvas, ctx, img: ctx.createImageData(SIZE, SIZE), badge, meta, spark, seed };
    });
    grid.replaceChildren(...cards.map((c) => c.el));
    updateSummary();
  }

  function open(rule: string, name?: string) {
    const rng = mulberry32(Date.now() & 0xffff);
    const cells: Cell[] = [];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (rng() < 0.4) cells.push([x, y]);
    emit('sim:load', { cells, name: `${name ?? rule} soup`, rule });
    emit('navigate', { route: 'sim' });
  }

  function updateSummary() {
    const counts: Record<RuleClass, number> = { I: 0, II: 0, III: 0, IV: 0 };
    let pending = 0;
    for (const c of cards) if (c.cls) counts[c.cls]++; else pending++;
    summary.replaceChildren(
      ...(Object.keys(counts) as RuleClass[]).map((k) => h('span.cls-chip', { style: `--c:${classVar(k)}` }, `${k} · ${counts[k]}`)),
      pending ? h('span.dim', {}, ` classifying ${pending}…`) : h('span'),
    );
  }

  function paint(c: Card) {
    const d = c.img.data;
    // Cells are a couple of px here, so flat slate squares on the kaya board.
    const on = rgb('--slate'), off = rgb('--board');
    const cells = c.run.cells;
    for (let i = 0; i < cells.length; i++) {
      const col = cells[i] ? on : off;
      d[i * 4] = col[0];
      d[i * 4 + 1] = col[1];
      d[i * 4 + 2] = col[2];
      d[i * 4 + 3] = 255;
    }
    c.ctx.putImageData(c.img, 0, 0);
  }

  function drawSpark(c: Card) {
    const cv = c.spark;
    const w = cv.clientWidth || 160, hh = cv.clientHeight || 28;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
    const ctx = cv.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const p = c.run.pops;
    const max = Math.max(1, ...p);
    ctx.strokeStyle = tok(c.cls ? CLASS_TOKEN[c.cls] : '--ink-2');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const n = Math.min(p.length, 600);
    const start = p.length - n;
    for (let i = 0; i < n; i++) {
      const x = (i / Math.max(1, n - 1)) * w, y = hh - 2 - (p[start + i] / max) * (hh - 4);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  let frame = 0;
  function loop() {
    requestAnimationFrame(loop);
    if (!active) return;
    frame++;
    let changed = false;
    for (const c of cards) {
      // Run fast until classified, then slow down to a gentle animation.
      const steps = c.cls ? (frame % 3 === 0 ? 1 : 0) : 2;
      for (let s = 0; s < steps; s++) c.run.step();
      if (!c.cls && c.run.generation >= DECIDE_AT) {
        c.cls = c.run.verdict().cls;
        const v = c.run.verdict();
        c.badge.textContent = `${c.cls} · ${CLASS_INFO[c.cls].name}`;
        c.badge.style.setProperty('--c', classVar(c.cls));
        c.badge.classList.add('done');
        c.meta.textContent = `λ = ${v.lambda.toFixed(3)} · activity ${(v.activity * 100).toFixed(1)}% · density ${(v.density * 100).toFixed(1)}%${v.period ? ` · period ${v.period}` : ''}`;
        changed = true;
      }
      if (steps) paint(c);
      if (steps && frame % 10 === 0) drawSpark(c);
    }
    if (changed) updateSummary();
  }
  requestAnimationFrame(loop);

  build();
  return {
    activate() { active = true; },
    deactivate() { active = false; },
  };
}
