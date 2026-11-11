# Life Tree: Conway's Game of Life on a Go board

[![CI](https://github.com/Normansrule/game-of-life/actions/workflows/ci.yml/badge.svg)](https://github.com/Normansrule/game-of-life/actions/workflows/ci.yml)
[![Web app](https://github.com/Normansrule/game-of-life/actions/workflows/pages.yml/badge.svg)](https://normansrule.github.io/game-of-life/)
[![Desktop apps](https://github.com/Normansrule/game-of-life/actions/workflows/release.yml/badge.svg)](https://github.com/Normansrule/game-of-life/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/Normansrule/game-of-life?label=download)](https://github.com/Normansrule/game-of-life/releases/latest)

**[Open the web app](https://normansrule.github.io/game-of-life/)** · **[Download for Windows, macOS or Linux](https://github.com/Normansrule/game-of-life/releases/latest)** · [Setup](#setup-and-usage) · [Design](#design) · [Progress](#progress-tracker)

In 1970 John Conway and his students worked out the Game of Life by hand, with stones on a Go board. Life Tree hands you that board. Place a few stones, press play, and then follow them anywhere: forward through a **lineage tree** of every object that splits, collides and dies, backward to the patterns that could have come **before**, up into a **3D spacetime** sculpture, a quadrillion generations ahead with **Hashlife**, sideways into 262,144 other rules, and down into the **math** that explains it. There are also eighteen live demos of cellular automata out in the world, from heart rhythms and wind tunnels to phantom traffic jams.

It's a static site written in TypeScript and built with Vite. Everything runs in your browser: there's no server and no account. It also installs as an offline app, and there's a desktop app built from the same code.

![Life Tree on a laptop, showing a glider gun's spacetime built from Go stones, and on a phone, showing the home page](docs/media/devices.jpg)

![The home page: scrolling drops five stones onto a 3D Go board, runs them, and stacks every generation into a tower](docs/media/home.gif)

## Key features

- **A story you scroll.** The website opens on a Go board in 3D. As you scroll, five stones drop onto it, the rule runs generation by generation, and then every generation is stacked into a tower you see from the side. Scroll back and it runs backwards.
- **A real board.** The simulator draws the grid as a Go board. Cells sit on the intersections as slate and clamshell stones, and each generation's births alternate black and white like turns, so you can see how old a pattern is. Copy a link and whoever opens it gets your board, or turn on sound and hear the newborn stones. Zoom out and the stones become flat cells, which keeps a 1,024 × 1,024 board fast. It renders with WebGL2 (Web Graphics Library 2) and falls back to a plain canvas.
- **Field guide.** A card for each of the 27 classic patterns, moving on its own small board, with facts the engine measures by running it: period, speed and heat, rotor and stator, and how long each methuselah takes to settle and what it leaves.
- **Lineage tree.** A family tree of every object in a pattern, laid out upward, radially or as a timeline.
- **Ancestors.** Runs the board backwards to find every pattern that could have produced yours one generation earlier.
- **3D spacetime and deep time.** Stack generations into a sculpture of Go stones you can turn, or jump up to 2^50 generations ahead with Hashlife.
- **State-space trees.** Every configuration of a tiny board, and the cycle each one falls into.
- **Rule atlas, evolution and puzzles.** Eighteen rules run side by side and get classified as they go. A genetic algorithm breeds rules that compute. Ten puzzles are checked by the engine.
- **Duel.** Life for two players, a variant called Immigration. Your black stones play the computer's white over five rounds, at three levels, or a friend on the same device.
- **Math and applications.** Nineteen sections of math with live charts, and eighteen running models of real systems.
- **Stones you can hear.** Turn on sound effects with the speaker in the top bar and every stone you place clicks onto the wood, on the main board, the home page, the puzzles and Duel. A solved puzzle or a won game gets a short chime.
- **Daylight and Lamplight.** Light and dark colour modes that follow your system, or that you pick with the sun and moon button.
- **Works everywhere.** The layout works on phones, every control can be reached with the keyboard, and reduced-motion settings are respected.

| Daylight | Lamplight |
| --- | --- |
| ![The board in light mode](docs/screenshots/board-light.png) | ![The board in dark mode](docs/screenshots/board-dark.png) |

## Use it three ways

| | How | Works offline |
| --- | --- | --- |
| **Web app** | Open **[normansrule.github.io/game-of-life](https://normansrule.github.io/game-of-life/)** in any modern browser. | After the first visit |
| **Installed app** | Open the web app, press **Get the app** in the top bar, then **Install in this browser** (Chrome, Edge, Android). On iPhone or iPad, use Safari's *Share*, then *Add to Home Screen*. It's a PWA (Progressive Web App), so it gets its own window and icon. | Yes |
| **Desktop app** | Download it from the **[latest release](https://github.com/Normansrule/game-of-life/releases/latest)**. For Windows there's an `.exe` installer or a portable `.exe`. For macOS there's a `.dmg`, and for Linux an `.AppImage` or `.deb`. | Yes |

The desktop builds aren't code-signed, so each system warns you the first time:
- **Windows:** choose *More info*, then *Run anyway*.
- **macOS:** right-click the app and choose *Open*.
- **Linux:** run `chmod +x Life-Tree-*.AppImage` first.

```mermaid
flowchart LR
  src["TypeScript source<br/>engine · render · ui"] --> vite["Vite build<br/>dist/"]
  vite --> sw["service worker<br/>+ web manifest"]
  sw --> pages["GitHub Pages<br/>web app"]
  pages --> pwa["installed app<br/>(PWA, offline)"]
  vite --> electron["Electron shell<br/>desktop/"]
  electron --> win["Windows<br/>.exe"]
  electron --> mac["macOS<br/>.dmg"]
  electron --> linux["Linux<br/>.AppImage · .deb"]
```

## Progress tracker

<!-- progress:start -->
![Progress by area](docs/media/progress.svg)

**40 of 49 roadmap items done (82%).** Generated from the checklist below by `npm run progress`.

| Area | Progress | Done | Up next |
| --- | --- | --- | --- |
| Simulator | ▰▰▰▰▰▰▰▰▰▱ 88% | 7 / 8 | Load patterns straight from LifeWiki |
| Trees and time | ▰▰▰▰▰▰▰▱▱▱ 71% | 5 / 7 | Hashlife in a Web Worker for huge patterns; Export any tree as an SVG file |
| Math | ▰▰▰▰▰▰▰▰▰▱ 89% | 8 / 9 | Glider synthesis: building patterns from colliding gliders |
| Applications | ▰▰▰▰▰▰▰▰▱▱ 75% | 3 / 4 | Neural cellular automata that regrow an image |
| Games and labs | ▰▰▰▰▰▰▰▰▱▱ 75% | 3 / 4 | A daily puzzle |
| Apps and publishing | ▰▰▰▰▰▰▰▰▱▱ 82% | 14 / 17 | Intel Mac build; Code-signed installers |
<!-- progress:end -->

### Releases

```mermaid
timeline
  title Life Tree releases
  v1 : Simulator, lineage tree, basins, math, 7 demos
  v2 : 3D spacetime, Hashlife deep time, soup census
  v3 : Heart, wind tunnel, sandpile, Wa-Tor, snowflakes
  v4 : Rule atlas, edge of chaos, traffic, Lenia
  v5 : Evolution lab, GKL, rule family tree
  v6 : Puzzles, every 4×4 pattern
  v7 : Ancestors, running time backwards
  v7.1 : Web app, desktop apps, animated README
  v8 : Common Room redesign, home page, light and dark modes
  v8.1 : Step back and undo, puzzle play, one voice for figures
  v8.2 : A scroll story on a 3D Go board, a rule toy, live view cards
  v8.3 : Duel, Life for two players against the computer
  v8.4 : Spacetime in Go stones, Duel with a friend
  v8.5 : Board links, listening to the board
  v8.6 : Stone sounds, paper grain, device mockups
  v8.7 : Field guide, every pattern measured
```

Full details in [CHANGELOG.md](CHANGELOG.md).

### Roadmap

Tick a box here and run `npm run progress` to redraw the bars above. CI fails if they are out of date.

<!-- roadmap:start -->
#### Simulator
- [x] WebGL2 renderer that draws the board as a Go board with stones (Canvas 2D fallback)
- [x] Draw, erase, pan, zoom and pinch on touch screens
- [x] 27-pattern library, 12 rule presets and any B/S rule
- [x] RLE and plaintext import and export
- [x] PNG screenshots and WebM video recording
- [x] Share a pattern as a link
- [x] Field guide: a card for every pattern, with facts measured by the engine
- [ ] Load patterns straight from LifeWiki

#### Trees and time
- [x] Lineage tree: upward, radial and timeline layouts
- [x] State-space trees (basins of attraction) on small tori
- [x] 3D spacetime with instanced cubes
- [x] Hashlife deep time to 2^32 generations and beyond
- [x] Ancestors: parent search and a family tree back in time
- [ ] Hashlife in a Web Worker for huge patterns
- [ ] Export any tree as an SVG file

#### Math
- [x] Mean-field theory, entropy, damage spreading, speed of light
- [x] Garden of Eden theorem and the replicator rule over F2
- [x] Soup census with a Zipf fit
- [x] Sandpile group and self-organised criticality
- [x] Rule space and the edge of chaos
- [x] Evolving computation (density classification)
- [x] Every pattern in a 4×4 box (Burnside, 8548 fates)
- [x] Running time backwards (2^25 pasts census)
- [ ] Glider synthesis: building patterns from colliding gliders

#### Applications
- [x] The original nine demos (caves, fires, epidemics, Rule 30 and more)
- [x] Heart, wind tunnel, sandpile, Wa-Tor and snowflakes
- [x] Traffic, segregation, chemical waves and Lenia
- [ ] Neural cellular automata that regrow an image

#### Games and labs
- [x] Rule atlas with live Wolfram classes
- [x] Evolution lab with a genetic algorithm and family tree
- [x] Ten puzzles checked by the engine
- [ ] A daily puzzle

#### Apps and publishing
- [x] Public GitHub repo with CI
- [x] Web app live on GitHub Pages
- [x] Installable, offline web app (PWA)
- [x] Desktop apps for Windows, macOS and Linux built in CI
- [x] First release with downloads (v7.1.0)
- [x] Animated README with GIFs and diagrams
- [x] Progress tracker in the README
- [x] Common Room redesign: a Go-board look with light and dark modes, and a home page
- [x] Step back in time and undo on the board; keyboard play and best scores in puzzles
- [x] A scroll story on a 3D Go board for the home page, with a rule toy and live view cards
- [x] Duel: two-player Immigration against a computer player at three levels
- [x] Spacetime drawn in lit Go stones; Duel against a friend on the same device
- [x] Links that open a board with your pattern on it, and sound for the board
- [x] Stone sound effects on every board, a paper-grain surface and device mockups in the README
- [ ] Intel Mac build
- [ ] Code-signed installers
- [ ] Automatic updates in the desktop app
<!-- roadmap:end -->


## Features in detail

### The board (simulator)
![The simulator running a random soup](docs/media/simulator.gif)

- **Go board renderer.** One GPU (graphics processing unit) thread works out each pixel. Lines run through the cell centres and star points sit every six lines. Stones are shaded and cast a small shadow. A newborn stone drops in on a spring, and a stone that dies lifts off and fades, at speeds slow enough to see it. You can colour the stones by turn, by age (white to black) or all slate. A plain canvas renderer takes over when WebGL2 isn't available.
- **Draw, erase, pan and zoom** with a mouse, trackpad or touch screen (pinch to zoom). A cleared board tells you how to get started again.
- **Step back in time** one generation at a time (the last few hundred generations are kept, depending on the board size), and **undo or redo** any drawing, stamp, clear or random soup.
- **Pattern library** of 27 classics: still lifes, oscillators, spaceships, methuselahs, guns and infinite growth. Rotate with R and flip with F before you place one.
- **12 rule presets**, including Life, HighLife, Day & Night, Seeds, Maze, Replicator and Anneal, or type any `B/S` rule (the neighbour counts that cause a **B**irth and let a cell **S**urvive).
- Wrapped or bounded worlds from 64 to 1,024 lines across, plus random and symmetric soups.
- Live statistics: population, births, deaths, density and speed. It also spots when a pattern goes still, oscillates (and with what period) or dies out.
- **RLE (run-length encoded) and plaintext import and export**, PNG screenshots and WebM **video recording**.
- **Board links.** The link button copies an address with the pattern, its rule and its name inside it, such as `#sim/b3s23/bo$2bo$3o!/Glider`. Opening it shows that board, paused, so the person you sent it to sees the pattern before it runs. On a phone it opens the share sheet. Nothing is uploaded: the whole pattern is in the link, up to about 4,000 characters of RLE.
- **Listen to the board** (L). Each generation, the newborn stones on screen play soft notes on a pentatonic scale: low on the left of the screen, high on the right, louder where more are born. A glider walks up or down the scale, a glider gun keeps a beat and a random soup shimmers. Only what you can see is heard, so zooming in on one corner isolates it.

### Field guide
A card for each of the 27 patterns in the library, each one moving on its own small Go board: oscillators loop through their cycle, spaceships travel, guns fire a steady stream and methuselahs play their first 200 generations while the view pulls back. Filter by kind, open any pattern on the board, or link straight to a card, such as `#guide/acorn`.

Nothing on a card is typed in by hand. Every number is measured by running the pattern:
- **Repeating patterns:** period, speed, the range of stones over a cycle, heat (stones placed or taken off per generation) and the rotor and stator (points that change, and stones that never move).
- **Guns:** the period, and the gliders fired per period.
- **Methuselahs:** run to the end in a Web Worker on a 1,024 × 1,024 field, with a sparkline of the population. Gliders are taken away as soon as nothing lies ahead of them, so the run finds the generation the rest settles. It measures the R-pentomino at 1,103 generations with 6 gliders, the acorn at 5,206 with 13 and the diehard dying at 130, matching the well-known values. Rabbits takes about half a minute, so results are kept in your browser after the first visit.

The tests check these numbers, so a change to the engine that broke one would fail CI.

### Lineage tree
Pick a seed (or draw one in the simulator and press *Grow a lineage tree*). The app evolves it, splits the live cells into objects every generation and records which object each one came from. The result is drawn as a family tree, either **growing upward**, as a **radial** burst or as a **timeline**, on linear, √ or log time:
- forks are **splits**, joins are **collisions**, branch ends are **deaths**;
- surviving leaves are labelled with the object they became (Block, Beehive, Blinker, Glider…);
- click a branch to highlight its full ancestry and descendants and scrub through the evolution with the rest of the board faded out;
- a summary and final census (the R-pentomino gives exactly the known 8 blocks, 6 gliders, 4 beehives, 4 blinkers, a boat, a loaf and a ship).

![Lineage tree growing upward](docs/screenshots/lineage-tree.png)

### 3D spacetime
Every live cell at every generation becomes a Go stone, with time running upward, so each generation is a layer of stones stacked on the one before. The stones are lit lens shapes with a highlight that follows the camera, drawn with WebGL2 instancing in one draw call. **Shape** switches to cubes, and very large sculptures (over 60,000 stones) are drawn as cubes automatically to stay smooth. Gliders become diagonal tubes, oscillators become braids and a methuselah like Acorn grows into a tree. Orbit, zoom, replay, colour by time or by object, and send any pattern from the simulator.

![A Gosper glider gun in 3D spacetime, built from Go stones and auto-rotating](docs/media/spacetime.gif)

### Deep time (Hashlife)
A from-scratch implementation of Gosper's **Hashlife** algorithm: a hash-consed quadtree with memoised futures. Jump a glider gun to generation 2³² (4,294,967,296) in milliseconds, double the generation with one click, watch population against generation on a log–log chart, and see the tree level, unique node count and cache hit rate live. It is tested cell for cell against the direct engine.

![A glider gun after 2^30 generations](docs/screenshots/deep-time.png)

### State-space trees
On a tiny torus (3×3 up to 3×6, up to 262,144 states) the app computes the successor of **every** configuration and draws the **basins of attraction**: each attractor cycle with the trees of states that flow into it (the "basin of attraction field" popularised by DDLab). Hover any state to see it and its trajectory; Garden of Eden states (no predecessor) are highlighted.

![Basins of attraction on a 4×4 torus](docs/screenshots/basins.png)

### Ancestors
Life run backwards. Draw a pattern and a backtracking search finds every **parent** in a box around it: every pattern that becomes exactly yours one generation later (a glider has 79 in a 5×5 box). Click a parent to search for its parents, and a family tree grows back in time; **Rewind** follows the smallest parent several generations at once. When nothing is found the page says so honestly: no parent of that size exists, which is not yet a proof of a Garden of Eden.

![Ancestors: rewinding a glider, one generation at a time](docs/media/ancestors.gif)

### Rule atlas
Conway's rule is one of 262,144 Life-like rules. The atlas runs 18 at a time from random soups and classifies each one live into **Wolfram's four classes** (dies out, settles, chaotic, complex) from its activity, density and whether the board repeats, alongside **Langton's λ**. Browse famous rules, random rules, or **Life and its 17 one-bit neighbours** to see how narrow Life's ridge between order and chaos is. Click any card to open that rule in the simulator.

![Rule atlas: 18 rules running and being classified live](docs/media/atlas.gif)

### Evolution
A genetic algorithm, running in a Web Worker, breeds one-dimensional radius-3 rules (128-bit tables) for the **density classification task**: a ring of 149 cells must reach all 1s if most cells started as 1, and all 0s otherwise, using only local rules. Watch the fitness climb through the epochs Mitchell, Crutchfield and Das described, compare the champion's space–time diagram with the hand-designed **GKL** rule, and follow the champion's **family tree**: a phylogeny in which every surviving rule is a life line and the champion's main line of descent is highlighted back to the founding generation.

![A genetic algorithm evolving a density classifier](docs/media/evolve.gif)

### Puzzles
Ten construction challenges, from "draw a still life" to "draw a period-3 oscillator" and "make a pattern that vanishes after at least 100 generations". Place stones on a small Go board, press **Check**, and the engine runs your pattern and decides. A wrong answer is told what its pattern actually does (for example "That pattern dies out after 4 generations"), and **Watch it run** plays it in place, with black and white stones taking turns as on the main board. Each puzzle remembers the fewest stones you've solved it with, so there's a reason to go back. You can play entirely from the keyboard (arrows, Space, Enter), and undo or redo any move. Progress, drafts and best scores are saved in the browser.

![Puzzles](docs/screenshots/puzzles.png)

### Duel
Life for two players, a variant called **Immigration** that Don Woods described in 1971. The rules are Conway's, but every stone belongs to a side. A surviving stone keeps its colour, and a new stone takes the colour of most of the three stones that made it. You play black against the computer's white on a 13-line board, or set **Opponent** to *A friend on this device* and pass it back and forth, black against white. Each round the two sides take turns placing three stones each, and then the board runs eight generations. After five rounds, whoever has more stones wins.

The computer tries each empty point near the stones, runs the board forward and keeps the move that leaves it furthest ahead. On **Easy** it picks loosely from the better half of those moves, on **Normal** it only looks at a sample of them, and on **Hard** it tries every one. The last stone before a run counts most, so the computer opens rounds 1, 3 and 5, which means you place the last stone of the game. With **Show where it ends up** on, pointing at a point shows faint stones where the board would finish after the run if you played there. Your record against the computer at each level is saved in the browser; games against a friend don't count towards it.

![Duel against the computer](docs/screenshots/duel.png)

### The math
A long-form page with KaTeX formulas and charts computed live from the same engine: the rule as a formula, convolution, counting rules and states, **mean-field theory** with a cobweb diagram checked against real soups, **block entropy**, **damage spreading**, the **speed of light**, growth rates of guns, **phase space and the Garden of Eden theorem**, a proof that the lineage tree is well defined, the **linear replicator rule over the two-element field 𝔽₂**, Turing universality, Hashlife, a live **census of random soups** with a Zipf rank–frequency fit and Shannon diversity, **self-organised criticality and the sandpile group** (the abelian property, the group order as a determinant and spanning-tree count, the group identity drawn live, and a measured avalanche exponent), **rule space and the edge of chaos** (Langton's λ against live-classified random rules, and a proof that the replicator rule erases every pattern on a 2^k torus), and **evolving computation** (why local majority fails, how GKL works, the GA's fitness function, and the Land–Belew impossibility result, with live accuracy curves), and **every pattern in a 4×4 box**: Burnside's lemma counts the 8548 patterns up to symmetry, and all of them are run to their fate in a background thread, with the share of each outcome, fate by starting size, the lifespan distribution and a gallery of the longest-lived methuselahs, and **running time backwards**: parents as a constraint-satisfaction problem, and all 2^25 5×5 patterns stepped once to show how unevenly the 512 possible 3×3 results are reached (entropy 7.40 of 9 bits). See [docs/MATH.md](docs/MATH.md).

### Applications
Eighteen live demos, each new one backed by a unit-tested model in `src/engine/models/`.

| Heart arrhythmia | Wind tunnel | Snowflake |
| --- | --- | --- |
| ![A broken wave curls into a re-entrant spiral](docs/media/heart.gif) | ![Lattice gas flowing past a cylinder](docs/media/wind.gif) | ![Reiter crystal growing a stellar dendrite](docs/media/snow.gif) |

| Lenia | Phantom traffic jams |
| --- | --- |
| ![Two Orbium creatures gliding](docs/media/lenia.gif) | ![Cars on a ring road with jams drifting backwards](docs/media/traffic.gif) |

New in v4:
- **Phantom traffic jams**: Nagel–Schreckenberg cars on a ring road (after Sugiyama's 2008 experiment) with a space–time diagram of jams travelling backwards.
- **Segregation**: Schelling's model, where mild individual preferences produce strongly segregated towns.
- **Chemical waves**: the hodgepodge machine, a model of the Belousov–Zhabotinsky reaction's spirals.
- **Lenia**: continuous Life, with the gliding creature Orbium (click to release more).

![v4 application demos](docs/screenshots/apps-v4.png)

New in v3:
- **Heart rhythm**: an excitable medium where a broken wave curls into a re-entrant spiral (arrhythmia) and a **Defibrillate** button stops it, with a crude ECG trace.
- **Wind tunnel**: an FHP **lattice gas** of about 100,000 particles flowing past a cylinder, plate or wing, shown as speed or vorticity with velocity arrows.
- **Avalanches**: the Abelian **sandpile** with a live power-law fit of avalanche sizes, or the fractal pile grown from one point.
- **Predators and prey**: **Wa-Tor** fish and sharks with population cycles and a Lotka–Volterra phase loop.
- **Snowflakes**: Reiter's hexagonal crystal-growth model with presets from dendrites to lacy plates.

![v3 application demos](docs/screenshots/apps-v3.png)

The original nine: procedural **cave generation**, **forest fires** and self-organised criticality, **epidemic waves** (SIRS), **traffic jams** (Rule 184 with the fundamental diagram), **random numbers** from Rule 30, **image denoising** with the Anneal rule, **morphogenesis** (Turing-style spots and stripes), **Wireworld circuits** (diodes and fan-out, verified by simulation) and **Langton's ant**, plus nine more fields from seismology to neural cellular automata. See [docs/APPLICATIONS.md](docs/APPLICATIONS.md).

## Gallery

| Home, Lamplight | Lineage tree | Math |
| --- | --- | --- |
| ![The home page in dark mode](docs/screenshots/home-dark.png) | ![Radial lineage tree of the R-pentomino](docs/screenshots/lineage-radial.png) | ![Mean-field chart](docs/screenshots/math.png) |

| Soup census | Sandpile identity | Heart arrhythmia |
| --- | --- | --- |
| ![Soup census](docs/screenshots/census.png) | ![Sandpile group identity](docs/screenshots/sandpile-identity.png) | ![Spiral wave in heart tissue](docs/screenshots/heart.png) |

| Snowflake | Every 4×4 pattern | On a phone |
| --- | --- | --- |
| ![Reiter snowflake](docs/screenshots/snowflake.png) | ![The fate of all 8548 patterns in a 4×4 box](docs/screenshots/box4.png) | ![The home page on a phone](docs/screenshots/phone.png) |

## Setup and usage

You need [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/Normansrule/game-of-life.git
cd game-of-life
npm install
npm run dev        # then open the http://localhost:5173 address it prints
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts a development server that reloads as you edit |
| `npm test` | Runs the Vitest suite: engine, patterns, RLE, lineage, basins, Hashlife, the soup census, the rule classifier, the genetic algorithm, the application models and the progress tracker |
| `npm run build` | Type-checks and builds the static site into `dist/` |
| `npm run preview` | Serves the production build locally (installable, works offline) |
| `npm run progress` | Redraws the progress tracker from the roadmap checklist |

The site opens on the home page, and the top bar lists all twelve views. Your choice of colour mode is saved in the browser. The installed app and the desktop app skip the home page and open straight on the board.

### Keyboard shortcuts (board)

| Key | Action |
| --- | --- |
| Space | Play / pause |
| N, . or → | Step one generation |
| B or ← | Step back one generation |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo an edit (Cmd on a Mac) |
| R | Reset to the last start (or rotate a pattern you're placing) |
| F | Flip the pattern you're placing |
| D / E / H | Draw / erase / pan tool |
| + / − / 0 | Zoom in / out / fit |
| C | Clear |
| Esc | Stop placing a pattern |
| L | Sound on / off |

Right- or middle-drag pans with any tool, and Shift-click places a pattern again and again.

On the home page's board, the arrow keys move a cursor, Space places or lifts a stone and P plays or pauses. The cursor position is read out in Go coordinates, like K10.

On a puzzle board, the arrow keys move a cursor, Space places or lifts a stone, Enter checks your answer, W watches it run and Ctrl+Z undoes.

## How it works

The engine is pure TypeScript with no DOM, so every view and every test runs the same code. Heavy searches run in Web Workers, with a main-thread fallback.

```mermaid
flowchart TB
  subgraph engine["src/engine (pure, unit tested)"]
    life["life.ts<br/>grid stepper"] --> objects["objects.ts<br/>find and name objects"]
    objects --> lineage["lineage.ts<br/>family tree"]
    life --> hashlife["hashlife.ts<br/>quadtree + memo"]
    life --> basins["basins.ts<br/>every state of a torus"]
    life --> preds["predecessors.ts<br/>backtracking parents"]
    life --> exhaustive["exhaustive.ts<br/>Burnside + fates"]
    rules["rules.ts<br/>B/S rules"] --> life
    evolve["evolve.ts<br/>genetic algorithm"]
    models["models/<br/>heart · gas · Lenia · traffic…"]
  end
  subgraph render["src/render"]
    gl["WebGL2 grid shader<br/>(Canvas 2D fallback)"]
    cubes["instanced 3D cubes"]
  end
  subgraph ui["src/ui: twelve views"]
    sim["Simulator"]; tree["Lineage tree"]; space["3D spacetime"]; deep["Deep time"]
    basinv["State space"]; anc["Ancestors"]; atlas["Rule atlas"]; evo["Evolution"]
    puz["Puzzles"]; math["Math"]; apps["Applications"]
  end
  life --> sim --> gl
  lineage --> tree
  life --> space --> cubes
  hashlife --> deep
  basins --> basinv
  preds --> anc
  rules --> atlas
  evolve -->|Web Worker| evo
  exhaustive -->|Web Worker| math
  models --> apps
```

How the lineage tree is built, one generation at a time:

```mermaid
sequenceDiagram
  participant G as Grid
  participant O as Object finder
  participant T as Lineage tree
  loop every generation
    G->>G: step the rule
    G->>O: live cells
    O->>O: group cells within distance 2 into objects
    O->>T: each new cell's 3×3 neighbourhood names its parent object
    alt one parent, one child
      T->>T: extend the branch
    else one parent, several children
      T->>T: fork (a split)
    else several parents, one child
      T->>T: join (a collision)
    else no child
      T->>T: end the branch (a death)
    end
  end
  T->>T: label surviving leaves (Block, Glider…)
```

## Project structure

```
src/
  main.ts          routes between the views, colour-mode button, error fallback for a view that fails
  style.css        every design token (colour, type, spacing, motion) and all component styles
  engine/          pure TypeScript, no DOM, fully unit tested
    life.ts        grid engine (wrapped or bounded), ages and trails, sparse evolver
    rules.ts       B/S rule parsing and presets
    rle.ts         RLE + plaintext pattern formats
    share.ts       board links: a pattern and its rule packed into the URL
    patterns.ts    pattern library and the 8 symmetries of the square
    objects.ts     object detection, canonical forms, period / speed detection
    lineage.ts     lineage tree builder
    basins.ts      exhaustive state-space analysis and radial basin layout
    hashlife.ts    Hashlife: hash-consed quadtree with memoised successors
    census.ts      seeded random soups and object census
    classify.ts    Wolfram-class rule classifier and Langton's λ
    evolve.ts      1D rules, GKL, and a genetic algorithm for density classification
    exhaustive.ts  Burnside counts, D4 orbit representatives and a fate runner that removes departing gliders
    guide.ts       the field guide's measured facts: cycles, guns, growth and methuselah runs
    puzzles.ts     puzzle definitions and their automatic checkers
    immigration.ts two-colour Life for Duel, and the computer player
    predecessors.ts  backtracking parent search and the 3×3 preimage census
    models/        sandpile, FHP gas, Wa-Tor, excitable medium, snowflakes, Lenia, Schelling, hodgepodge, traffic
  render/
    renderer.ts    the Go board shader (WebGL2) and its Canvas 2D fallback
    palettes.ts    stone colourings: turns, age, slate
    spacetime.ts   instanced 3D spacetime renderer, in stones or cubes
    board3d.ts     the 3D Go board and lens-shaped stones for the home page story
  ui/
    homeView.ts    the home page and its live 19-line board
    homeStory.ts   the scroll story at the top of the home page
    homeSections.ts  the rule toy, the numbers and the view cards
    duelView.ts    Duel against the computer or a friend
    theme.ts       colour modes, and design tokens for canvas code
    icons.ts       the icon set (inline SVG on a 24-unit grid)
    sound.ts       listening to the board with the Web Audio API
    sfx.ts         synthesised stone, chime and thud sound effects
    guideView.ts   the field guide: animated cards and their facts
    ...            the other ten views, charts, demos and small DOM helpers
                   (the GA runs in evolveWorker.ts, the 4×4 census in boxWorker.ts,
                   the field guide's long runs in guideWorker.ts)
tests/             Vitest specs
scripts/           the progress tracker generator
docs/              math, applications, the lineage-tree method, screenshots and the README GIFs (docs/media)
public/            web app manifest and icons
desktop/           Electron shell and installer config for the desktop app
```

## Design

The design is called **Common Room**, after the Cambridge maths common room where Life was first played on a Go board. The whole interface is that board, which gives the project a look that comes from its own history rather than from a template.

**Colour.** The page is planed kaya, the pale yellow wood Go boards are made from, and every board in the app is a deeper kaya (`#D9A957`). Slate (`#1E1D1C`) and clamshell (`#F6F2E7`) stones carry all the contrast. There's no accent colour at all, because the things you press are stones: a primary button is a slate pill, a switch is a stone sliding in a groove, and the active tab is marked by a star point. Charts and categories use a small set of earthy data colours (pine, vermilion, indigo, ochre, plum) that stay separate from the stones. In **Lamplight** (dark mode) the page turns to walnut and the board looks lamp-lit, so the stones still read the same.

**Type.** Headings are set in [Bricolage Grotesque](https://github.com/ateliertriay/bricolage), narrow and heavy, and the same family runs the controls. Reading text, from the math to the application write-ups, is [Literata](https://github.com/googlefonts/literata), a book face drawn for long reading on screens. Monospace is kept for code: rule strings, RLE and error text. Live numbers use the interface face with figures that line up. Both fonts are bundled with the app, so the offline and desktop versions look the same as the website.

**Layout.** One board line (24 px) is the unit, and spacing goes in quarter, half, one, two and four lines. Sections start on a star point, the dot you'll see before panel and section headings. Panels are separated by thin rules rather than boxed in cards, and long reading text is capped at about 66 characters a line.

**The home page.** The website opens with a scroll story, the way a product page does. A 3D board stays pinned while four chapters pass: the title, five stones dropping onto the board, the rule running, and every generation stacked into a tower. Your scroll position drives it all, so it goes backwards when you scroll up, and nothing plays on its own except a slow drift of the camera. With a mouse, a warm light follows the pointer across the wood and lifts the stones under it. Below the story are a board you can play on, a toy that shows the whole rule on nine points, four numbers that count up once, and a card for every view whose small board plays while you point at it. Without WebGL2 the story becomes ordinary paragraphs.

**Motion.** Things that land use a spring. Moving between views cross-fades the page and lifts the new one a few pixels, where the browser supports view transitions. Placed stones, the star point under the tabs, the switches and the toasts all settle with a small overshoot, like a stone clicking onto the board. State changes use one strong ease-out and stay under 300 ms. Presses scale to 97%. Hover effects only apply to a mouse or trackpad. With reduced motion turned on, overshoot, movement and loops are switched off and fades remain: the home page camera holds one still view per chapter and stones appear without falling.

**Sound.** Every sound is made in the browser with the Web Audio API, so there are no audio files to download or license. A stone landing is a very short filtered-noise click on top of a ringing knock (two quickly fading tones, the wood) and a soft low thump (the board's body), and each one varies a little in pitch and weight, as real stones do. Taking a stone off is a softer, higher tick, the computer's stones in Duel land a little more lightly than yours, and a dragged line of stones clicks no faster than a hand could place them. Sound effects are off until you turn them on, and the setting is remembered.

**Surface.** A faint paper grain sits behind every page, dark grain in Daylight and pale in Lamplight, so large plain areas read as a surface rather than a flat fill. It sits underneath the content, so boards, charts and text stay crisp.

**States.** A cleared board says what to do next and offers a random soup or a glider. A view that fails to start shows what happened and a reload button, and the rest of the app keeps working. Searches and long runs show three stones being placed in turn while they work.

**Accessibility.** Text contrast is at least 4.5:1 in both modes. There's a skip link and a visible focus ring, every icon button has a label, and the toggles report whether they're on. The home board can be played entirely from the keyboard.

| Home, Daylight | Home, Lamplight |
| --- | --- |
| ![Home page in light mode](docs/screenshots/home-light.png) | ![Home page in dark mode](docs/screenshots/home-dark.png) |

The other directions considered for this redesign were a microscope-slide look (stained cells) and a 1970s green-bar printout look. Common Room won because it's the most specific to Life's history and stays calm in a dense tool.

## Web app and desktop app

**Web app.** `.github/workflows/pages.yml` builds the site on every push to `main` and publishes it to GitHub Pages. Pages has to be switched to GitHub Actions once, which you can do from a terminal with `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow` (or in **Settings → Pages → Source**). The build also writes a service worker (`sw.js`) that precaches every file, and `public/manifest.webmanifest` makes the site installable. `npm run build && npm run preview` shows the installable build locally.

**Desktop app.** `desktop/` wraps the same build in [Electron](https://www.electronjs.org/). It serves the files from a private `app://` scheme, so Web Workers and module scripts behave exactly as on the web.

```bash
npm install && npm run build      # build the site into dist/
cd desktop
npm install
npm start                         # run the desktop app
npm run dist                      # make installers for this OS in desktop/release/
```

**Releases.** `.github/workflows/release.yml` builds the Windows, macOS and Linux installers on all three operating systems. Pushing a tag such as `v7.1.0` publishes them as a GitHub release. The workflow also runs, without publishing, on pull requests that touch `desktop/`.

`.github/workflows/ci.yml` runs the tests and the build on every push and pull request.

## Credits

The Game of Life was devised by John Horton Conway in 1970 and popularised by Martin Gardner in *Scientific American*. Pattern data follows the conventions of [LifeWiki](https://conwaylife.com/wiki/). Formulas are rendered with [KaTeX](https://katex.org/). Fonts: Bricolage Grotesque by Mathieu Triay and Literata by TypeTogether, both under the SIL Open Font License, bundled through [Fontsource](https://fontsource.org/).

## License

MIT, see [LICENSE](LICENSE).
