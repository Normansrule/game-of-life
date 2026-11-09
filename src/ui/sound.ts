/**
 * Listen to the board. Each generation, the newborn stones on screen are
 * counted in vertical bands, left to right, and every band with births plays
 * a soft plucked note: low notes on the left, high on the right, on a
 * pentatonic scale so any mix of notes sounds consonant. More births in a
 * band make its note louder. A glider sounds as a little figure walking up
 * or down the scale; a glider gun is a steady beat; a soup is a shimmer.
 *
 * Nothing is created until the person turns sound on, as browsers require.
 */
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic, in semitones
export const BANDS = 15;       // three octaves
const ROOT = 220;              // A3
const MAX_NOTES = 5;           // per generation, so a soup doesn't turn into noise
const MIN_GAP = 1 / 14;        // seconds between generations that sound

const freq = (band: number) => ROOT * Math.pow(2, (12 * Math.floor(band / SCALE.length) + SCALE[band % SCALE.length]) / 12);

export class BoardSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private lastAt = 0;
  on = false;

  /** Call from a click or key press: browsers only start audio after a gesture. */
  async enable(): Promise<boolean> {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      // A gentle compressor keeps a busy board from clipping.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(comp).connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.on = true;
    return true;
  }

  disable() {
    this.on = false;
    void this.ctx?.suspend();
  }

  /** Whether a generation stepped now would be heard, so callers can skip counting births when it wouldn't. */
  ready(): boolean {
    return this.on && !!this.ctx && this.ctx.currentTime - this.lastAt >= MIN_GAP;
  }

  /** births[i] is the number of newborn stones in band i, left to right. */
  play(births: number[]) {
    const ctx = this.ctx, out = this.out;
    if (!this.on || !ctx || !out || !this.ready()) return;
    const t = ctx.currentTime;
    this.lastAt = t;
    const loud = births.map((n, i) => ({ i, n })).filter((b) => b.n > 0).sort((a, b) => b.n - a.n).slice(0, MAX_NOTES);
    for (const { i, n } of loud) {
      const level = Math.min(1, 0.35 + 0.22 * Math.log2(n)) * 0.22;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq(i);
      // A plucked envelope: quick attack, then a soft exponential decay.
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(level, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    }
  }
}

/** Newborn stones (age 1) within the visible columns, counted in BANDS bands. Rows outside the view are skipped too. */
export function birthBands(age: Uint8Array, w: number, h: number, x0: number, x1: number, y0: number, y1: number): number[] {
  const out = Array<number>(BANDS).fill(0);
  const xa = Math.max(0, Math.floor(x0)), xb = Math.min(w - 1, Math.ceil(x1));
  const ya = Math.max(0, Math.floor(y0)), yb = Math.min(h - 1, Math.ceil(y1));
  const span = Math.max(1, xb - xa + 1);
  for (let y = ya; y <= yb; y++) {
    const row = y * w;
    for (let x = xa; x <= xb; x++) if (age[row + x] === 1) out[Math.min(BANDS - 1, Math.floor(((x - xa) / span) * BANDS))]++;
  }
  return out;
}
