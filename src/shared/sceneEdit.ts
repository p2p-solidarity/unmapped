// Scene editing as pure operations on a SceneGraph.
//
// Every edit is "put this kind of thing on this tile" or "take whatever is on this tile away".
// That is the whole interaction model: no coordinate fields, no numeric nudging — the last editor
// was a form full of x/z/width/depth boxes and nobody could use it.
//
// Pure and clamped, so the rules are unit-tested and a scene can never be edited into something
// the DSL would reject (Rule 7).

import type { MonsterKind, PropKind, SceneGraph, Tile } from "./world";

/** Highest a platform may float, in tiles. Matches the Scene DSL's coordinate ceiling. */
const MAX_ELEVATION = 12;

export const BRUSH_KINDS = [
  "platform",
  "wall",
  "prop",
  "physics",
  "monster",
  "treasure",
  "patch",
  "exit",
] as const;
export type BrushKind = (typeof BRUSH_KINDS)[number];

export interface Brush {
  kind: BrushKind;
  /** Which prop to place, for the `prop` and `physics` brushes. */
  prop: PropKind;
  /** Which monster to place, for the `monster` brush. */
  monster: MonsterKind;
  /** Ground material, for `patch`; block material for `platform` and `wall`. */
  tile: Tile;
  /** Height above the floor for a platform, in tiles. 0 sits on the ground. */
  elevation: number;
  /** Platforms only: landing on one launches the player. */
  bounce: boolean;
}

export const DEFAULT_BRUSH: Brush = {
  kind: "platform",
  prop: "crate",
  monster: "slime",
  tile: "stone",
  elevation: 0,
  bounce: false,
};

function clampTile(value: number, extent: number): number {
  return Math.max(0, Math.min(extent - 1, Math.round(value)));
}

function occupies(graph: SceneGraph, x: number, z: number): boolean {
  return (
    graph.platforms.some(
      (one) => x >= one.x && x < one.x + one.width && z >= one.z && z < one.z + one.depth,
    ) ||
    graph.walls.some((one) => z === one.z && x >= one.x && x < one.x + one.width) ||
    graph.props.some((one) => one.x === x && one.z === z) ||
    graph.monsters.some((one) => one.x === x && one.z === z) ||
    graph.treasures.some((one) => one.x === x && one.z === z)
  );
}

/** A stable id for a newly placed entity; the numeric tail keeps ids unique within the scene. */
function nextId(prefix: string, taken: readonly { id: string }[]): string {
  let index = taken.length + 1;
  const used = new Set(taken.map((one) => one.id));
  while (used.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

/**
 * Puts the brush's thing on a tile. Placing on an occupied tile is a no-op rather than a stack:
 * two crates in one tile is never what the click meant.
 */
export function paint(graph: SceneGraph, brush: Brush, x: number, z: number): SceneGraph {
  const tx = clampTile(x, graph.floor.width);
  const tz = clampTile(z, graph.floor.depth);

  // The exit is a move, not an addition: a scene has exactly one way out.
  if (brush.kind === "exit") {
    const existing = graph.exits[0];
    return {
      ...graph,
      exits: [
        existing === undefined
          ? { x: tx, z: tz, to: "Exit", targetSceneId: null }
          : { ...existing, x: tx, z: tz },
      ],
    };
  }

  // A patch repaints the ground, so it may sit under anything already there.
  if (brush.kind === "patch") {
    const without = graph.patches.filter((one) => !(one.x === tx && one.z === tz));
    return {
      ...graph,
      patches: [...without, { x: tx, z: tz, width: 1, depth: 1, tile: brush.tile }],
    };
  }

  if (occupies(graph, tx, tz)) return graph;

  switch (brush.kind) {
    case "platform":
      return {
        ...graph,
        platforms: [
          ...graph.platforms,
          {
            x: tx,
            z: tz,
            width: 1,
            depth: 1,
            y: Math.max(0, Math.min(MAX_ELEVATION, brush.elevation)),
            height: 0.5,
            tile: brush.tile,
            bounce: brush.bounce,
          },
        ],
      };
    case "wall":
      return {
        ...graph,
        walls: [...graph.walls, { x: tx, z: tz, width: 1, height: 3, material: brush.tile }],
      };
    case "prop":
    case "physics":
      return {
        ...graph,
        props: [
          ...graph.props,
          // The same prop either way; `dynamic` is the difference between scenery and a thing
          // you can knock over, which is exactly the difference the sandbox is about.
          {
            kind: brush.prop,
            x: tx,
            z: tz,
            scale: 1,
            tint: null,
            dynamic: brush.kind === "physics",
          },
        ],
      };
    case "monster":
      return {
        ...graph,
        monsters: [
          ...graph.monsters,
          {
            id: nextId("foe", graph.monsters),
            kind: brush.monster,
            x: tx,
            z: tz,
            level: 1,
            weakness: "",
            size: 1,
            color: null,
          },
        ],
      };
    case "treasure":
      return {
        ...graph,
        treasures: [
          ...graph.treasures,
          { id: nextId("chest", graph.treasures), x: tx, z: tz, loot: [] },
        ],
      };
  }
}

/**
 * Takes away whatever the tile holds, topmost first. The exit is never erased — a scene with no
 * way out is not a scene, and the exit brush moves it instead.
 */
export function erase(graph: SceneGraph, x: number, z: number): SceneGraph {
  const tx = clampTile(x, graph.floor.width);
  const tz = clampTile(z, graph.floor.depth);

  const monster = graph.monsters.find((one) => one.x === tx && one.z === tz);
  if (monster !== undefined) {
    return { ...graph, monsters: graph.monsters.filter((one) => one !== monster) };
  }
  const treasure = graph.treasures.find((one) => one.x === tx && one.z === tz);
  if (treasure !== undefined) {
    return { ...graph, treasures: graph.treasures.filter((one) => one !== treasure) };
  }
  const prop = graph.props.find((one) => one.x === tx && one.z === tz);
  if (prop !== undefined) {
    return { ...graph, props: graph.props.filter((one) => one !== prop) };
  }
  const platform = graph.platforms.find(
    (one) => tx >= one.x && tx < one.x + one.width && tz >= one.z && tz < one.z + one.depth,
  );
  if (platform !== undefined) {
    return { ...graph, platforms: graph.platforms.filter((one) => one !== platform) };
  }
  const wall = graph.walls.find((one) => tz === one.z && tx >= one.x && tx < one.x + one.width);
  if (wall !== undefined) {
    return { ...graph, walls: graph.walls.filter((one) => one !== wall) };
  }
  const patch = graph.patches.find((one) => one.x === tx && one.z === tz);
  if (patch !== undefined) {
    return { ...graph, patches: graph.patches.filter((one) => one !== patch) };
  }
  return graph;
}

/** What the tile currently holds, for the editor's status line. */
export function describeTile(graph: SceneGraph, x: number, z: number): string | null {
  if (graph.monsters.some((one) => one.x === x && one.z === z)) return "monster";
  if (graph.treasures.some((one) => one.x === x && one.z === z)) return "treasure";
  const prop = graph.props.find((one) => one.x === x && one.z === z);
  if (prop !== undefined) return prop.dynamic ? `${prop.kind} (physics)` : prop.kind;
  if (graph.exits.some((one) => one.x === x && one.z === z)) return "exit";
  if (
    graph.platforms.some(
      (one) => x >= one.x && x < one.x + one.width && z >= one.z && z < one.z + one.depth,
    )
  ) {
    return "platform";
  }
  if (graph.walls.some((one) => z === one.z && x >= one.x && x < one.x + one.width)) return "wall";
  return null;
}
