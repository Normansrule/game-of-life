/**
 * The README progress tracker. The roadmap is a plain Markdown checklist in
 * README.md between `<!-- roadmap:start -->` and `<!-- roadmap:end -->`,
 * grouped by `####` headings. From it we generate two things:
 *   - the summary between `<!-- progress:start -->` and `<!-- progress:end -->`
 *     (an overall count and a table with a text bar per area), and
 *   - docs/media/progress.svg, an animated bar chart of the same numbers.
 * Tick a box, run `npm run progress`, and both update. CI runs
 * `npm run progress -- --check` so they cannot drift apart.
 */

export interface Area {
  name: string;
  done: number;
  total: number;
  /** The first unticked items, as a hint of what comes next. */
  next: string[];
}

const block = (md: string, tag: string) => {
  const start = `<!-- ${tag}:start -->`, end = `<!-- ${tag}:end -->`;
  const a = md.indexOf(start), b = md.indexOf(end);
  if (a < 0 || b < a) throw new Error(`README is missing the ${start} … ${end} markers`);
  return { a: a + start.length, b, inner: md.slice(a + start.length, b) };
};

export function parseRoadmap(md: string): Area[] {
  const areas: Area[] = [];
  for (const line of block(md, 'roadmap').inner.split('\n')) {
    const head = /^####\s+(.+?)\s*$/.exec(line);
    if (head) { areas.push({ name: head[1], done: 0, total: 0, next: [] }); continue; }
    const item = /^\s*[-*]\s+\[( |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (!item) continue;
    const area = areas[areas.length - 1];
    if (!area) throw new Error(`Roadmap item before any #### heading: ${line.trim()}`);
    area.total++;
    if (item[1] !== ' ') area.done++;
    else if (area.next.length < 2) area.next.push(item[2].replace(/\*\*/g, ''));
  }
  return areas;
}

export const pct = (done: number, total: number) => (total ? Math.round((100 * done) / total) : 0);

/** A ten-character bar, e.g. ▰▰▰▰▰▰▰▱▱▱, for places an image cannot go. */
export function textBar(done: number, total: number, width = 10): string {
  const full = total ? Math.round((width * done) / total) : 0;
  return '▰'.repeat(full) + '▱'.repeat(width - full);
}

export function renderSummary(areas: Area[]): string {
  const done = areas.reduce((s, a) => s + a.done, 0), total = areas.reduce((s, a) => s + a.total, 0);
  const rows = areas.map((a) => `| ${a.name} | ${textBar(a.done, a.total)} ${pct(a.done, a.total)}% | ${a.done} / ${a.total} | ${a.next.join('; ') || 'all done'} |`);
  return [
    '',
    '![Progress by area](docs/media/progress.svg)',
    '',
    `**${done} of ${total} roadmap items done (${pct(done, total)}%).** Generated from the checklist below by \`npm run progress\`.`,
    '',
    '| Area | Progress | Done | Up next |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An animated SVG: each bar grows from zero, one after another. */
export function renderSvg(areas: Area[]): string {
  const done = areas.reduce((s, a) => s + a.done, 0), total = areas.reduce((s, a) => s + a.total, 0);
  const W = 720, rowH = 34, top = 92, barX = 210, barW = 380;
  const H = top + areas.length * rowH + 18;
  const bar = (x: number, y: number, w: number, h: number, frac: number, fill: string, delay: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="track"/>` +
    (frac > 0 ? `<rect class="grow" style="animation-delay:${delay.toFixed(2)}s" x="${x}" y="${y}" width="${Math.max(h, w * frac).toFixed(1)}" height="${h}" rx="${h / 2}" class="${fill}"/>` : '');
  const rows = areas.map((a, i) => {
    const y = top + i * rowH;
    return `<text x="24" y="${y + 14}" class="label">${esc(a.name)}</text>` +
      bar(barX, y + 2, barW, 14, a.total ? a.done / a.total : 0, 'fill', 0.3 + i * 0.12) +
      `<text x="${barX + barW + 16}" y="${y + 14}" class="num">${pct(a.done, a.total)}%  <tspan class="dim">${a.done}/${a.total}</tspan></text>`;
  }).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Roadmap progress: ${done} of ${total} items done">
  <style>
    /* Common Room colours: ink and slate on kaya, with a lamplight version for dark mode. */
    .bg { fill: #EBD3A1; } .track { fill: rgba(47, 33, 14, 0.14); } .fill { fill: #1E1D1C; } .star { fill: #2F210E; }
    text { font-family: 'Bricolage Grotesque', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; fill: #2F210E; }
    .title { font-size: 18px; font-weight: 600; }
    .label { font-size: 14px; }
    .num { font-size: 13px; font-family: ui-monospace, Menlo, Consolas, monospace; }
    .dim { fill: #6B5432; }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #241A11; } .track { fill: rgba(241, 223, 188, 0.14); } .fill { fill: #F1DFBC; } .star { fill: #F1DFBC; }
      text { fill: #F1DFBC; } .dim { fill: #B59D78; }
    }
    .grow { transform-box: fill-box; transform-origin: left; animation: grow 1.1s cubic-bezier(.2,.8,.2,1) both; }
    @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    @media (prefers-reduced-motion: reduce) { .grow { animation: none; } }
  </style>
  <rect width="${W}" height="${H}" rx="8" class="bg"/>
  <circle cx="28" cy="30" r="4" class="star"/>
  <text x="42" y="36" class="title">Life Tree roadmap</text>
  <text x="${W - 24}" y="36" class="num" text-anchor="end">${done} / ${total} done · ${pct(done, total)}%</text>
  ${bar(24, 50, W - 48, 18, total ? done / total : 0, 'fill', 0)}
  ${rows}
</svg>
`;
}

/** Returns the README with its summary block regenerated. */
export function updateReadme(md: string): string {
  const { a, b } = block(md, 'progress');
  return md.slice(0, a) + renderSummary(parseRoadmap(md)) + md.slice(b);
}
