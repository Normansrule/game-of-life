/**
 * The GA loop shared by the Web Worker and the main-thread fallback (used
 * when a page is not allowed to start workers).
 */
import { DensityGA, type GAOptions, performance, ruleHex, ruleLambda } from '../engine/evolve';

export interface GenMessage {
  type: 'gen';
  generation: number;
  best: { id: number; rule: number[]; hex: string; fitness: number; lambda: number };
  mean: number;
  individuals: { id: number; parents: number[]; fitness: number; elite: boolean }[];
  perf?: number;
  ms: number;
}

export type Command = { type: 'start'; opts: Partial<GAOptions> } | { type: 'pause' } | { type: 'resume' } | { type: 'stop' };

export function createRunner(post: (m: GenMessage) => void, now: () => number) {
  let ga: DensityGA | null = null;
  let running = false;

  async function loop() {
    while (running && ga) {
      const t0 = now();
      ga.evaluate();
      const best = ga.pop[0];
      const msg: GenMessage = {
        type: 'gen',
        generation: ga.generation,
        best: { id: best.id, rule: Array.from(best.rule), hex: ruleHex(best.rule), fitness: best.fitness, lambda: ruleLambda(best.rule) },
        mean: ga.pop.reduce((a, b) => a + b.fitness, 0) / ga.pop.length,
        individuals: ga.pop.map((p) => ({ id: p.id, parents: p.parents, fitness: p.fitness, elite: p.elite })),
        ms: 0,
      };
      if (ga.generation % 5 === 0) msg.perf = performance(best.rule, 200, ga.o.n, 1000 + ga.generation);
      msg.ms = now() - t0;
      post(msg);
      ga.breed();
      await new Promise((r) => setTimeout(r, 0)); // let control messages (and the page) in
    }
  }

  return (m: Command) => {
    if (m.type === 'start') {
      ga = new DensityGA(m.opts);
      if (!running) { running = true; loop(); }
    } else if (m.type === 'pause') running = false;
    else if (m.type === 'stop') { running = false; ga = null; }
    else if (m.type === 'resume' && !running) { running = true; loop(); }
  };
}
