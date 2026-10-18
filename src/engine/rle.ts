import type { Cell } from './life';
import { bounds, normalize } from './life';

/**
 * Run Length Encoded patterns, the standard interchange format used by
 * LifeWiki, Golly and most Life software.
 *
 *   #N Glider
 *   x = 3, y = 3, rule = B3/S23
 *   bob$2bo$3o!
 *
 * `b` = dead, `o` = alive, `$` = end of row, `!` = end, and a number
 * before a token repeats it.
 */
export interface ParsedRLE {
  cells: Cell[];
  name?: string;
  rule?: string;
  comments: string[];
  width: number;
  height: number;
}

export function parseRLE(text: string): ParsedRLE {
  const comments: string[] = [];
  let name: string | undefined;
  let rule: string | undefined;
  let body = '';
  let width = 0;
  let height = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      if (/^#N/.test(line)) name = line.slice(2).trim();
      else comments.push(line.slice(2).trim());
      continue;
    }
    const header = /^x\s*=\s*(\d+)\s*,\s*y\s*=\s*(\d+)(?:\s*,\s*rule\s*=\s*([^\s]+))?/i.exec(line);
    if (header && !body) {
      width = +header[1];
      height = +header[2];
      if (header[3]) rule = header[3];
      continue;
    }
    body += line;
  }
  const cells: Cell[] = [];
  let x = 0;
  let y = 0;
  let count = '';
  for (const ch of body) {
    if (ch >= '0' && ch <= '9') {
      count += ch;
      continue;
    }
    const n = count ? parseInt(count, 10) : 1;
    count = '';
    if (ch === 'b' || ch === '.') x += n;
    else if (ch === '$') {
      y += n;
      x = 0;
    } else if (ch === '!') break;
    else if (/[a-zA-Z*]/.test(ch)) {
      // 'o' and any other live-state letter count as alive.
      for (let i = 0; i < n; i++) cells.push([x + i, y]);
      x += n;
    }
  }
  const b = bounds(cells);
  if (b) {
    width = Math.max(width, b.x1 + 1);
    height = Math.max(height, b.y1 + 1);
  }
  return { cells, name, rule, comments, width, height };
}

export function toRLE(input: Cell[], opts: { name?: string; rule?: string } = {}): string {
  const cells = normalize(input);
  const b = bounds(cells);
  const lines: string[] = [];
  if (opts.name) lines.push(`#N ${opts.name}`);
  if (!b) {
    lines.push(`x = 0, y = 0, rule = ${opts.rule ?? 'B3/S23'}`, '!');
    return lines.join('\n');
  }
  const w = b.x1 + 1;
  const h = b.y1 + 1;
  lines.push(`x = ${w}, y = ${h}, rule = ${opts.rule ?? 'B3/S23'}`);
  const grid: boolean[][] = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  for (const [x, y] of cells) grid[y][x] = true;

  const tokens: string[] = [];
  const push = (n: number, t: string) => {
    if (n <= 0) return;
    tokens.push((n > 1 ? String(n) : '') + t);
  };
  let pendingRows = 0;
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    let last = row.length - 1;
    while (last >= 0 && !row[last]) last--;
    if (last < 0) {
      pendingRows++;
      continue;
    }
    if (y > 0) push(pendingRows + 1, '$');
    pendingRows = 0;
    let run = 1;
    for (let x = 1; x <= last + 1; x++) {
      if (x <= last && row[x] === row[x - 1]) run++;
      else {
        push(run, row[x - 1] ? 'o' : 'b');
        run = 1;
      }
    }
  }
  // Wrap at 70 characters like Golly does.
  let out = '';
  let line = '';
  for (const t of [...tokens, '!']) {
    if (line.length + t.length > 70) {
      out += line + '\n';
      line = '';
    }
    line += t;
  }
  out += line;
  lines.push(out);
  return lines.join('\n');
}

/** Parse a plaintext picture: `O`/`*`/`#` alive, anything else dead. */
export function parsePlaintext(text: string): Cell[] {
  const cells: Cell[] = [];
  text
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('!'))
    .forEach((line, y) => {
      for (let x = 0; x < line.length; x++) if ('O*#o'.includes(line[x])) cells.push([x, y]);
    });
  return cells;
}
