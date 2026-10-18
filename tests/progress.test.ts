import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRoadmap, renderSvg, textBar, updateReadme } from '../scripts/progress-lib.ts';

const sample = `intro
<!-- progress:start -->
old
<!-- progress:end -->
<!-- roadmap:start -->
#### Engine
- [x] **Fast** stepper
- [X] Hashlife
- [ ] Workers
#### Docs
- [ ] Tutorial
- [ ] Videos
- [ ] Translations
<!-- roadmap:end -->
- [ ] outside the markers is ignored
`;

describe('progress tracker', () => {
  it('counts ticked and unticked items per heading', () => {
    expect(parseRoadmap(sample)).toEqual([
      { name: 'Engine', done: 2, total: 3, next: ['Workers'] },
      { name: 'Docs', done: 0, total: 3, next: ['Tutorial', 'Videos'] },
    ]);
  });

  it('regenerates the summary in place and is idempotent', () => {
    const once = updateReadme(sample);
    expect(once).toContain('**2 of 6 roadmap items done (33%).**');
    expect(once).toContain('| Engine | ▰▰▰▰▰▰▰▱▱▱ 67% | 2 / 3 | Workers |');
    expect(once).not.toContain('old');
    expect(updateReadme(once)).toBe(once);
    expect(textBar(0, 0)).toBe('▱'.repeat(10));
  });

  it('draws one bar per area plus the overall bar, escaping labels', () => {
    const svg = renderSvg([{ name: 'A & B', done: 1, total: 2, next: [] }, { name: 'C', done: 0, total: 1, next: [] }]);
    expect(svg).toContain('A &amp; B');
    expect(svg.match(/class="grow"/g)).toHaveLength(2); // overall + A&B; an empty bar draws no fill
  });

  it('rejects a README without markers', () => {
    expect(() => parseRoadmap('no markers')).toThrow(/roadmap:start/);
  });

  it('the README tracker is up to date', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(parseRoadmap(readme).length).toBeGreaterThan(3);
    expect(updateReadme(readme)).toBe(readme);
  });
});
