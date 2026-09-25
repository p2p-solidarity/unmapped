// Places on the land (地點): a side-scrolling course or a grid dungeon the player walks into from the
// open land and back out of, played by the engine's own kits. A place belongs to the save, like the
// land's continued chapters — adding one is not a new cartridge version, and nothing is lost.
//
// The model writes what lives there (its name, light, residents, loot, monsters, what to do); the
// host builds the ground so it can always be played: a course along one row, or a real maze with a
// guaranteed route. Coordinates the model wrote are not trusted — every entity is moved onto open
// ground here. Deterministic from the stored seed, so a place rebuilds identically on every load.

import { CHUNK_SIZE, type ChunkCoord } from "./chunks";
import type { GameplayKitId } from "./gameplay";
import { generateMaze } from "./maze";
import type { ExitSpec, PlatformSpec, SceneGraph, WallSpec } from "./world";

export const PLACE_KINDS = ["side", "dungeon"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIT: Record<PlaceKind, GameplayKitId> = {
  side: "platformer_2_5d@1",
  dungeon: "dungeon_grid@1",
};

export const PLACE_LIMITS = { max: 64, sourceChars: 16_000, titleChars: 60 } as const;

/** Exit labels inside a place: the way back to the land, and the far end that crosses it. */
export const PLACE_BACK = "↩";
export const PLACE_GOAL = "✓";

/** Save-owned: where a place's entrance stands and the program of what lives there. */
export interface LandPlace {
  id: string;
  kind: PlaceKind;
  title: string;
  /** Chunk whose centre holds the entrance (a ford crossing, so it is always reachable). */
  cx: number;
  cz: number;
  seed: number;
  /** The model's Scene program: residents, loot, monsters, light and objective. */
  source: string;
  cleared: boolean;
}

/** Thick fog reads as mood from above but as a white wall from a side or first-person camera. */
const PLACE_FOG_MAX = 0.035;

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

/**
 * A side-on course right of the spawn: stepping platforms with open ground between them (where
 * monsters and loot stand), now and then a low barrier to hop, and the way out at the far end.
 * Every rise stays under the 2.5D kit's ~1.4-tile jump.
 */
function course(seed: number, width: number, depth: number) {
  const next = rng(seed);
  const row = Math.floor(depth / 2);
  const start = Math.floor(width / 2) + 3;
  const platforms: PlatformSpec[] = [];
  const walls: WallSpec[] = [];
  let y = 0.6;
  for (let x = start; x < width - 6; x += 4 + (next() < 0.35 ? 1 : 0)) {
    y = Math.max(0.6, Math.min(2.2, y + (next() < 0.5 ? -0.4 : 0.5)));
    platforms.push({
      x,
      z: row - 1,
      width: 2,
      depth: 3,
      y,
      height: 0.4,
      tile: "wood",
      bounce: false,
    });
    if (next() < 0.3) walls.push({ x: x + 3, z: row, width: 1, height: 1, material: "stone" });
  }
  const blocked = (x: number): boolean =>
    walls.some((wall) => wall.x === x) || platforms.some((p) => x >= p.x && x < p.x + p.width);
  const open: [number, number][] = [];
  for (let x = start - 1; x < width - 3; x += 1) if (!blocked(x)) open.push([x, row]);
  return { exit: { x: width - 2, z: row }, platforms, walls, open };
}

/** Floor sizes: a long corridor for the course, an odd square for the maze (its cells are odd). */
const SIDE_FLOOR = { width: 61, depth: 9 } as const;
const DUNGEON_FLOOR = { width: 19, depth: 19 } as const;

export function placeTarget(id: string): string {
  return `place:${id}`;
}

export function parsePlaceTarget(target: string): string | null {
  const match = /^place:(p[0-9]{1,3})$/.exec(target);
  return match?.[1] ?? null;
}

/** World position of a place's entrance: the middle of its chunk, like a story gate. */
export function placeGate(place: Pick<LandPlace, "cx" | "cz">): { x: number; z: number } {
  return { x: place.cx * CHUNK_SIZE + 16.5, z: place.cz * CHUNK_SIZE + 16.5 };
}

/** Where the player asked for it, read from their words ("北邊", "west"…); null means nearest. */
export function wishedDirection(wish: string): { dx: number; dz: number } | null {
  const text = wish.toLowerCase();
  if (/北|north|上面/.test(text)) return { dx: 0, dz: -1 };
  if (/南|south|下面/.test(text)) return { dx: 0, dz: 1 };
  if (/東|东|east|右邊/.test(text)) return { dx: 1, dz: 0 };
  if (/西|west|左邊/.test(text)) return { dx: -1, dz: 0 };
  return null;
}

/**
 * The chunk a new place's entrance goes in: a short walk from the player (1–3 chunks), toward the
 * direction they named when they named one, never at home, on a story gate or on another place.
 */
export function placeSpot(
  near: ChunkCoord,
  taken: readonly ChunkCoord[],
  direction: { dx: number; dz: number } | null,
): ChunkCoord | null {
  const used = new Set(["0,0", ...taken.map((c) => `${c.cx},${c.cz}`)]);
  let best: { coord: ChunkCoord; score: number } | null = null;
  for (let dz = -3; dz <= 3; dz += 1) {
    for (let dx = -3; dx <= 3; dx += 1) {
      const ring = Math.max(Math.abs(dx), Math.abs(dz));
      if (ring === 0) continue;
      const coord = { cx: near.cx + dx, cz: near.cz + dz };
      if (used.has(`${coord.cx},${coord.cz}`)) continue;
      if (Math.abs(coord.cx) > 60 || Math.abs(coord.cz) > 60) continue;
      const along = direction === null ? 0 : (dx * direction.dx + dz * direction.dz) / ring;
      // Nearest first; a named direction outweighs one extra chunk of walking.
      const score = Math.hypot(dx, dz) - along * 2.5;
      if (best === null || score < best.score) best = { coord, score };
    }
  }
  return best?.coord ?? null;
}

export interface BuiltPlace {
  graph: SceneGraph;
  /** Leaving through this exit means the place was crossed; the other one is the way back. */
  goalExit: { x: number; z: number };
}

/** Moves every entity the model wrote onto open ground of the built layout, in a stable order. */
function settle(
  written: SceneGraph,
  open: readonly [number, number][],
  keepClear: (x: number, z: number) => boolean,
): Pick<SceneGraph, "npcs" | "monsters" | "treasures" | "props"> {
  const free = open.filter(([x, z]) => !keepClear(x, z));
  let cursor = 0;
  // Spread along the route instead of piling everything at its start.
  const step = Math.max(1, Math.floor(free.length / 12));
  const take = (): [number, number] | null => {
    if (free.length === 0) return null;
    const spot = free.splice(cursor % free.length, 1)[0] ?? null;
    cursor += step;
    return spot;
  };
  const place = <T extends { x: number; z: number }>(items: readonly T[]): T[] =>
    items.flatMap((item) => {
      const at = take();
      return at === null ? [] : [{ ...item, x: at[0], z: at[1] }];
    });
  return {
    treasures: place(written.treasures),
    npcs: place(written.npcs),
    monsters: place(written.monsters),
    props: place(written.props),
  };
}

/** The playable scene of a place: the model's residents on the host's ground. */
export function buildPlace(place: LandPlace, written: SceneGraph): BuiltPlace {
  const kit = PLACE_KIT[place.kind];
  if (place.kind === "side") {
    const { width, depth } = SIDE_FLOOR;
    const layout = course(place.seed, width, depth);
    const row = Math.floor(depth / 2);
    const spawn = Math.floor(width / 2);
    // Residents and loot stand on the ground between the platforms, never inside a raised block.
    const entities = settle(written, layout.open, (x) => Math.abs(x - spawn) < 3);
    const exits: ExitSpec[] = [
      { x: spawn - 3, z: row, to: PLACE_BACK, targetSceneId: null },
      { x: layout.exit.x, z: layout.exit.z, to: PLACE_GOAL, targetSceneId: null },
    ];
    return {
      graph: {
        ...written,
        ...entities,
        sky: calmSky(written.sky),
        // A course has no room for scenery: every prop would be a wall across the one row.
        props: [],
        contract: contract(place, kit),
        floor: { width, depth, tile: written.floor.tile },
        patches: [],
        platforms: layout.platforms,
        walls: layout.walls,
        exits,
        triggers: [],
      },
      goalExit: { x: layout.exit.x, z: layout.exit.z },
    };
  }
  const { width, depth } = DUNGEON_FLOOR;
  const centre = { x: Math.floor(width / 2), z: Math.floor(depth / 2) };
  const corners = [
    { x: 1, z: 1 },
    { x: width - 2, z: 1 },
    { x: 1, z: depth - 2 },
    { x: width - 2, z: depth - 2 },
  ];
  const goal = corners[place.seed % corners.length] ?? { x: 1, z: 1 };
  const maze = generateMaze({
    width,
    depth,
    seed: place.seed,
    entrance: centre,
    exit: goal,
    braid: 25,
  });
  const end = maze.path[maze.path.length - 1] ?? goal;
  // The way back stands behind the player as they arrive (they face north), not in their face:
  // the tile south of the start is carved open for it, whatever the maze put there.
  const beside = { x: centre.x, z: centre.z + 1 };
  const walls = openTile(maze.walls, beside.x, beside.z);
  const open = maze.open.map((tile) => [tile.x, tile.z] as [number, number]);
  const entities = settle(
    written,
    open,
    (x, z) => Math.abs(x - centre.x) + Math.abs(z - centre.z) < 2 || (x === end.x && z === end.z),
  );
  const exits: ExitSpec[] = [
    { x: beside.x, z: beside.z, to: PLACE_BACK, targetSceneId: null },
    { x: end.x, z: end.z, to: PLACE_GOAL, targetSceneId: null },
  ];
  return {
    graph: {
      ...written,
      ...entities,
      sky: calmSky(written.sky),
      contract: contract(place, kit),
      floor: { width, depth, tile: written.floor.tile === "void" ? "stone" : written.floor.tile },
      patches: [],
      platforms: [],
      walls,
      exits,
      triggers: [],
    },
    goalExit: { x: end.x, z: end.z },
  };
}

/** Wall rows with one tile taken out (a run through it is split in two). */
function openTile(walls: readonly WallSpec[], x: number, z: number): WallSpec[] {
  return walls.flatMap((wall) => {
    const width = Math.max(1, Math.round(wall.width));
    if (wall.z !== z || x < wall.x || x >= wall.x + width) return [wall];
    return [
      ...(x > wall.x ? [{ ...wall, width: x - wall.x }] : []),
      ...(x + 1 < wall.x + width ? [{ ...wall, x: x + 1, width: wall.x + width - x - 1 }] : []),
    ];
  });
}

function calmSky(sky: SceneGraph["sky"]): SceneGraph["sky"] {
  return sky === null ? null : { ...sky, fogDensity: Math.min(sky.fogDensity, PLACE_FOG_MAX) };
}

function contract(place: LandPlace, kit: GameplayKitId): NonNullable<SceneGraph["contract"]> {
  return {
    sceneId: `place-${place.id}`,
    kit,
    requiresFlags: [],
    requiresItems: [],
    inventoryPolicy: "carry",
    grantsFlags: [],
    terminal: false,
  };
}
