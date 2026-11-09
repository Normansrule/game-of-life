import type { Cell } from './life';
import { parseRLE, toRLE } from './rle';
import { parseRule, ruleToString } from './rules';

/**
 * Board links: a pattern, its rule and an optional name packed into the URL
 * fragment, so a link opens the board with that pattern on it.
 *
 *   #sim/b3s23/bo$2bo$3o!/Glider
 *
 * The middle part is the RLE body with its line breaks removed. RLE only uses
 * digits, b, o, $ and !, which are all safe in a fragment, so links stay
 * short and readable. The rule drops its slash (B3/S23 becomes b3s23) so it
 * doesn't split the path.
 */
export const SHARE_LIMIT = 4000; // characters of RLE; longer links get unwieldy in chat apps

export interface Shared { cells: Cell[]; rule: string; name?: string }

export function shareFragment(cells: Cell[], rule: string, name?: string): string | null {
  const rle = toRLE(cells, { rule });
  const body = rle.split('\n').filter((l) => !l.startsWith('#') && !/^x\s*=/.test(l)).join('');
  if (body.length > SHARE_LIMIT) return null;
  const r = ruleToString(parseRule(rule)).replace('/', '').toLowerCase();
  const tail = name ? `/${encodeURIComponent(name)}` : '';
  return `sim/${r}/${body}${tail}`;
}

/** Reads a fragment made by shareFragment (with or without the leading #). Returns null for anything else. */
export function parseShare(fragment: string): Shared | null {
  const m = /^#?sim\/([bs0-8]+)\/([0-9bo$!]+)(?:\/(.*))?$/i.exec(fragment);
  if (!m) return null;
  let rule: string;
  try {
    // b3s23 → B3/S23; parseRule accepts the slash-less form too.
    rule = ruleToString(parseRule(m[1]));
  } catch { return null; }
  const { cells } = parseRLE(m[2].endsWith('!') ? m[2] : `${m[2]}!`);
  if (!cells.length) return null;
  let name: string | undefined;
  if (m[3]) { try { name = decodeURIComponent(m[3]).slice(0, 80) || undefined; } catch { name = undefined; } }
  return { cells, rule, name };
}
