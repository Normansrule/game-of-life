import { describe, expect, it } from 'vitest';
import { buildLineage } from '../src/engine/lineage';
import { analyzeStateSpace, layoutBasin, predecessorLists, successorTable } from '../src/engine/basins';
import { patternCells } from '../src/engine/patterns';

describe('lineage tree', () => {
  it('a lone glider is one segment that escapes', () => {
    const r = buildLineage(patternCells('glider'), { size: 64, maxGen: 400 });
    expect(r.segments.length).toBe(1);
    expect(r.segments[0].fate).toBe('escaped');
    expect(r.segments[0].label).toBe('Glider');
  });
  it('diehard dies at 130 with everything accounted for', () => {
    const r = buildLineage(patternCells('diehard'), { maxGen: 500 });
    expect(r.generations).toBe(130);
    expect(r.populations.at(-1)).toBe(0);
    for (const s of r.segments) expect(s.fate).not.toBe('running');
  });
  it('the R-pentomino settles after 1103 generations into known objects', () => {
    const r = buildLineage(patternCells('rpentomino'), { size: 512, maxGen: 3000 });
    expect(r.stabilizedAt).toBeGreaterThanOrEqual(1103);
    // The last interaction happens at 1103 (a split or a death right at the end).
    expect(r.settledAt).toBeGreaterThan(1090);
    expect(r.settledAt).toBeLessThanOrEqual(1104);
    expect(r.escapes).toBeGreaterThanOrEqual(6); // its six gliders (plus nothing else)
    expect(r.splits).toBeGreaterThan(0);
    const survivors = r.segments.filter((s) => s.fate === 'running');
    expect(survivors.length).toBeGreaterThan(0);
    for (const s of survivors) expect(s.kind).not.toBe('unknown');
    // Children/parents are consistent.
    for (const s of r.segments) for (const c of s.children) expect(r.segments[c].parents).toContain(s.id);
  });
});

describe('basins of attraction', () => {
  it('3x3 torus: every state is accounted for', () => {
    const sp = analyzeStateSpace(3, 3);
    expect(sp.count).toBe(512);
    expect(sp.basins.reduce((a, b) => a + b.size, 0)).toBe(512);
    // On a 3x3 torus every cell sees all others, so everything dies or ...
    const empty = sp.basins[sp.basinOf[0]];
    expect(empty.cycle).toEqual([0]);
  });
  it('4x4 torus has Garden of Eden states and the empty attractor', () => {
    const sp = analyzeStateSpace(4, 4);
    expect(sp.gardensOfEden).toBeGreaterThan(0);
    let indegSum = 0;
    for (let s = 0; s < sp.count; s++) indegSum += sp.indeg[s];
    expect(indegSum).toBe(sp.count);
    // Cycle states really cycle.
    for (const b of sp.basins) {
      let s = b.cycle[0];
      for (let i = 0; i < b.cycle.length; i++) s = sp.succ[s];
      expect(s).toBe(b.cycle[0]);
    }
  });
  it('a block is a fixed point of the successor map', () => {
    const succ = successorTable(4, 4);
    const block = (1 << 5) | (1 << 6) | (1 << 9) | (1 << 10);
    expect(succ[block]).toBe(block);
  });
  it('layout covers the whole basin', () => {
    const sp = analyzeStateSpace(4, 4);
    const P = predecessorLists(sp.succ);
    for (const b of sp.basins.slice(0, 20)) {
      const l = layoutBasin(sp, b.id, P);
      expect(l.nodes.length).toBe(b.size);
    }
  });
});
