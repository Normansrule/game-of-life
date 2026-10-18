/**
 * Outer-totalistic, two-state rules on the Moore neighbourhood.
 *
 * A rule is written in "B/S" notation: `B3/S23` means a dead cell is Born
 * with exactly 3 live neighbours and a live cell Survives with 2 or 3.
 * There are 2^9 choices of birth set and 2^9 of survival set, so
 * 2^18 = 262,144 rules in this family. Conway's Life is just one of them.
 */
export interface Rule {
  birth: boolean[]; // index = live-neighbour count 0..8
  survive: boolean[];
  name: string;
}

export function parseRule(text: string): Rule {
  const t = text.trim().toUpperCase().replace(/\s+/g, '');
  let b = '';
  let s = '';
  const bs = /^B([0-8]*)\/?S([0-8]*)$/.exec(t);
  const sb = /^S([0-8]*)\/?B([0-8]*)$/.exec(t);
  const legacy = /^([0-8]*)\/([0-8]*)$/.exec(t); // "23/3" = S/B order
  if (bs) [, b, s] = bs;
  else if (sb) [, s, b] = sb;
  else if (legacy) [, s, b] = legacy;
  else throw new Error(`Cannot parse rule "${text}". Use B/S notation, e.g. B3/S23.`);
  const birth = Array<boolean>(9).fill(false);
  const survive = Array<boolean>(9).fill(false);
  for (const c of b) birth[+c] = true;
  for (const c of s) survive[+c] = true;
  const r: Rule = { birth, survive, name: '' };
  r.name = ruleToString(r);
  return r;
}

export function ruleToString(r: Rule): string {
  const digits = (a: boolean[]) => a.map((v, i) => (v ? String(i) : '')).join('');
  return `B${digits(r.birth)}/S${digits(r.survive)}`;
}

/** Lookup table indexed by (alive << 4) | neighbourCount -> next state. */
export function ruleTable(r: Rule): Uint8Array {
  const t = new Uint8Array(32);
  for (let n = 0; n <= 8; n++) {
    t[n] = r.birth[n] ? 1 : 0;
    t[16 | n] = r.survive[n] ? 1 : 0;
  }
  return t;
}

export interface RulePreset {
  rule: string;
  name: string;
  blurb: string;
}

export const RULE_PRESETS: RulePreset[] = [
  { rule: 'B3/S23', name: "Conway's Life", blurb: 'The classic. Gliders, guns, and universal computation.' },
  { rule: 'B36/S23', name: 'HighLife', blurb: 'Life plus birth on 6. Famous for a small self-replicator.' },
  { rule: 'B3678/S34678', name: 'Day & Night', blurb: 'Symmetric under swapping live and dead cells.' },
  { rule: 'B2/S', name: 'Seeds', blurb: 'Every cell dies each step. Explosive, chaotic growth.' },
  { rule: 'B3/S012345678', name: 'Life without Death', blurb: 'Cells never die; grows ladders and crystals.' },
  { rule: 'B3/S12345', name: 'Maze', blurb: 'Grows into labyrinths.' },
  { rule: 'B1357/S1357', name: 'Replicator', blurb: 'Every pattern copies itself (parity rule, linear over GF(2)).' },
  { rule: 'B35678/S5678', name: 'Diamoeba', blurb: 'Forms large diamond-shaped amoebas.' },
  { rule: 'B36/S125', name: '2x2', blurb: 'Block-based behaviour with many oscillators.' },
  { rule: 'B368/S245', name: 'Morley', blurb: 'Also called Move; rich in spaceships.' },
  { rule: 'B4678/S35678', name: 'Anneal', blurb: 'Majority vote smoothing: domains coarsen like cooling metal.' },
  { rule: 'B3/S45678', name: 'Coral', blurb: 'Slow, coral-like growth.' },
];
