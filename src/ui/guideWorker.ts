/// <reference lib="webworker" />
/**
 * The field guide's long measurements, one at a time, off the main thread:
 * methuselahs run to the end (Rabbits takes half a minute, with progress every
 * 500 generations), and growth patterns run for 2,000 generations.
 */
import { type GrowthFacts, type RunFacts, measureGrowth, measureRun } from '../engine/guide';
import { getPattern, patternCells } from '../engine/patterns';

export type GuideRequest = { ids: string[] };
export type GuideMessage = { id: string; gen: number } | { id: string; run: RunFacts } | { id: string; growth: GrowthFacts };

self.onmessage = (e: MessageEvent<GuideRequest>) => {
  for (const id of e.data.ids) {
    const cells = patternCells(id);
    if (getPattern(id)?.category === 'Growth') postMessage({ id, growth: measureGrowth(cells) } satisfies GuideMessage);
    else postMessage({ id, run: measureRun(cells, { onProgress: (gen) => postMessage({ id, gen } satisfies GuideMessage) }) } satisfies GuideMessage);
  }
};
