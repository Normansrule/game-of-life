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
import { h } from './ui/dom';

interface View {
  activate(): void;
  deactivate(): void;
}

const routes: Record<string, (root: HTMLElement) => View> = {
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
    v = { el, view: routes[route](el) };
    views.set(route, v);
  }
  return v;
}

function show(route: string) {
  if (!routes[route]) route = 'sim';
  if (route === current) return;
  views.get(current)?.view.deactivate();
  for (const [k, v] of views) v.el.hidden = k !== route;
  const v = ensure(route);
  v.el.hidden = false;
  document.body.dataset.route = route;
  current = route;
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  v.view.activate();
  window.scrollTo(0, 0);
}

const routeFromHash = () => location.hash.slice(1).split('/')[0] || 'sim';
window.addEventListener('hashchange', () => show(routeFromHash()));
on('navigate', ({ route }) => {
  if (location.hash.slice(1) !== route) location.hash = route;
  else show(route);
});

// Lineage view must exist before the simulator can send it a pattern.
for (const r of ['lineage', 'space', 'deep']) ensure(r).el.hidden = true;
show(routeFromHash());
