# How the lineage tree is built

The **Lineage tree** tab draws the genealogy of a Life pattern: which object came from which, when objects split apart, when they collide, and what they finally become.

## Objects

Every generation the live cells are grouped into **objects**: two live cells are in the same object if they are linked by a chain of live cells, each within Chebyshev distance 2 ($\max(|dx|,|dy|) \le 2$) of the next.

## The locality lemma

> Every live cell at time $t+1$ descends from exactly one object at time $t$.

A live cell $c$ at $t+1$ either survived or was born, so its closed $3\times3$ neighbourhood contained at least one live cell at $t$. Any two cells in a $3\times3$ block are within distance 2 of each other, so all of them are in the same object. Therefore the map "cell at $t+1$ to object at $t$" is well defined, and so is the set of **parent objects** of each object at $t+1$.

## From objects to a tree

Write $P(O)$ for the parents of an object $O$ and $C(O)$ for its children.

| Situation | Meaning | Drawn as |
| --- | --- | --- |
| $|P(O)| = 1$ and that parent has one child | the same object continues | the branch extends |
| one parent, many children | **split** | a fork |
| many parents | **merge** (collision) | a join, dashed for secondary parents |
| no children | **death** | a pink branch ending |

Runs of one-to-one steps are compressed into **segments**. The segments and parent links form a directed acyclic graph; it is a true tree when nothing collides. For layout each segment is placed under its first parent, leaves get evenly spaced positions (short-lived dead ends get less room) and internal segments sit between their children.

## Escapes and classification

The simulation runs on a 512×512 board. When an object comes within 6 cells of the edge it is classified and removed, and its segment is marked **escaped** (almost always a glider heading to infinity). When the run ends, every surviving segment is identified:

1. its canonical form (the smallest encoding over the 8 rotations/reflections) is looked up in a table built by running every named still life, oscillator and spaceship through all its phases;
2. otherwise the app evolves it in isolation to find a period and displacement, labelling it as a still life, an oscillator of period $p$, or a spaceship of speed $d/p\,c$.

## Statistics reported

- **Reaction settles at**: the last generation with a split, merge or death. For the R-pentomino this is generation 1103, matching the literature.
- **World stable at**: when the whole board (after escapes) repeats exactly.
- Counts of segments, splits, merges, deaths and escapes, and the final census.

The implementation is `src/engine/lineage.ts`, with tests in `tests/trees.test.ts`.
