// Maze generation with a guaranteed route (`maze_generation@1`).
//
// The split that matters: the author decides the head and the tail, the engine fills in between.
// An entrance and an exit come in as real tiles chosen by whoever built the scene; what comes back
// is a layout that is always walkable from one to the other. A generator that can strand the
// player is not a feature, it is a bug, so the route is computed and asserted, not hoped for.
//
// Pure and deterministic: the same seed and the same endpoints always give the same maze, which is
// what lets an endless run be replayed and, later, shared without sending the map.

import type { FloorSpec, WallSpec } from "./world";

export interface MazeTile {
  x: number;
  z: number;
}

export interface MazeRequest {
  width: number;
  depth: number;
  seed: number;
  /** Where the player starts. Kept open, along with its immediate surroundings. */
  entrance: MazeTile;
  /** Where the floor ends. Kept open and always reachable. */
  exit: MazeTile;
  /**
   * 0 = a perfect maze: exactly one route, many dead ends. 100 = mostly open ground.
   * Anything between trades dead ends for loops, which is what keeps a run from feeling like a
   * corridor test.
   */
  braid: number;
}

export interface MazeResult {
  /** Run-length encoded wall rows, ready to drop into a SceneGraph. */
  walls: WallSpec[];
  /** Entrance → exit, tile by tile. Never empty. */
  path: MazeTile[];
  /** Every open tile, for placing monsters and treasure without burying them in rock. */
  open: MazeTile[];
}

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

const key = (tile: MazeTile): string => `${tile.x},${tile.z}`;
const NEIGHBOURS: MazeTile[] = [
  { x: 0, z: -2 },
  { x: 2, z: 0 },
  { x: 0, z: 2 },
  { x: -2, z: 0 },
];

function clampOdd(value: number, max: number): number {
  const inside = Math.max(1, Math.min(max - 2, Math.round(value)));
  // Carving happens on odd tiles so the even ones can stay as walls between them.
  return inside % 2 === 0 ? Math.max(1, inside - 1) : inside;
}

/** Randomised depth-first carving: every open tile ends up connected to every other one. */
function carve(request: MazeRequest, start: MazeTile, next: () => number): Set<string> {
  const open = new Set<string>([key(start)]);
  const stack: MazeTile[] = [start];

  while (stack.length > 0) {
    const here = stack[stack.length - 1];
    if (here === undefined) break;
    const options = NEIGHBOURS.map((delta) => ({
      x: here.x + delta.x,
      z: here.z + delta.z,
    })).filter(
      (tile) =>
        tile.x > 0 &&
        tile.z > 0 &&
        tile.x < request.width - 1 &&
        tile.z < request.depth - 1 &&
        !open.has(key(tile)),
    );

    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const pick = options[Math.floor(next() * options.length)];
    if (pick === undefined) {
      stack.pop();
      continue;
    }
    // Open the wall between here and the chosen cell, then the cell itself.
    open.add(key({ x: (here.x + pick.x) / 2, z: (here.z + pick.z) / 2 }));
    open.add(key(pick));
    stack.push(pick);
  }
  return open;
}

/** Knocks holes in dead ends so the maze has loops instead of only one route. */
function braid(open: Set<string>, request: MazeRequest, next: () => number): void {
  if (request.braid <= 0) return;
  const chance = Math.min(100, request.braid) / 100;
  for (let x = 1; x < request.width - 1; x += 1) {
    for (let z = 1; z < request.depth - 1; z += 1) {
      if (open.has(`${x},${z}`)) continue;
      if (next() > chance) continue;
      // Only remove a wall that actually joins two open tiles; never punch through the border.
      const horizontal = open.has(`${x - 1},${z}`) && open.has(`${x + 1},${z}`);
      const vertical = open.has(`${x},${z - 1}`) && open.has(`${x},${z + 1}`);
      if (horizontal || vertical) open.add(`${x},${z}`);
    }
  }
}

/** Breadth-first search, so the route returned is the shortest one that exists. */
function route(open: Set<string>, from: MazeTile, to: MazeTile): MazeTile[] {
  const previous = new Map<string, string>();
  const queue: MazeTile[] = [from];
  const seen = new Set<string>([key(from)]);

  while (queue.length > 0) {
    const here = queue.shift();
    if (here === undefined) break;
    if (here.x === to.x && here.z === to.z) break;
    for (const delta of [
      { x: 0, z: -1 },
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
    ]) {
      const tile = { x: here.x + delta.x, z: here.z + delta.z };
      if (!open.has(key(tile)) || seen.has(key(tile))) continue;
      seen.add(key(tile));
      previous.set(key(tile), key(here));
      queue.push(tile);
    }
  }

  if (!seen.has(key(to))) return [];
  const path: MazeTile[] = [];
  let cursor: string | undefined = key(to);
  while (cursor !== undefined) {
    const [x, z] = cursor.split(",").map(Number);
    path.unshift({ x: x ?? 0, z: z ?? 0 });
    cursor = previous.get(cursor);
  }
  return path;
}

/** Straight-line dig, used to guarantee the route when carving left the endpoints apart. */
function dig(open: Set<string>, from: MazeTile, to: MazeTile): void {
  let { x, z } = from;
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    open.add(`${x},${z}`);
  }
  while (z !== to.z) {
    z += Math.sign(to.z - z);
    open.add(`${x},${z}`);
  }
}

/** Groups solid tiles into the fewest WallSpec rows, so a big maze is not thousands of statements. */
function wallRows(open: Set<string>, floor: FloorSpec): WallSpec[] {
  const walls: WallSpec[] = [];
  for (let z = 0; z < floor.depth; z += 1) {
    let runStart: number | null = null;
    for (let x = 0; x <= floor.width; x += 1) {
      const solid = x < floor.width && !open.has(`${x},${z}`);
      if (solid && runStart === null) runStart = x;
      if (!solid && runStart !== null) {
        walls.push({ x: runStart, z, width: x - runStart, height: 3, material: floor.tile });
        runStart = null;
      }
    }
  }
  return walls;
}

export function generateMaze(request: MazeRequest): MazeResult {
  const floor: FloorSpec = { width: request.width, depth: request.depth, tile: "stone" };
  const next = rng(request.seed);

  const entrance = {
    x: clampOdd(request.entrance.x, request.width),
    z: clampOdd(request.entrance.z, request.depth),
  };
  const exit = {
    x: clampOdd(request.exit.x, request.width),
    z: clampOdd(request.exit.z, request.depth),
  };

  const open = carve(request, entrance, next);
  braid(open, request, next);

  // The author's endpoints are theirs: they stay open even if carving never reached them.
  open.add(key(entrance));
  open.add(key(exit));

  // A maze the player cannot finish is a bug, not a difficulty setting.
  let path = route(open, entrance, exit);
  if (path.length === 0) {
    dig(open, entrance, exit);
    path = route(open, entrance, exit);
  }

  const openTiles: MazeTile[] = [];
  for (let x = 0; x < request.width; x += 1) {
    for (let z = 0; z < request.depth; z += 1) {
      if (open.has(`${x},${z}`)) openTiles.push({ x, z });
    }
  }

  return { walls: wallRows(open, floor), path, open: openTiles };
}

/**
 * The next floor of an endless run: a new seed, and the previous exit becomes this entrance, so
 * the chain reads as one continuous descent rather than unrelated rooms.
 */
export function nextFloor(
  request: MazeRequest,
  previousExit: MazeTile,
  index: number,
): MazeRequest {
  return {
    ...request,
    seed: (request.seed + index * 0x9e3779b1) >>> 0,
    entrance: previousExit,
  };
}
