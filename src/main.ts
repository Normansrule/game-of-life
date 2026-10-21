import './style.css';
import { createSimulator } from './ui/simulator';
import { createLineageView } from './ui/lineageView';
import { createBasinView } from './ui/basinView';
import { createMathView } from './ui/mathView';
import { createAppsView } from './ui/appsView';
import { createSpacetimeView } from './ui/spacetimeView';
import { createDeepView } from './ui/deepView';
import { createAtlasView } from './ui/atlasView';
import { createEvolveView } from './ui/evolveView';
import { createPuzzlesView } from './ui/puzzlesView';
import { createAncestorsView } from './ui/ancestorsView';
import { on } from './ui/bus';
import { setupGetApp } from './ui/getApp';
import { h } from './ui/dom';
import { createHomeView } from './ui/homeView';
import { icon } from './ui/icons';
import { type Mode, getMode, initTheme, reducedMotion, setMode } from './ui/theme';

initTheme();

interface View {
  activate(): void;
  deactivate(): void;
}

const routes: Record<string, (root: HTMLElement) => View> = {
  home: createHomeView,
  sim: createSimulator,
  lineage: createLineageView,
  basins: createBasinView,
  ancestors: createAncestorsView,
  space: createSpacetimeView,
  deep: createDeepView,
  atlas: createAtlasView,
  evolve: createEvolveView,
  puzzles: createPuzzlesView,
  math: createMathView,
  apps: createAppsView,
};

const app = document.getElementById('app')!;
const views = new Map<string, { view: View; el: HTMLElement }>();
let current = '';

function ensure(route: string) {
  let v = views.get(route);
  if (!v) {
    const el = h('section.view', { 'data-view': route });
    app.append(el);
    let view: View;
    try {
      view = routes[route](el);
    } catch (e) {
      // One broken view shouldn't take the rest of the app down with it.
      console.error(e);
      el.replaceChildren(h('div.view-error', {}, h('div.state.error', {},
        h('h3', {}, 'This view could not start'),
        h('p', {}, 'Something in your browser stopped it from loading. The other views still work. Reloading the page usually fixes it; if it keeps happening, try another browser.'),
        h('pre', {}, String((e as Error)?.message ?? e)),
        h('div.actions', {}, h('button.primary', { onclick: () => location.reload() }, 'Reload'), h('button', { onclick: () => { location.hash = 'sim'; } }, 'Open the board')))));
      view = { activate() {}, deactivate() {} };
    }
    v = { el, view };
    views.set(route, v);
  }
  return v;
}

function show(route: string) {
  if (!routes[route]) route = 'home';
  if (route === current) return;
  views.get(current)?.view.deactivate();
  for (const [k, v] of views) v.el.hidden = k !== route;
  const v = ensure(route);
  v.el.hidden = false;
  document.body.dataset.route = route;
  current = route;
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
    const on = a.dataset.route === route;
    a.classList.toggle('active', on);
    if (on) { a.setAttribute('aria-current', 'page'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    else a.removeAttribute('aria-current');
  });
  placeTabDot();
  v.view.activate();
  window.scrollTo(0, 0);
}

const routeFromHash = () => location.hash.slice(1).split('/')[0] || 'home';
window.addEventListener('hashchange', () => show(routeFromHash()));
on('navigate', ({ route }) => {
  if (location.hash.slice(1) !== route) location.hash = route;
  else show(route);
});

// Lineage view must exist before the simulator can send it a pattern.
for (const r of ['lineage', 'space', 'deep']) ensure(r).el.hidden = true;
show(routeFromHash());
setupGetApp(document.getElementById('get-app'));

/** The star point under the active tab. It springs from tab to tab (see .tab-dot in style.css). */
function placeTabDot() {
  const dot = document.querySelector<HTMLElement>('.tab-dot');
  const a = document.querySelector<HTMLElement>('.tabs a.active');
  if (!dot) return;
  if (!a) { dot.style.opacity = '0'; return; }
  const first = dot.dataset.placed !== '1';
  if (first || reducedMotion()) dot.style.transition = 'none';
  dot.style.opacity = '1';
  dot.style.transform = `translateX(${a.offsetLeft + a.offsetWidth / 2}px)`;
  if (first || reducedMotion()) { void dot.offsetWidth; dot.style.transition = ''; }
  dot.dataset.placed = '1';
}
window.addEventListener('resize', placeTabDot);
document.fonts?.ready.then(placeTabDot);

// Colour mode: follows the system until you pick Daylight or Lamplight.
const modeBtn = document.getElementById('mode-btn')!;
const MODES: { m: Mode; label: string; icon: 'auto' | 'sun' | 'moon' }[] = [
  { m: 'system', label: 'Colours follow your system', icon: 'auto' },
  { m: 'light', label: 'Daylight colours', icon: 'sun' },
  { m: 'dark', label: 'Lamplight colours', icon: 'moon' },
];
function paintModeBtn() {
  const cur = MODES.find((x) => x.m === getMode())!;
  const next = MODES[(MODES.indexOf(cur) + 1) % MODES.length];
  modeBtn.replaceChildren(icon(cur.icon));
  modeBtn.setAttribute('aria-label', `${cur.label}. Switch to ${next.label.toLowerCase()}.`);
  modeBtn.title = `${cur.label} (click for ${next.label.toLowerCase()})`;
}
modeBtn.addEventListener('click', () => {
  const i = MODES.findIndex((x) => x.m === getMode());
  setMode(MODES[(i + 1) % MODES.length].m);
  paintModeBtn();
});
paintModeBtn();

// The skip link moves focus without changing the hash, which would change the route.
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); app.focus(); });
