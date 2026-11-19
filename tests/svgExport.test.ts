import { describe, expect, it } from 'vitest';
import { Svg2D, svgFileName, xml } from '../src/ui/svgExport';

const paths = (svg: string) => [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);

describe('SVG export (Svg2D)', () => {
  it('draws a full circle as two half arcs that end where they began', () => {
    const s = new Svg2D(100, 100);
    s.beginPath();
    s.arc(50, 50, 10, 0, Math.PI * 2);
    s.stroke();
    const [d] = paths(s.toString());
    expect(d).toBe('M60 50A10 10 0 0 1 40 50A10 10 0 0 1 60 50');
  });

  it('fills a field of same-sized dots as short round-capped strokes', () => {
    const s = new Svg2D(100, 100);
    s.fillStyle = 'blue';
    s.beginPath();
    for (const [x, y] of [[10, 10], [20, 30]]) {
      s.moveTo(x + 3, y); // as the views do, so no line joins one dot to the next
      s.arc(x, y, 3, 0, Math.PI * 2);
    }
    s.fill();
    expect(s.toString()).toContain('<path d="M10 10h0M20 30h0" fill="none" stroke="blue" stroke-width="6" stroke-linecap="round"/>');
    // Mixed sizes, or anything but circles, fall back to ordinary paths.
    const t = new Svg2D(100, 100);
    t.beginPath();
    t.arc(10, 10, 3, 0, Math.PI * 2);
    t.arc(40, 10, 5, 0, Math.PI * 2);
    t.fill();
    expect(t.toString()).toContain('A3 3 0 0 1');
    expect(t.toString()).not.toContain('h0');
  });

  it('follows the canvas rules for partial and anticlockwise arcs', () => {
    const s = new Svg2D(100, 100);
    s.beginPath();
    s.moveTo(0, 0);
    s.arc(50, 50, 10, 0, Math.PI / 2); // a line from the pen to the arc's start, then a quarter turn
    s.stroke();
    s.beginPath();
    s.arc(50, 50, 10, 0, Math.PI / 2, true); // the long way round, anticlockwise
    s.stroke();
    const [a, b] = paths(s.toString());
    expect(a).toBe('M0 0L60 50A10 10 0 0 1 50 60');
    expect(b).toBe('M60 50A10 10 0 1 0 50 60');
  });

  it('applies transforms to points, line widths and dashes, and save/restore undoes them', () => {
    const s = new Svg2D(200, 200);
    s.save();
    s.translate(10, 20);
    s.scale(2, 2);
    s.lineWidth = 1.5;
    s.setLineDash([2, 3]);
    s.strokeStyle = 'red';
    s.beginPath();
    s.moveTo(0, 0);
    s.lineTo(5, 5);
    s.stroke();
    s.restore();
    s.beginPath();
    s.moveTo(0, 0);
    s.lineTo(5, 5);
    s.stroke();
    const out = s.toString();
    expect(out).toContain('<path d="M10 20L20 30" fill="none" stroke="red" stroke-width="3" stroke-dasharray="4 6"/>');
    expect(out).toContain('<path d="M0 0L5 5" fill="none" stroke="#000" stroke-width="1"/>');
  });

  it('keeps rotated text exact with a matrix, and maps alignment to text-anchor', () => {
    const s = new Svg2D(100, 100);
    s.font = '12px "Some Font", sans-serif';
    s.fillText('plain', 5, 6);
    s.translate(50, 50);
    s.rotate(-Math.PI / 2);
    s.textAlign = 'right';
    s.globalAlpha = 0.5;
    s.fillText('R-pentomino <flew off>', 6, 3);
    const out = s.toString();
    expect(out).toContain('<text x="5" y="6" fill="#000" style="font:12px &quot;Some Font&quot;, sans-serif">plain</text>');
    expect(out).toContain('transform="matrix(0 -1 1 0 50 50)"');
    expect(out).toContain('text-anchor="end"');
    expect(out).toContain('opacity="0.5"');
    expect(out).toContain('R-pentomino &lt;flew off&gt;');
  });

  it('starts again on a full clear, writes a standalone document, and names files', () => {
    const s = new Svg2D(40, 30);
    s.fillRect(0, 0, 5, 5);
    s.setTransform(2, 0, 0, 2, 0, 0); // a device-pixel ratio, as the views set
    s.clearRect(0, 0, 20, 15);
    s.fillStyle = 'rgb(1,2,3)';
    s.fillRect(1, 1, 2, 2);
    const out = s.toString({ background: '#EBD3A1', title: 'A & B' });
    expect(out.match(/<rect/g)).toHaveLength(2);
    expect(out).toContain('<rect x="2" y="2" width="4" height="4" fill="rgb(1,2,3)"/>');
    expect(out.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" viewBox="0 0 40 30">')).toBe(true);
    expect(out).toContain('<title>A &amp; B</title>');
    expect(out.trim().endsWith('</svg>')).toBe(true);
    expect(xml('"<&>"')).toBe('&quot;&lt;&amp;&gt;&quot;');
    expect(svgFileName('Basin of 1,024 states: B3/S23')).toBe('life-tree-basin-of-1024-states-b3-s23.svg');
    expect(svgFileName('???')).toBe('life-tree-tree.svg');
  });
});
