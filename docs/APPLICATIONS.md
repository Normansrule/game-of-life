# Applications of cellular automata

The app's **Applications** tab runs eighteen of these live (code in `src/ui/demos.ts`, `src/ui/physicsDemos.ts`, `src/ui/moreDemos.ts` and `src/engine/models/`).

## Live demos

| Demo | Field | Rule / model | What to look for |
| --- | --- | --- | --- |
| Cave generation | Games, procedural content | Random fill, then `B5678/S45678` smoothing | Noise becomes organic caverns in 4–5 passes |
| Forest fire | Ecology, statistical physics | Drossel–Schwabl: growth $p$, lightning $f$ | Self-organised criticality, power-law fire sizes |
| Epidemic (SIRS) | Epidemiology | Infection prob. $1-(1-\beta)^k$ from $k$ infected neighbours, recovery, waning immunity | Travelling waves and spirals |
| Traffic | Transport | Elementary rule 184 | Jams move backwards; flow $= \min(\rho, 1-\rho)$ |
| Random numbers | Cryptography | Elementary rule 30, centre column | ~50% ones, no visible pattern |
| Denoising | Image processing | Anneal `B4678/S35678` (majority vote) | Speckle noise removed, letters kept |
| Morphogenesis | Developmental biology | Young (1984) activator–inhibitor CA | Spots vs. stripes as inhibition changes |
| Wireworld | Digital electronics | 4 states: empty, wire, electron head, tail | A diode passes electrons one way; a fan-out splits them |
| Langton's ant | Complex systems | Turn right on white, left on black, flip, move | ~10,000 chaotic steps, then a period-104 highway |
| Sandpile | Geophysics, neuroscience | Bak–Tang–Wiesenfeld: a site with 4 grains topples one to each neighbour | Power-law avalanches $P(s)\sim s^{-\tau}$ (measured $\tau\approx1.1$–$1.3$); a fractal pile when dropped at the centre |
| Wind tunnel | Aerodynamics | FHP lattice gas: 6 velocity bits per hex cell, mass- and momentum-conserving collisions, bounce-back walls | Flow speeds up around a cylinder, plate or wing and leaves a wake (arrows are block averages) |
| Predators and prey | Ecology | Wa-Tor (Dewdney 1984): fish breed, sharks eat, breed and starve | Lotka–Volterra-like cycles and a loop in the fish–shark phase plane |
| Heart rhythm | Cardiology | Greenberg–Hastings excitable medium (rest, fire, refractory) with a pacemaker | Plane-wave beats; a broken wave becomes a re-entrant spiral; a shock (defibrillation) stops it |
| Snowflakes | Materials science, meteorology | Reiter (2005) hexagonal model with vapour $\beta$ and addition $\gamma$ | Dendrites, ferns and plates with exact six-fold symmetry |
| Ring-road traffic | Transport | Nagel–Schreckenberg: accelerate, keep distance, brake at random with prob. $p$, move | Phantom jams that travel backwards (Sugiyama et al. 2008); flow peaks at low density |
| Segregation | Sociology, economics | Schelling (1971): unhappy agents (too few similar neighbours) move to random empty cells | A 34% preference gives a town where most neighbours are similar |
| Chemical waves | Chemistry | Hodgepodge machine (Gerhardt & Schuster 1989) | Belousov–Zhabotinsky-style spirals |
| Lenia | Artificial life | Continuous Life: ring kernel $R=13$, Gaussian growth $\mu=0.15$, $\sigma=0.015$ | The Orbium creature glides with constant mass |

## Further applications

- **Theory of computation**: universality, undecidability, models of distributed computing.
- **Hardware**: GPUs, FPGAs, systolic arrays, quantum-dot cellular automata.
- **Fluid dynamics**: the lattice Boltzmann method, the industrial descendant of the FHP gas demo.
- **Seismology**: the Olami–Feder–Christensen earthquake model.
- **Chemistry**: Belousov–Zhabotinsky waves, modelled by excitable media.
- **Medicine**: hybrid CA models of tumour growth and treatment.
- **Urban planning**: SLEUTH and related land-use models.
- **Materials science**: grain growth, recrystallisation and solidification.
- **Machine learning**: neural cellular automata that grow and regenerate images.
- **Artificial life**: self-replicators, Lenia, open-ended evolution.
- **Art and music**: generative textures, rhythms and architecture.

## How the new models are checked

The models behind the v3 demos live in `src/engine/models/` and have their own tests (`tests/models.test.ts`):

- **Sandpile**: grains are conserved (added = on the grid + lost), the final pile and the total number of topplings do not depend on the order of drops, the computed group identity satisfies $e \oplus e = e$, and the number of recurrent configurations of small grids (found by brute force with Dhar's burning test) equals $\det\Delta$.
- **FHP gas**: every entry of both collision tables conserves particle number and momentum; total mass is constant over 100 steps with obstacles and forcing; the body force produces a net eastward flow.
- **Wa-Tor**: fish alone fill the ocean, sharks alone starve, and the population counters always match the grid.
- **Heart tissue**: a single stimulus spreads and dies out; a broken wave forms a spiral that is still firing 600 steps later; a shock stops it.
- **Snowflakes**: the crystal is six-fold symmetric to within $10^{-9}$.
- **Lenia**: Orbium keeps its mass within 3% over 150 steps and moves; rotated a quarter turn it still lives.
- **Schelling**: agents of each group are conserved; at a 34% threshold the segregation index rises from about 0.5 to above 0.7; at 0% nobody moves.
- **Hodgepodge**: levels stay within 0..n and the dish stays active.
- **Traffic**: cars are conserved, never overtake and never exceed $v_{max}$; flow at density 0.12 beats both 0.03 and 0.6.
