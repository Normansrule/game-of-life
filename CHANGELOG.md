# Changelog

## 7.0.0

- New **Ancestors** tab: draw a pattern and a backtracking search lists its parents (patterns that become it in one step) in a box around it, smallest first. Click a parent to search further back; the result is a family tree that grows back in time, with curves from each pattern to its parents. **Rewind** follows the smallest parent five generations at once. Honest reporting when the search finds none, stops at 400, or gives up.
- Math page: section 19, **running time backwards**: parents as constraint satisfaction, and a live census of all 2^25 5×5 patterns showing how many pasts each 3×3 present has (entropy, most and fewest, no 3×3 orphans).
- New engine module `src/engine/predecessors.ts` with tests: parent counts match brute force over every pattern in the box, every parent found evolves into the target, and the 3×3 census sums to 2^25 and is mirror symmetric. 66 tests in total.

## 6.0.0

- New **Puzzles** tab: ten construction challenges (still life, period-2 and period-3 oscillators, a 7-cell still life, four cells that grow into a beehive, spaceships, a pattern that vanishes in exactly 5 generations, a 5-cell methuselah, a die-hard). Each answer is checked by running the engine; wrong answers are told what their pattern does. In-place playback, hints, and progress saved in the browser.
- Math page: section 18, **every pattern in a 4×4 box**: Burnside's lemma with a table of counts up to 8×8, then all 8548 patterns run to their fate in a Web Worker (main-thread fallback; results cached). Outcome shares, fate by starting size, the lifespan distribution and a gallery of the 12 longest-lived histories, each openable in the simulator.
- New engine modules `src/engine/exhaustive.ts` (D4 symmetries, Burnside counts, orbit representatives, a fate runner that removes escaping gliders) and `src/engine/puzzles.ts`, with tests: Burnside against brute force, classic fates (R-pentomino 1103, glider, block, blinker), symmetric patterns get identical fates, and a known solution plus wrong answers for every puzzle. 63 tests in total.

## 5.0.0

- New **Evolution** tab: a genetic algorithm (in a Web Worker) evolves radius-3 one-dimensional rules for the density classification task. Live fitness curves (training and unbiased benchmark), the champion's space–time diagram next to the hand-designed GKL rule with a right/wrong verdict, the champion's rule table, and a **phylogeny** of every rule that survived selection with the champion's main line of descent highlighted.
- Math page: section 17, **evolving computation**: a proof that the local-majority rule freezes, how GKL works, the GA fitness function, the Land–Belew impossibility result, and a live chart of accuracy against initial density.
- New engine module `src/engine/evolve.ts` with tests: the ring stepper against a direct implementation, GKL's ~82% accuracy and its 0/1 mirror symmetry, local majority's frozen islands, and a GA run that improves and records parents. 58 tests in total.

## 4.0.0

- New **Rule atlas** tab: 18 Life-like rules run side by side and are classified live into Wolfram's classes I–IV, with Langton's λ, activity, density and a population sparkline. Sets: famous rules, random rules, and Life with its 17 one-bit neighbours. Click a card to open the rule in the simulator.
- Math page: section 16, **rule space and the edge of chaos**: a live scatter of λ against activity for hundreds of random rules, the share of each class per λ band, and a proof that the replicator rule erases every pattern on a 2^k × 2^k torus.
- Applications: four new live demos, each with a tested model:
  - **Phantom traffic jams** (Nagel–Schreckenberg on a ring road, with a space–time diagram).
  - **Segregation** (Schelling).
  - **Chemical waves** (hodgepodge machine / Belousov–Zhabotinsky).
  - **Lenia** with the Orbium creature.
- Tests: classifier tests and four new model tests (Orbium keeps its mass and glides; Schelling conserves agents and segregates; traffic conserves cars, never overtakes, and its flow peaks at low density). 53 tests in total.

## 3.0.0

- Applications: five new live demos, each with a tested model in `src/engine/models/`:
  - **Heart rhythm** (Greenberg–Hastings excitable medium): pacemaker, a triggered re-entrant spiral, defibrillation, crude ECG.
  - **Wind tunnel** (FHP lattice gas): cylinder, flat plate or wing; speed or vorticity colouring with velocity arrows.
  - **Avalanches** (Abelian sandpile): live power-law fit of avalanche sizes, or a fractal pile grown from the centre.
  - **Predators and prey** (Wa-Tor): population chart and fish–shark phase loop.
  - **Snowflakes** (Reiter's hexagonal model): five presets plus β and γ sliders.
- Math page: new section 15, **criticality and the sandpile group** (abelian property, group order = det Δ = spanning trees with exact BigInt values, the group identity drawn live, measured avalanche exponent).
- Simulator: **Record video** button saves the running grid as WebM.
- Tests: 13 new model tests (44 in total), including brute-force verification that recurrent sandpiles are counted by det Δ.

## 2.0.0

- **3D spacetime** tab: instanced WebGL2 cubes, time runs upward, orbit/zoom, colour by time or object.
- **Deep time** tab with a new **Hashlife** engine (`src/engine/hashlife.ts`): jump to 2^n generations, log–log population chart, live quadtree stats.
- Simulator can send the current pattern to the 3D view or to Hashlife.
- Math page: Hashlife explained, and a live **census of random soups** with a Zipf fit and Shannon diversity.
- Applications: **Wireworld** circuits (diode, reversed diode, fan-out, verified by simulation) and **Langton's ant**.
- Tests: Hashlife checked cell for cell against the direct engine, a 2^30-generation glider-gun jump, and a seeded soup census (31 tests).

## 1.0.0

- Simulator with WebGL2 rendering, pattern library, rules, RLE import/export.
- Lineage tree, state-space (basin) trees, math page, seven application demos.
