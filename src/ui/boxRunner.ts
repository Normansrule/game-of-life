/**
 * The exhaustive 4×4 census loop, shared by the Web Worker and the
 * main-thread fallback. Results are posted in batches so the page can draw
 * progress as it goes.
 */
import { type BoxRecord, FateRunner, boxCensus, orbitRepresentatives } from '../engine/exhaustive';

export interface BoxMessage {
  type: 'batch';
  total: number;
  done: number;
  records: BoxRecord[];
}

export type BoxCommand = { type: 'start'; n: number; maxGen: number } | { type: 'stop' };

export function createBoxRunner(post: (m: BoxMessage) => void) {
  let token = 0;
  return (m: BoxCommand) => {
    const my = ++token;
    if (m.type === 'stop') return;
    const reps = orbitRepresentatives(m.n);
    const runner = new FateRunner();
    let k = 0;
    const BATCH = 64;
    const next = () => {
      if (my !== token) return;
      const records = boxCensus(reps, m.n, k, k + BATCH, m.maxGen, runner);
      k += records.length;
      post({ type: 'batch', total: reps.length, done: k, records });
      if (k < reps.length) setTimeout(next, 0);
    };
    next();
  };
}
