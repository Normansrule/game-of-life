/**
 * Sound effects, synthesised rather than sampled, so there are no audio files
 * to load or license. A slate stone landing on a kaya board is a very short
 * click (filtered noise) on top of a ringing knock (two damped sines, the wood)
 * and a soft low thump (the board's body). Each stone is a little different
 * in pitch and loudness, as real ones are.
 *
 * Off until the person turns it on with the speaker button in the top bar.
 * The setting is kept in localStorage. No audio is created before the first
 * sound, and nothing plays while the page is hidden.
 */
const STORE = 'life-tree:sfx';
type Listener = (on: boolean) => void;

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = (() => { try { return localStorage.getItem(STORE) === 'on'; } catch { return false; } })();
const listeners: Listener[] = [];

export const sfxOn = () => enabled;
export function onSfx(fn: Listener) { listeners.push(fn); }

export function setSfx(on: boolean) {
  enabled = on;
  try { localStorage.setItem(STORE, on ? 'on' : 'off'); } catch { /* not kept */ }
  if (on) void audio()?.resume();
  listeners.forEach((fn) => fn(on));
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(ctx.destination);
  // Half a second of white noise, reused for every click.
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function ready(): AudioContext | null {
  if (!enabled || document.hidden) return null;
  const c = audio();
  if (!c || !out) return null;
  if (c.state === 'suspended') void c.resume();
  return c;
}

/** A damped sine starting at t: freq in Hz, peak gain, decay time constant in seconds. */
function ring(c: AudioContext, t: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine') {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
  g.gain.setTargetAtTime(0.0001, t + 0.002, decay);
  o.connect(g).connect(out!);
  o.start(t);
  o.stop(t + decay * 8);
}

function click(c: AudioContext, t: number, centre: number, peak: number, len: number) {
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = noise;
  f.type = 'bandpass';
  f.frequency.value = centre;
  f.Q.value = 1.4;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(out!);
  src.start(t, Math.random() * 0.4);
  src.stop(t + len + 0.01);
}

const jitter = (x: number, amt: number) => x * (1 + (Math.random() * 2 - 1) * amt);

/** A stone placed on the board. `weight` from 0 to 1 scales it, for stones dropped by the computer or a soup. */
export function stone(weight = 1) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const w = Math.max(0.15, Math.min(1, weight)) * jitter(1, 0.12);
  click(c, t, jitter(3200, 0.1), 0.5 * w, 0.012);
  ring(c, t, jitter(1180, 0.05), 0.22 * w, 0.018);
  ring(c, t, jitter(2650, 0.06), 0.08 * w, 0.01);
  ring(c, t, jitter(190, 0.08), 0.28 * w, 0.03);
}

/** A stone taken off the board: a softer, higher, shorter tick. */
export function lift() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.005;
  click(c, t, jitter(4200, 0.1), 0.18, 0.008);
  ring(c, t, jitter(1650, 0.05), 0.07, 0.012);
}

/** A small pentatonic rising figure, for a solved puzzle or a won game. `notes` from 2 to 5. */
export function chime(notes = 4) {
  const c = ready();
  if (!c) return;
  const scale = [0, 4, 7, 12, 16];
  const t0 = c.currentTime + 0.02;
  for (let i = 0; i < Math.min(5, notes); i++) {
    const t = t0 + i * 0.085;
    ring(c, t, 523.25 * Math.pow(2, scale[i] / 12), 0.12, 0.22, 'triangle');
  }
}

/** A low, short pair of notes for a loss or a wrong answer. Gentle, not a buzzer. */
export function thud() {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + 0.02;
  ring(c, t, 220, 0.12, 0.12, 'triangle');
  ring(c, t + 0.11, 174.6, 0.12, 0.18, 'triangle');
}
