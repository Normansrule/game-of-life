/**
 * Regenerates the README progress tracker from its roadmap checklist.
 *   npm run progress              update README.md and docs/media/progress.svg
 *   npm run progress -- --check   fail if either is out of date (used in CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRoadmap, renderSvg, updateReadme } from './progress-lib.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const readmePath = `${root}README.md`, svgPath = `${root}docs/media/progress.svg`;
const readme = readFileSync(readmePath, 'utf8');
const nextReadme = updateReadme(readme);
const nextSvg = renderSvg(parseRoadmap(readme));
let svg = '';
try { svg = readFileSync(svgPath, 'utf8'); } catch { /* first run */ }

if (process.argv.includes('--check')) {
  const stale = [nextReadme !== readme && 'README.md', nextSvg !== svg && 'docs/media/progress.svg'].filter(Boolean);
  if (stale.length) {
    console.error(`Progress tracker is out of date (${stale.join(', ')}). Run: npm run progress`);
    process.exit(1);
  }
  console.log('Progress tracker is up to date.');
} else {
  writeFileSync(readmePath, nextReadme);
  writeFileSync(svgPath, nextSvg);
  const areas = parseRoadmap(nextReadme);
  const done = areas.reduce((s, a) => s + a.done, 0), total = areas.reduce((s, a) => s + a.total, 0);
  console.log(`Progress: ${done} of ${total} items done.`);
}
