import { describe, expect, it } from 'vitest';
import { Sandpile, logBins, linearFit, sandpileAdd, sandpileIdentity } from '../src/engine/models/sandpile';
import { FHP, bits, collisionTables, momentum } from '../src/engine/models/fhp';
import { EMPTY, FISH, SHARK, Wator } from '../src/engine/models/wator';
import { Excitable } from '../src/engine/models/excitable';
import { Reiter } from '../src/engine/models/reiter';
import { mulberry32 } from '../src/engine/census';

describe('Abelian sandpile', () => {
  it('conserves grains: added = on the grid + lost', () => {
    const p = new Sandpile(20, 20);
    const rng = mulberry32(1);
    let lost = 0;
    for (let k = 0; k < 5000; k++) lost += p.add(Math.floor(rng() * 20), Math.floor(rng() * 20)).lost;
    expect(p.grains + lost).toBe(5000);
    expect(Math.max(...p.h)).toBeLessThan(4);
  });

  it('is abelian: the order of additions does not matter', () => {
    const rng = mulberry32(7);
    const drops = Array.from({ length: 3000 }, () => [Math.floor(rng() * 15), Math.floor(rng() * 15)]);
    const a = new Sandpile(15, 15), b = new Sandpile(15, 15);
    let ta = 0, tb = 0;
    for (const [x, y] of drops) ta += a.add(x, y).size;
    for (const [x, y] of [...drops].reverse()) tb += b.add(x, y).size;
    expect([...a.h]).toEqual([...b.h]);
    expect(ta).toBe(tb); // total topplings are order-independent too
  });

  it('computes the identity of the sandpile group', () => {
    const w = 24, h = 17;
    const e = sandpileIdentity(w, h);
    expect([...sandpileAdd(e, e, w, h)]).toEqual([...e]);
    const full = new Int32Array(w * h).fill(3);
    expect([...sandpileAdd(full, e, w, h)]).toEqual([...full]);
    // The identity of a rectangle has its mirror symmetries.
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expect(e[y * w + x]).toBe(e[y * w + (w - 1 - x)]);
  });

  it('fits power-law slopes from log bins', () => {
    const xs: number[] = [];
    for (let s = 1; s <= 2000; s++) for (let k = 0; k < Math.round(1e6 / (s * s)); k++) xs.push(s);
    const { x, y } = logBins(xs, 5);
    const fit = linearFit(x.map(Math.log10), y.map(Math.log10));
    expect(fit.slope).toBeCloseTo(-2, 0);
  });
});

describe('FHP lattice gas', () => {
  it('collisions conserve mass and momentum for every state', () => {
    for (const t of collisionTables())
      for (let s = 0; s < 64; s++) {
        expect(bits(t[s])).toBe(bits(s));
        const [ax, ay] = momentum(s), [bx, by] = momentum(t[s]);
        expect(bx).toBeCloseTo(ax, 9);
        expect(by).toBeCloseTo(ay, 9);
      }
  });

  it('conserves particles with obstacles and forcing', () => {
    const g = new FHP(64, 32, mulberry32(3));
    for (let y = 10; y < 20; y++) g.solid[y * 64 + 20] = 1;
    for (let x = 0; x < 64; x++) { g.solid[x] = 1; g.solid[31 * 64 + x] = 1; }
    g.fill(0.3);
    const m0 = g.mass;
    for (let k = 0; k < 100; k++) g.step();
    expect(g.mass).toBe(m0);
  });

  it('the body force drives a net eastward flow', () => {
    const g = new FHP(64, 32, mulberry32(4));
    for (let x = 0; x < 64; x++) { g.solid[x] = 1; g.solid[31 * 64 + x] = 1; }
    g.fill(0.3);
    for (let k = 0; k < 200; k++) g.step();
    const ux = new Float32Array(64), uy = new Float32Array(64), rho = new Float32Array(64);
    g.velocity(8, ux, uy, rho);
    expect(ux.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe('Wa-Tor', () => {
  it('fish alone fill the ocean, sharks alone starve', () => {
    const f = new Wator(30, 20, { fishBreed: 3, sharkBreed: 10, sharkStarve: 4 }, mulberry32(5));
    f.seed(0.05, 0);
    for (let k = 0; k < 200; k++) f.step();
    expect(f.fish).toBeGreaterThan(550);
    const s = new Wator(30, 20, { fishBreed: 3, sharkBreed: 10, sharkStarve: 4 }, mulberry32(6));
    s.seed(0, 0.2);
    for (let k = 0; k < 20; k++) s.step();
    expect(s.sharks).toBe(0);
  });

  it('keeps counts consistent with the grid', () => {
    const g = new Wator(40, 30, { fishBreed: 3, sharkBreed: 8, sharkStarve: 3 }, mulberry32(8));
    g.seed(0.3, 0.05);
    for (let k = 0; k < 50; k++) g.step();
    const f = [...g.kind].filter((v) => v === FISH).length;
    const s = [...g.kind].filter((v) => v === SHARK).length;
    expect(g.fish).toBe(f);
    expect(g.sharks).toBe(s);
    expect(f + s + [...g.kind].filter((v) => v === EMPTY).length).toBe(1200);
  });
});

describe('Excitable medium', () => {
  it('a single stimulus spreads as a ring and the tissue returns to rest', () => {
    const m = new Excitable(80, 80);
    m.stimulate(40, 40, 2);
    let maxR = 0;
    for (let k = 0; k < 200; k++) {
      m.step();
      if (m.active) maxR = k;
    }
    expect(m.active).toBe(0);
    expect(maxR).toBeGreaterThan(20);
  });

  it('a broken wave curls into a self-sustaining spiral', () => {
    const m = new Excitable(100, 100);
    m.stimulateColumn(0);
    for (let k = 0; k < 25; k++) m.step();
    m.clear(0, 50, 100, 100);
    for (let k = 0; k < 600; k++) m.step();
    expect(m.excited).toBeGreaterThan(0);
    // A shock (defibrillation) stops it.
    m.shock();
    for (let k = 0; k < 20; k++) m.step();
    expect(m.active).toBe(0);
  });
});

describe('Reiter snowflake', () => {
  it('grows with exact six-fold symmetry', () => {
    const r = new Reiter(40, 1, 0.4, 0.001);
    for (let k = 0; k < 300; k++) r.step();
    expect(r.radius).toBeGreaterThan(3);
    for (let rr = -30; rr <= 30; rr++)
      for (let q = -30; q <= 30; q++) {
        if (Math.abs(q + rr) > 30) continue;
        // 60° rotation in axial coordinates: (q, r) -> (-r, q + r)
        expect(Math.abs(r.get(q, rr) - r.get(-rr, q + rr))).toBeLessThan(1e-9);
      }
  });
});

describe('Sandpile group', () => {
  it('the number of recurrent configurations equals det of the Laplacian', async () => {
    const { isRecurrent, sandpileGroupOrder } = await import('../src/engine/models/sandpile');
    for (const [w, h] of [[1, 1], [2, 1], [2, 2], [3, 2]]) {
      const n = w * h;
      let count = 0;
      const c = new Array(n).fill(0);
      for (let code = 0; code < 4 ** n; code++) {
        for (let i = 0, v = code; i < n; i++, v >>= 2) c[i] = v & 3;
        if (isRecurrent(c, w, h)) count++;
      }
      expect(BigInt(count)).toBe(sandpileGroupOrder(w, h));
    }
    expect(sandpileGroupOrder(2, 2)).toBe(192n);
  });
});

describe('v4 models', () => {
  it('Lenia: Orbium glides with constant mass', async () => {
    const { Lenia, ORBIUM_CELLS, stampPattern } = await import('../src/engine/models/lenia');
    const L = new Lenia(64, 64);
    stampPattern(L, ORBIUM_CELLS, 22, 22);
    for (let k = 0; k < 50; k++) L.step();
    const m0 = L.mass, c0 = L.centre()!;
    for (let k = 0; k < 150; k++) L.step();
    const m1 = L.mass, c1 = L.centre()!;
    expect(Math.abs(m1 - m0) / m0).toBeLessThan(0.03);
    const d = Math.hypot(((c1[0] - c0[0] + 96) % 64) - 32, ((c1[1] - c0[1] + 96) % 64) - 32);
    expect(d).toBeGreaterThan(5);
    // Rotated by a quarter turn it still lives.
    const R = new Lenia(64, 64);
    stampPattern(R, ORBIUM_CELLS, 22, 22, 1);
    for (let k = 0; k < 200; k++) R.step();
    expect(R.mass).toBeGreaterThan(60);
  }, 30000);

  it('Schelling: agents are conserved and mild preferences segregate', async () => {
    const { Schelling } = await import('../src/engine/models/schelling');
    const s = new Schelling(50, 50, mulberry32(11));
    s.seed(0.1);
    const count = (v: number) => [...s.g].filter((x) => x === v).length;
    const a = count(1), b = count(2);
    const before = s.segregation();
    s.threshold = 0.34;
    for (let k = 0; k < 60; k++) s.step();
    expect(count(1)).toBe(a);
    expect(count(2)).toBe(b);
    expect(before).toBeLessThan(0.55);
    expect(s.segregation()).toBeGreaterThan(0.7);
    const calm = new Schelling(30, 30, mulberry32(12));
    calm.seed(0.1);
    calm.threshold = 0;
    expect(calm.step()).toBe(0);
  });

  it('Hodgepodge levels stay in range', async () => {
    const { Hodgepodge } = await import('../src/engine/models/hodgepodge');
    const m = new Hodgepodge(40, 40);
    m.randomize(mulberry32(13));
    for (let k = 0; k < 100; k++) m.step();
    expect(Math.max(...m.s)).toBeLessThanOrEqual(200);
    expect(new Set(m.s).size).toBeGreaterThan(5); // still active
  });

  it('Nagel–Schreckenberg: cars conserved, no overtaking, flow peaks at low density', async () => {
    const { NaSch, naschFlow } = await import('../src/engine/models/nasch');
    const road = new NaSch(300, 60, 5, 0.3, mulberry32(14));
    for (let t = 0; t < 300; t++) {
      road.step();
      const p = [...road.pos];
      expect(new Set(p).size).toBe(60);
      for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThan(p[i - 1]);
      for (const v of road.vel) expect(v).toBeLessThanOrEqual(5);
    }
    const rng = mulberry32(15);
    const low = naschFlow(0.03, { rng }), peak = naschFlow(0.12, { rng }), jam = naschFlow(0.6, { rng });
    expect(peak).toBeGreaterThan(low);
    expect(peak).toBeGreaterThan(jam);
  });
});
