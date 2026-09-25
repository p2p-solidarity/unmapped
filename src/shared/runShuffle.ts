// `run_shuffle@1`: the same authored space, laid out differently every run.
//
// Honest about what it is. This is NOT level generation — the floor, the walls and the route the
// author built are untouched. What moves is where the monsters, treasures and loose props stand.
// That is why the capability is called `content:run_shuffle` and not `content:procedural_runs`:
// a roguelike can opt into it through a stated substitution, knowing what it is getting.
//
// Deterministic from the run seed, so the same seed replays the same layout and a shared session
// can agree on it without sending positions.

import type { SceneGraph } from "./world";

/** Mulberry32: small, fast, and identical in every JS engine, which is what determinism needs. */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiles a mover may stand on: inside the floor, clear of the spawn tile and of each other. */
function freeTiles(graph: SceneGraph, next: () => number): { x: number; z: number }[] {
  const centreX = Math.floor(graph.floor.width / 2);
  const centreZ = Math.floor(graph.floor.depth / 2);
  const blocked = new Set<string>([`${centreX},${centreZ}`]);
  for (const wall of graph.walls) {
    for (let step = 0; step < wall.width; step += 1) blocked.add(`${wall.x + step},${wall.z}`);
  }
  for (const exit of graph.exits) blocked.add(`${exit.x},${exit.z}`);

  const tiles: { x: number; z: number }[] = [];
  // A one-tile margin keeps movers off the very edge, where the floor clamp would pin them.
  for (let x = 1; x < graph.floor.width - 1; x += 1) {
    for (let z = 1; z < graph.floor.depth - 1; z += 1) {
      if (blocked.has(`${x},${z}`)) continue;
      // Never start a fight on top of the player.
      if (Math.abs(x - centreX) + Math.abs(z - centreZ) < 3) continue;
      tiles.push({ x, z });
    }
  }

  // Fisher-Yates with the run's own stream, so the order is a function of the seed alone.
  for (let index = tiles.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const a = tiles[index];
    const b = tiles[swap];
    if (a !== undefined && b !== undefined) {
      tiles[index] = b;
      tiles[swap] = a;
    }
  }
  return tiles;
}

/**
 * Re-places the movers of a scene for one run. Returns the graph unchanged when there is nowhere
 * to put them, so a cramped authored space never silently loses its monsters.
 */
export function shuffleForRun(graph: SceneGraph, seed: number): SceneGraph {
  const movers = graph.monsters.length + graph.treasures.length;
  if (movers === 0) return graph;

  const next = rng(seed);
  const tiles = freeTiles(graph, next);
  if (tiles.length < movers) return graph;

  let cursor = 0;
  const take = (): { x: number; z: number } => {
    const tile = tiles[cursor];
    cursor += 1;
    return tile ?? { x: 1, z: 1 };
  };

  return {
    ...graph,
    monsters: graph.monsters.map((monster) => ({ ...monster, ...take() })),
    treasures: graph.treasures.map((treasure) => ({ ...treasure, ...take() })),
  };
}
