import { h } from './dom';
import {
  type Demo,
  caveDemo,
  denoiseDemo,
  epidemicDemo,
  forestFireDemo,
  morphogenesisDemo,
  langtonDemo,
  rule30Demo,
  trafficDemo,
  wireworldDemo,
} from './demos';
import { bzDemo, leniaDemo, ringRoadDemo, schellingDemo } from './moreDemos';
import { fluidDemo, heartDemo, predatorPreyDemo, sandpileDemo, snowflakeDemo } from './physicsDemos';

interface App {
  title: string;
  field: string;
  body: string;
  link?: string;
  demo?: () => Demo;
}

const LIVE: App[] = [
  {
    title: 'Procedural cave generation',
    field: 'Games & graphics',
    body: 'Fill a map with random rock, then apply a Life-like smoothing rule (B5678/S45678) a few times. Noise turns into organic caverns. This is the standard technique behind cave levels in roguelikes and sandbox games because it is fast, tunable and needs no artist.',
    demo: caveDemo,
  },
  {
    title: 'Forest fires & self-organised criticality',
    field: 'Ecology & physics',
    body: 'The Drossel–Schwabl model: trees grow with probability p, lightning strikes with probability f, fire spreads to neighbours. The forest tunes itself to a critical state where fire sizes follow a power law, the same statistics seen in real wildfires, earthquakes and avalanches.',
    demo: forestFireDemo,
  },
  {
    title: 'Epidemics on a grid',
    field: 'Epidemiology',
    body: 'An SIRS automaton: susceptible cells catch the infection from infected neighbours with probability β per contact, recover, stay immune for a while, then become susceptible again. Spatial structure creates travelling waves and spirals that well-mixed (differential equation) models miss.',
    demo: epidemicDemo,
  },
  {
    title: 'Traffic jams (Rule 184)',
    field: 'Transport engineering',
    body: 'Each cell is a road slot; a car moves right if the slot ahead is empty. Below 50% density traffic flows freely; above it, jams appear and travel backwards, exactly as on real motorways. Extended with speeds and random braking, this is the Nagel–Schreckenberg model used in traffic simulators. The chart is the "fundamental diagram" of flow against density.',
    demo: trafficDemo,
  },
  {
    title: 'Random numbers (Rule 30)',
    field: 'Cryptography & computing',
    body: 'A one-dimensional automaton started from a single cell produces a centre column that passes many statistical randomness tests. Stephen Wolfram used it as a random number generator in Mathematica, and automata-based stream ciphers and hash functions are an active research area thanks to how cheaply they run in hardware.',
    demo: rule30Demo,
  },
  {
    title: 'Image denoising',
    field: 'Image processing',
    body: 'The "Anneal" rule (B4678/S35678) is a majority vote with a twist: each pixel copies what most of its neighbourhood shows. Applied to a noisy binary image it removes isolated speckles while keeping shapes. Cellular automata are used for noise removal, edge detection, segmentation and thinning on parallel hardware.',
    demo: denoiseDemo,
  },
  {
    title: 'Morphogenesis: spots and stripes',
    field: 'Developmental biology',
    body: 'David Young\'s 1984 automaton models Turing\'s reaction–diffusion idea: each cell is activated by nearby pigment cells and inhibited by ones further away. Changing the inhibition strength switches between leopard-like spots and zebra-like stripes, a simple model of animal coat patterns.',
    demo: morphogenesisDemo,
  },
  {
    title: 'Digital circuits (Wireworld)',
    field: 'Electronics & computing',
    body: 'Wireworld has four states: empty, copper, electron head and electron tail. Electrons flow along wires, and simple shapes act as diodes, splitters and logic gates. People have built a full Wireworld computer that calculates prime numbers. All three circuits below were checked by simulation before being put on the page.',
    demo: wireworldDemo,
  },
  {
    title: "Langton's ant: emergence",
    field: 'Complex systems',
    body: "One ant on a grid turns right on white squares, left on black ones, and flips the colour as it leaves. For about 10,000 steps it wanders chaotically, then suddenly builds a 'highway' that repeats every 104 steps forever. It is a classic example of how simple rules can hide long transients before order appears, and it is Turing complete in generalised forms.",
    demo: langtonDemo,
  },
  {
    title: 'Avalanches & self-organised criticality',
    field: 'Geophysics & statistical physics',
    body: 'The Bak–Tang–Wiesenfeld sandpile: drop grains one at a time; any site with four grains topples one onto each neighbour, which can set off more topplings. With no tuning at all the pile organises itself into a critical state where avalanche sizes follow a power law (a straight line on the log–log chart), the same statistics as earthquakes (the Gutenberg–Richter law), solar flares and neuronal avalanches in the brain. Drop at the centre instead and the stable pile grows a striking fractal. The model is abelian: the final pile does not depend on the order of topplings, which the test suite checks.',
    demo: sandpileDemo,
  },
  {
    title: 'Wind tunnel: a lattice-gas fluid',
    field: 'Aerodynamics & fluid dynamics',
    body: 'The FHP lattice gas moves about 100,000 particles on a hexagonal grid. Each step they stream to a neighbouring cell and collide by rules that conserve mass and momentum, nothing more. Averaged over blocks of cells (the arrows), this crude digital gas obeys the Navier–Stokes equations: flow speeds up around the obstacle and a slow wake forms behind it. Its descendant, the lattice Boltzmann method, is used in industry to simulate airflow over cars, flow through porous rock and blood in arteries.',
    demo: fluidDemo,
  },
  {
    title: 'Predators and prey (Wa-Tor)',
    field: 'Ecology',
    body: 'Fish (green) swim at random and breed; sharks (orange) eat neighbouring fish, breed, and starve if they go too long without food. The populations rise and crash in turn: fish boom, sharks feast and multiply, fish collapse, sharks starve, and the cycle repeats. The phase chart traces the loop that the Lotka–Volterra equations predict, ẋ = αx − βxy, ẏ = δxy − γy, but on a grid the cycles stay noisy and local instead of perfectly periodic, closer to real field data like the lynx–hare records of the Hudson\'s Bay Company.',
    demo: predatorPreyDemo,
  },
  {
    title: 'Heart rhythm, arrhythmia and defibrillation',
    field: 'Cardiology',
    body: 'Heart muscle is an excitable medium: a resting cell fires when its neighbours fire, then stays refractory for a while. In this Greenberg–Hastings automaton the pacemaker sends plane waves across the tissue, like a normal heartbeat. A badly timed extra beat breaks a wave, and its free end curls into a rotating spiral (re-entry) that fires faster than the pacemaker: a model of tachycardia and fibrillation. A defibrillator shock makes every cell fire at once so they all recover together and the spiral has nowhere to go. Real cardiac simulations use the same idea with detailed ion-channel models.',
    demo: heartDemo,
  },
  {
    title: 'Snowflakes: crystal growth',
    field: 'Materials science & meteorology',
    body: "Reiter's model puts water on a hexagonal lattice. Cells that are ice, or touch ice, absorb vapour; elsewhere vapour diffuses. Two numbers, the background vapour β and the vapour added γ, decide the shape, much as temperature and humidity do in Nakaya's diagram of real snow crystals: dendrites, ferns, broad branches and lacy plates all grow with exact six-fold symmetry. Similar automata model grain growth and solidification in metals.",
    demo: snowflakeDemo,
  },
  {
    title: 'Phantom traffic jams on a ring road',
    field: 'Transport engineering',
    body: 'In 2008 Sugiyama and colleagues put 22 cars on a circular track and asked the drivers to keep a steady speed. Within minutes a stop-and-go jam appeared out of nowhere and rolled backwards around the ring. The Nagel–Schreckenberg automaton explains why: each car speeds up to a limit, keeps its distance, and occasionally brakes for no reason. One random tap of the brakes is amplified by the cars behind until traffic stops. The space–time diagram shows the jams as streaks moving against the flow. Traffic agencies use this family of models to study speed limits and ramp metering.',
    demo: ringRoadDemo,
  },
  {
    title: 'Segregation from mild preferences (Schelling)',
    field: 'Sociology & economics',
    body: "Thomas Schelling's 1971 model, part of the work behind his 2005 Nobel prize in economics: two groups live on a grid, and an agent moves to a random empty home if fewer than some share of its neighbours are like it. Even when everyone is happy to be in a minority (wanting just a third of neighbours to be similar), the town sorts itself into large single-group districts. It is the classic demonstration that a collective outcome can be far more extreme than any individual's preference, and it is used in urban economics and agent-based policy modelling.",
    demo: schellingDemo,
  },
  {
    title: 'Chemical clocks: the BZ reaction',
    field: 'Chemistry',
    body: 'The Belousov–Zhabotinsky reaction oscillates between red and blue on its own and, in a thin dish, forms expanding rings and rotating spirals. The hodgepodge machine of Gerhardt and Schuster (1989) captures it with integer levels per cell: healthy cells are infected by their neighbours, infected cells grow more infected, and fully "ill" cells reset to healthy. The same excitable-medium mathematics as the heart demo, now in a beaker, and a model system for pattern formation in catalysis and biology.',
    demo: bzDemo,
  },
  {
    title: 'Lenia: continuous Life and artificial organisms',
    field: 'Artificial life',
    body: "Bert Chan's Lenia (2019) makes Life continuous: cell values are real numbers, the neighbourhood is a smooth ring of radius 13, and growth is a bell curve instead of a birth/survival table. Out of these rules come hundreds of 'species' that move, turn and collide like microorganisms. The creature here is Orbium, a glider with constant mass; the test suite checks that it keeps its mass and travels. Lenia is a testbed for open-ended evolution, self-organisation and the continuous neural cellular automata now used in machine learning.",
    demo: leniaDemo,
  },
];

const MORE: App[] = [
  { title: 'Universal computation', field: 'Theory of computation', body: 'Gliders are bits, collisions are logic gates, and Life can simulate any Turing machine. It is a standard example of how complex computation emerges from simple local rules and of why some questions (will this pattern ever die?) are undecidable.' },
  { title: 'Massively parallel hardware', field: 'Computer architecture', body: 'Every cell updates from local information only, which maps perfectly onto GPUs, FPGAs and systolic arrays. Quantum-dot cellular automata (QCA) are a proposed transistor-free logic technology built on the same principle.' },
  { title: 'Chemical waves', field: 'Chemistry', body: 'The Belousov–Zhabotinsky reaction makes target rings and spirals in a dish, the chemical cousin of the heart-tissue demo above. Excitable-medium automata reproduce its wave speeds and spiral periods and are used to study catalysis on surfaces.' },
  { title: 'Tumour growth & tissue modelling', field: 'Medicine', body: 'Hybrid cellular automata model individual cancer cells dividing, migrating and dying in response to nutrients and drugs on a grid, helping researchers study invasion patterns and treatment schedules.' },
  { title: 'Urban growth', field: 'Geography & planning', body: 'Models such as SLEUTH treat land parcels as cells that urbanise depending on their neighbours, slope and roads. They are calibrated on historical maps and used to forecast sprawl under different planning policies.' },
  { title: 'Earthquake forecasting', field: 'Seismology', body: 'The Olami–Feder–Christensen model is a sandpile with friction: tectonic stress builds up uniformly and slips locally. It reproduces the Gutenberg–Richter law and aftershock sequences, and is used to test what can and cannot be forecast in critical systems.' },
  { title: 'Neural cellular automata', field: 'Machine learning', body: 'Replace Life\'s fixed rule with a small neural network and train it: "Growing Neural Cellular Automata" (Mordvintsev et al., 2020) learn to grow and regenerate images from a single cell, a model of self-repair and a new kind of distributed AI.' },
  { title: 'Artificial life & evolution', field: 'Complex systems', body: 'Life is the founding example of artificial life. Self-replicating patterns like the Gemini spaceship (2010) let researchers study self-organisation, replication and open-ended evolution in silico.' },
  { title: 'Art, music & design', field: 'Creative coding', body: 'Generative artists, musicians and architects use automata to produce textures, rhythms and facade patterns. Their mix of order and surprise is easy to steer by choosing the rule and the seed.' },
];

export function createAppsView(root: HTMLElement) {
  const demos: { demo: Demo; card: HTMLElement; visible: boolean; started: boolean; make: () => Demo }[] = [];
  const cards = LIVE.map((app) => {
    const holder = h('div.demo-holder');
    const card = h('article.app-card.live', {}, h('div.app-text', {}, h('span.field', {}, app.field), h('h3', {}, app.title), h('p', {}, app.body)), holder);
    demos.push({ demo: null as unknown as Demo, card, visible: false, started: false, make: app.demo! });
    return card;
  });
  const more = MORE.map((app) => h('article.app-card', {}, h('span.field', {}, app.field), h('h3', {}, app.title), h('p', {}, app.body)));
  root.append(
    h(
      'div.apps',
      {},
      h('header.math-hero', {}, h('h1', {}, 'Where cellular automata are used'), h('p', {}, 'Life itself is a toy, but its core idea (many simple cells, local rules, global behaviour) models a remarkable range of real systems. The first eighteen are running live in your browser. Every demo is a short, readable file: the models are in src/engine/models and src/ui/demos.ts.')),
      h('div.app-grid.live-grid', {}, ...cards),
      h('h2.more-title', {}, 'More applications'),
      h('div.app-grid', {}, ...more),
    ),
  );

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const d = demos.find((x) => x.card === e.target);
      if (!d) continue;
      d.visible = e.isIntersecting;
      if (d.visible && !d.started) {
        d.started = true;
        d.demo = d.make();
        d.card.querySelector('.demo-holder')!.append(d.demo.el);
      }
    }
  }, { rootMargin: '100px' });
  demos.forEach((d) => io.observe(d.card));

  let active = false;
  const loop = () => {
    requestAnimationFrame(loop);
    if (!active) return;
    for (const d of demos) if (d.visible && d.started) d.demo.tick();
  };
  requestAnimationFrame(loop);
  return {
    activate() { active = true; },
    deactivate() { active = false; },
  };
}
