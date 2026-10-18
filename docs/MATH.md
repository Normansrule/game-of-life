# The mathematics of the Game of Life

This is a text version of the app's **Math** tab. In the app every chart is computed live.

## 1. The rule

Cells live on $\mathbb{Z}^2$ with states $s_t(x) \in \{0,1\}$. With $N(x)$ the 8 Moore neighbours,

$$n_t(x) = \sum_{y \in N(x)} s_t(y), \qquad s_{t+1}(x) = [n_t(x) = 3] + s_t(x)\,[n_t(x) = 2].$$

A general outer-totalistic rule with birth set $B$ and survival set $S$ (written `B…/S…`) is

$$s_{t+1}(x) = (1 - s_t(x))\,[n_t(x) \in B] + s_t(x)\,[n_t(x) \in S].$$

By the Curtis–Hedlund–Lyndon theorem, the global maps of cellular automata are exactly the continuous, shift-commuting maps on $\{0,1\}^{\mathbb{Z}^2}$.

## 2. Convolution

$n_t = K * s_t$ with $K = \begin{pmatrix}1&1&1\\1&0&1\\1&1&1\end{pmatrix}$. One step is a convolution followed by a pointwise non-linearity, the same shape as a CNN layer. Smooth kernels and growth functions give continuous automata such as Lenia.

## 3. Counting

- $2^{18} = 262{,}144$ outer-totalistic rules (one bit per birth count and per survival count).
- $2^{512}$ arbitrary two-state rules on the $3\times3$ neighbourhood.
- $2^{wh}$ configurations on a $w \times h$ torus; every orbit is eventually periodic (pigeonhole).

## 4. Mean-field theory

If cells are independent with density $p$ then $n \sim \mathrm{Bin}(8,p)$ and

$$f(p) = \sum_{n=0}^{8}\binom{8}{n}p^n(1-p)^{8-n}\big(p\,[n\in S] + (1-p)\,[n\in B]\big).$$

For Life $f(p) = \binom83 p^3q^5 + \binom82 p^3 q^6$ ($q = 1-p$), with fixed points near $0.192$ (unstable) and $0.370$ (stable). The map is exact for a single step from a random soup, but real soups decay to ash of density about $3\%$ because Life creates correlations the mean-field model ignores. The app plots the cobweb and measured densities side by side.

## 5. Entropy

The $2\times2$ block entropy $H = -\sum_{i=1}^{16}\pi_i\log_2\pi_i \le 4$ bits per block starts near its maximum in a random soup and falls as structure forms. Life is irreversible, so information is destroyed.

## 6. Damage spreading

Two runs differing in one cell; the Hamming distance $d_t$ grows then saturates. $\lambda \approx \frac1t\log d_t$ in the growth phase plays the role of a Lyapunov exponent. Life is Wolfram Class IV (complex).

## 7. Speed of light

Information travels at most $c = 1$ cell per generation. Glider: $c/4$ diagonal. LWSS/MWSS/HWSS: $c/2$ orthogonal. Copperhead: $c/10$. No spaceship moving into empty space can exceed $c/2$ orthogonally or $c/4$ diagonally.

## 8. Growth

Gosper's gun adds a 5-cell glider every 30 generations: $P(t) \approx P_0 + t/6$. Breeders grow as $\Theta(t^2)$, the maximum possible since the bounding box grows at most at speed $c$.

## 9. Phase space and Gardens of Eden

On a finite torus the transition graph is a functional graph: each component (basin) has exactly one cycle (attractor) with in-trees of transients. A **Garden of Eden** has no predecessor. The Moore–Myhill theorem: a CA on $\mathbb{Z}^d$ is surjective iff it is injective on finite configurations. Life is not (many patterns die), so Gardens of Eden exist; Roger Banks found the first in 1971.

Results computed by the app (Life, B3/S23):

| Torus | States | Attractors | Gardens of Eden | Longest transient | Cycle lengths |
| --- | ---: | ---: | ---: | ---: | --- |
| 3×3 | 512 | 127 | 384 (75.0%) | 2 | 1 |
| 3×4 | 4,096 | 41 | 3,756 (91.7%) | 4 | 1, 2 |
| 4×4 | 65,536 | 345 | 47,657 (72.7%) | 9 | 1, 2, 4, 8 |
| 3×5 | 32,768 | 121 | 31,146 (95.1%) | 7 | 1 |
| 3×6 | 262,144 | 2,595 | 254,136 (96.9%) | 9 | 1 |

## 10. The lineage tree

See [LINEAGE_TREE.md](LINEAGE_TREE.md).

## 11. The replicator, a linear rule

`B1357/S1357` gives $s_{t+1}(x) = \sum_{y\in N(x)} s_t(y) \bmod 2$. As polynomials over $\mathbb{F}_2$ a step multiplies by $K(u,v) = (1+u+u^{-1})(1+v+v^{-1}) - 1$, and Frobenius gives $K^{2^k}(u,v) = K(u^{2^k}, v^{2^k})$: at $t=2^k$ any pattern appears as 8 copies at distance $2^k$.

## 12. Universality

Gliders as bits, collisions as gates, eaters and reflectors for routing, block-pushing for memory: Life is Turing complete (Berlekamp, Conway & Guy, 1982; Rendell's Turing machine, 2000; the OTCA metapixel runs Life in Life). Consequently "does this pattern eventually die?" is undecidable.

## 13. Algorithms

Direct loops ($O(wh)$), sparse lists ($O(P)$), bit-parallel adders, GPU shaders, and **Hashlife** (Gosper, 1984), which memoises quadtree nodes and can jump $2^k$ generations at once.

### Hashlife in this project (`src/engine/hashlife.ts`)

- A node of level $k$ is a $2^k \times 2^k$ square with four level-$(k-1)$ children. Nodes are **hash-consed**: `join(nw, ne, sw, se)` returns the existing node if those four children were seen before, so identical squares anywhere share one object.
- `successor(n, j)` returns the central $2^{k-1}$ square of `n` advanced $2^j$ generations ($j \le k-2$). It builds nine overlapping level-$(k-1)$ squares, advances each recursively, recombines them into four, and (for the full $2^{k-2}$ step) advances those again. Results are cached on the node.
- `advance(t)` writes $t$ in binary and applies one `successor` per set bit, padding the root with empty space first so nothing escapes (information moves at most one cell per generation).
- Because the cost depends on the number of distinct space-time squares, a glider gun reaches generation $2^{32}$ in a few milliseconds with only about 8,000 unique nodes; its population follows $P(t) \approx t/6$, a slope-1 line on the log–log chart.
- Bounding boxes are memoised per node as well, so they also cost $O(\text{unique nodes})$.

## 14. A census of random soups

`src/engine/census.ts` fills a $16\times16$ square at density $\tfrac12$ with a seeded PRNG (mulberry32), runs it with the lineage tracker until it stabilises, and identifies every remaining object, counting spaceships that fly away. The page shows:

- the most common objects (blocks, beehives, blinkers, gliders and loaves dominate, as in the public census Catagolue);
- a **rank–frequency** plot in log–log space with a least-squares fit. Zipf's law $f(r) \propto r^{-s}$ appears as a straight line of slope $-s$;
- the **Shannon diversity** $H = -\sum p_i\log_2 p_i$ and the effective number of species $2^H$;
- a histogram of how long soups take to settle, which has a long right tail.

## 15. Criticality and the sandpile group

The Abelian sandpile on an $m\times n$ grid topples any site with $c_v\ge 4$: $c \mapsto c - \Delta e_v$ with the reduced Laplacian $\Delta = 4I - A$ (grains leaving the grid are lost).

- **Abelian property** (Dhar 1990): toppling order does not change the final stable state or the number of topplings at each site.
- **Sandpile group**: recurrent stable configurations under $a\oplus b = \mathrm{stab}(a+b)$ form a group isomorphic to $\mathbb{Z}^{mn}/\Delta\mathbb{Z}^{mn}$, of order $\det\Delta$, which by the matrix-tree theorem counts spanning trees of the grid with a wired boundary. Exact values computed by the app: $1\times1$: 4, $2\times2$: 192, $3\times3$: 100,352, $4\times4$: 557,568,000.
- **Identity**: $e = \mathrm{stab}(6 - \mathrm{stab}(6))$, drawn live on the math page.
- **Self-organised criticality**: under random drops, avalanche sizes follow $P(s)\sim s^{-\tau}$ up to a finite-size cut-off. The app measures $\tau$ by a least-squares fit to log-binned densities; small piles give values around 1.0 to 1.3.

Code: `src/engine/models/sandpile.ts`.

## 16. Rule space and the edge of chaos

Life-like rules form a space of $2^{18} = 262{,}144$ rules. The app classifies a rule from a seeded soup on a small torus: class I if it dies, class II if the board repeats with period at most 30 or nearly stops changing, class III if more than 6% of cells change per step, otherwise class IV. This is a heuristic (`src/engine/classify.ts`), tuned so that Life is class IV, Seeds and `B34/S34` are class III and Life without Death is class II.

Langton's parameter for a Moore outer-totalistic rule is
$$\lambda = \frac{1}{512}\sum_{n=0}^{8}\binom{8}{n}\bigl([n\in B]+[n\in S]\bigr),\qquad \lambda_{\text{Life}} = \tfrac{140}{512}\approx 0.273.$$
Chaos becomes more common as $\lambda$ rises, but $\lambda$ alone does not determine the class (Mitchell, Hraber & Crutchfield 1993).

**The replicator on a $2^k$ torus.** `B1357/S1357` is linear over $\mathbb{F}_2$: $x_{t+1} = Tx_t$ with $T = (1+\sigma_x+\sigma_x^{-1})(1+\sigma_y+\sigma_y^{-1}) - 1$. In characteristic 2, $(a+b)^2 = a^2+b^2$ for commuting $a, b$, so $T^{2^k} = (1+\sigma_x^{2^k}+\sigma_x^{-2^k})(1+\sigma_y^{2^k}+\sigma_y^{-2^k}) - 1$. On a $2^k\times2^k$ torus $\sigma^{2^k}=1$, giving $T^{2^k} = 1 - 1 = 0$: every pattern dies within $2^k$ steps. The test suite checks this on a $32\times32$ torus.

## 17. Evolving computation: density classification

A radius-3 binary rule on a ring of $N=149$ cells should reach all 1s when $\rho(x) > \tfrac12$ and all 0s otherwise.

- **Local majority fails**: any run of four equal cells is stable (each of its cells sees at least four equal values in its 7-cell window), so rings containing a 4-run of each colour never reach consensus. Tested in `tests/evolve.test.ts`.
- **GKL** (Gács, Kurdyumov & Levin 1978): $\phi(x)_i = \mathrm{maj}(x_{i-3}, x_{i-1}, x_i)$ if $x_i=0$, $\mathrm{maj}(x_i, x_{i+1}, x_{i+3})$ if $x_i = 1$. About 82% correct on unbiased rings (reproduced by the tests); it is invariant under swapping 0↔1 together with mirroring the ring.
- **GA** (Mitchell, Crutchfield & Das): population of 60 rule tables, initial tables with density uniform in $[0,1]$, fitness = fraction of 60 fresh training rings (density uniform in $[0,1]$) classified within 160 steps, top 20% kept, the rest single-point crossover of two elites plus 2 bit flips.
- **Impossibility**: Land & Belew (1995) showed no two-state rule solves the task perfectly.

Code: `src/engine/evolve.ts`, UI: `src/ui/evolveView.ts`, worker: `src/ui/evolveWorker.ts`.

## 18. Every pattern in a 4×4 box

- **Burnside's lemma**: the number of orbits is $\frac{1}{|G|}\sum_{g}|\mathrm{Fix}(g)|$ with $|\mathrm{Fix}(g)| = 2^{c(g)}$, $c(g)$ the number of cycles of $g$ on the cells. For the $4\times4$ box under $D_4$: $(2^{16} + 2\cdot2^4 + 2^8 + 2\cdot2^8 + 2\cdot2^{10})/8 = 8548$. For $5\times5$: 4,211,744. Checked against brute force in `tests/exhaustive.test.ts`.
- **Orbit representatives**: keep each 16-bit mask that is the smallest of its 8 images.
- **Fate runner**: a $192\times192$ bounded field, stepping only the bounding box. Anything that reaches the 5-cell edge zone is removed together with every cell linked to it within distance 2 (a departing spaceship), and the pattern is flagged as having fired gliders. The run stops when a state repeats exactly (hash of all live cells), giving the lifespan (first generation of the final cycle), the period and the final population. Approximation: escaping debris is removed instead of being followed forever.
- **Check**: the R-pentomino settles at generation 1103 into 116 cells, 30 of them in six gliders (86 remain on the field).
- **Results** (all 8548, up to 6000 generations): 2756 vanish, 128 fly away entirely, 3153 settle to still lifes, 1712 to oscillators and 799 settle while firing gliders; none is left unsettled. The longest-lived history lasts 4079 generations from 10 cells.

Code: `src/engine/exhaustive.ts`, UI: `src/ui/boxFigure.ts`, worker: `src/ui/boxWorker.ts`.

## 19. Running time backwards

- A **parent** of $T$ is any $P$ with $F(P)=T$. Each cell gives one constraint on its 3×3 neighbourhood, so finding parents is constraint satisfaction.
- **Search** (`findPredecessors`): fill a box around $T$ (bounding box plus a margin) one cell at a time in row-major order. After each choice, every affected constraint is checked with a lookup table: given its centre (dead, alive or unknown), the number of neighbours known alive and the number still unknown, can it still give the required next state? Verified against brute force over every pattern in the box (`tests/predecessors.test.ts`).
- "No parent in the box" rules out parents of that size only; a true Garden of Eden needs a proof over all surroundings.
- **3×3 census**: all $2^{25}$ 5×5 patterns stepped once, middle 3×3 tallied. Every 3×3 pattern has a past (no orphans this small). The empty 3×3 has 5,110,252 pasts (15.2%); the rarest, a ring of 8 around a dead centre, has 5,728. Entropy of the present: 7.40 bits of 9.

Code: `src/engine/predecessors.ts`, UI: `src/ui/ancestorsView.ts`, `src/ui/pastFigure.ts`.
