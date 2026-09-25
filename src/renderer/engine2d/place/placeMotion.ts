// Walking inside a place on engine2d (rev6-phase2 D5). Pure: the same inputs and deltas always give
// the same body, so the invariant test walks every place the host builds with this exact code.
//
// - A course (`platformer_2_5d@1`) is seen from the side: x along the course, y up from the ground,
//   the row fixed. Speeds, jump and gravity are the kit's tuning. The course's platforms are ledges
//   that are jumped through from below, stood on from above and dropped through by holding down, so
//   the ground under them always goes on; its low walls are solid up to their height and hopped.
// - A dungeon (`dungeon_grid@1`) is seen from above and walked one tile per step like the 3D grid
//   kit: a held direction faces that way and steps when the tile ahead is inside the floor and open.
//
// Sub-stepped at a fixed rate so a slow frame never tunnels through a wall's top or a ledge.

import type { GameplayKitRules } from "@shared/gameplay";
import type { Tile as GroundTile, SceneGraph } from "@shared/world";
import { PLAYER_RADIUS, spawnTile } from "../../engine/colliders";
import type { Facing4 } from "../../engine/playerProbe";

const SUBSTEP = 1 / 120;
const TERMINAL_VELOCITY = 22;
const EPSILON = 1e-6;
/** How far below a ledge a body must fall before that ledge holds it again. */
const DROP_CLEARANCE = 0.1;
/** Thinnest ledge and lowest wall, as the 3D colliders build them. */
const MIN_THICKNESS = 0.08;
const MIN_WALL = 0.2;

export const BODY_RADIUS = PLAYER_RADIUS;

export type SideTuning = Pick<
  GameplayKitRules,
  "moveSpeed" | "sprintSpeed" | "jumpSpeed" | "gravity"
>;

/** A one-way platform along the row: `bottom` is its underside, `top` its walkable face. */
export interface Ledge {
  x0: number;
  x1: number;
  bottom: number;
  top: number;
  tile: GroundTile;
}

/** A wall on the row: solid from the ground up to `top`. */
export interface Block {
  x0: number;
  x1: number;
  top: number;
}

export interface SideCourse {
  /** World z of the walking row's centre (every figure of the course stands on it). */
  z: number;
  minX: number;
  maxX: number;
  ledges: Ledge[];
  blocks: Block[];
  spawnX: number;
}

export interface SideBody {
  x: number;
  /** Height of the soles above the ground. */
  y: number;
  vy: number;
  grounded: boolean;
  /** The top of the ledge being dropped through, until the body is clear below it. */
  through: number | null;
  facing: 1 | -1;
  moving: boolean;
}

export interface SideInput {
  /** -1 left … +1 right. */
  move: number;
  jump: boolean;
  sprint: boolean;
  drop: boolean;
  /** Tiles to be pushed along x this frame (a blow), through the same wall collision. */
  push: number;
}

export const NO_SIDE_INPUT: SideInput = {
  move: 0,
  jump: false,
  sprint: false,
  drop: false,
  push: 0,
};

/** The course as the side body meets it: the row the spawn stands on, its ledges and its walls. */
export function sideCourse(graph: SceneGraph): SideCourse {
  const [spawnX, row] = spawnTile(graph) ?? [0, 0];
  const z = row + 0.5;
  const ledges = graph.platforms
    .filter((one) => z >= one.z && z <= one.z + one.depth)
    .map((one) => {
      const bottom = Math.max(0, one.y);
      return {
        x0: one.x,
        x1: one.x + Math.max(0.2, one.width),
        bottom,
        top: bottom + Math.max(MIN_THICKNESS, one.height),
        tile: one.tile,
      };
    });
  const blocks = graph.walls
    .filter((one) => Math.round(one.z) === row)
    .map((one) => ({
      x0: one.x,
      x1: one.x + Math.max(1, Math.round(one.width)),
      top: Math.max(MIN_WALL, one.height),
    }));
  return { z, minX: 0, maxX: graph.floor.width, ledges, blocks, spawnX: spawnX + 0.5 };
}

export function sideSpawn(course: SideCourse): SideBody {
  return {
    x: course.spawnX,
    y: 0,
    vy: 0,
    grounded: true,
    through: null,
    facing: 1,
    moving: false,
  };
}

/**
 * Where the side body counts for reaching things, in the scene's XZ plane: its x, and the row
 * lifted by its height — so a chest on the ground is out of reach from a high ledge above it.
 */
export function sideReach(body: SideBody, course: SideCourse): { x: number; z: number } {
  return { x: body.x, z: course.z + body.y };
}

function overlaps(x: number, x0: number, x1: number): boolean {
  return x + BODY_RADIUS > x0 + EPSILON && x - BODY_RADIUS < x1 - EPSILON;
}

/** The ledge the body stands on, or null (the ground or a wall's top is not a ledge). */
function ledgeUnder(course: SideCourse, body: SideBody): Ledge | null {
  if (!body.grounded) return null;
  return (
    course.ledges.find(
      (one) => Math.abs(one.top - body.y) < 1e-4 && overlaps(body.x, one.x0, one.x1),
    ) ?? null
  );
}

/** Moves along x by `dx`, stopped by the side of any wall the body is below the top of. */
function slide(course: SideCourse, x: number, y: number, dx: number): number {
  let next = x + dx;
  for (const block of course.blocks) {
    if (y >= block.top - EPSILON) continue;
    if (dx > 0 && x + BODY_RADIUS <= block.x0 + EPSILON && next + BODY_RADIUS > block.x0) {
      next = block.x0 - BODY_RADIUS;
    } else if (dx < 0 && x - BODY_RADIUS >= block.x1 - EPSILON && next - BODY_RADIUS < block.x1) {
      next = block.x1 + BODY_RADIUS;
    }
  }
  return Math.min(course.maxX - BODY_RADIUS, Math.max(course.minX + BODY_RADIUS, next));
}

/** The highest surface crossed on the way from `from` down to `to`, or null. */
function landing(
  course: SideCourse,
  x: number,
  from: number,
  to: number,
  through: number | null,
): number | null {
  let best: number | null = to <= 0 ? 0 : null;
  const consider = (top: number): void => {
    if (top > from + EPSILON || top < to) return;
    if (best === null || top > best) best = top;
  };
  for (const ledge of course.ledges) {
    if (through !== null && Math.abs(ledge.top - through) < 1e-4) continue;
    if (overlaps(x, ledge.x0, ledge.x1)) consider(ledge.top);
  }
  for (const block of course.blocks) if (overlaps(x, block.x0, block.x1)) consider(block.top);
  return best;
}

/** One frame of the side body. Holding jump hops again on landing, as in the 3D kit. */
export function stepSide(
  body: SideBody,
  input: SideInput,
  course: SideCourse,
  kit: SideTuning,
  delta: number,
): SideBody {
  const time = Math.max(0, delta);
  const steps = Math.max(1, Math.ceil(time / SUBSTEP - EPSILON));
  const dt = time / steps;
  const move = Math.max(-1, Math.min(1, input.move));
  const speed = input.sprint ? kit.sprintSpeed : kit.moveSpeed;
  let next: SideBody = {
    ...body,
    facing: move > 0 ? 1 : move < 0 ? -1 : body.facing,
  };
  const startX = body.x;
  for (let step = 0; step < steps; step += 1) {
    if (next.grounded && input.jump && kit.jumpSpeed > 0) {
      next = { ...next, vy: kit.jumpSpeed, grounded: false, through: null };
    } else if (input.drop) {
      const under = ledgeUnder(course, next);
      if (under !== null) next = { ...next, grounded: false, through: under.top };
    }
    const x = slide(course, next.x, next.y, move * speed * dt + input.push / steps);
    const vy = Math.max(-TERMINAL_VELOCITY, next.vy - kit.gravity * dt);
    const to = next.y + vy * dt;
    const through =
      next.through !== null && to < next.through - DROP_CLEARANCE ? null : next.through;
    const floor = vy <= 0 ? landing(course, x, next.y, to, through) : null;
    next =
      floor === null
        ? { ...next, x, y: to, vy, grounded: false, through }
        : { ...next, x, y: floor, vy: 0, grounded: true, through };
  }
  return { ...next, moving: Math.abs(next.x - startX) > EPSILON };
}

// ── The dungeon: one tile per step, seen from above ─────────────────────────────────────────────

export interface Tile {
  x: number;
  z: number;
}

export interface GridMaze {
  width: number;
  depth: number;
  blocked: ReadonlySet<string>;
}

export interface GridBody {
  /** The tile left, the tile being walked to, and how far along (1 = standing on `to`). */
  from: Tile;
  to: Tile;
  progress: number;
  facing: Facing4;
  moving: boolean;
}

const STEP: Record<Facing4, Tile> = {
  north: { x: 0, z: -1 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  west: { x: -1, z: 0 },
};

const tileKey = (x: number, z: number): string => `${x},${z}`;

export function gridMaze(graph: SceneGraph): GridMaze {
  const blocked = new Set<string>();
  for (const wall of graph.walls) {
    for (let run = 0; run < Math.max(1, Math.round(wall.width)); run += 1) {
      blocked.add(tileKey(Math.round(wall.x) + run, Math.round(wall.z)));
    }
  }
  return { width: graph.floor.width, depth: graph.floor.depth, blocked };
}

export function gridOpen(maze: GridMaze, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= maze.width || z >= maze.depth) return false;
  return !maze.blocked.has(tileKey(x, z));
}

/** Standing on the spawn tile, facing north: the way back is behind, as in the 3D maze. */
export function gridSpawn(graph: SceneGraph): GridBody {
  const [x, z] = spawnTile(graph) ?? [0, 0];
  const tile = { x, z };
  return { from: tile, to: tile, progress: 1, facing: "north", moving: false };
}

/** The body's centre in world units (tile centres are at +0.5). */
export function gridPosition(body: GridBody): { x: number; z: number } {
  const t = Math.min(1, Math.max(0, body.progress));
  return {
    x: body.from.x + (body.to.x - body.from.x) * t + 0.5,
    z: body.from.z + (body.to.z - body.from.z) * t + 0.5,
  };
}

/**
 * Which way the held keys ask to walk: one axis at a time. With both held, the axis already being
 * walked keeps going, so a corner is turned by letting go, not by a diagonal.
 */
export function gridDirection(
  axis: { forward: number; strafe: number },
  facing: Facing4,
): Facing4 | null {
  const horizontal: Facing4 | null = axis.strafe > 0 ? "east" : axis.strafe < 0 ? "west" : null;
  const vertical: Facing4 | null = axis.forward > 0 ? "north" : axis.forward < 0 ? "south" : null;
  if (horizontal !== null && vertical !== null) {
    return facing === vertical ? vertical : horizontal;
  }
  return horizontal ?? vertical;
}

/**
 * One frame of the grid walker at `speed` tiles a second. Standing, a held direction turns to face
 * it and starts a step when that tile is open; a closed one only turns it (to aim). A step always
 * finishes; time left over after arriving goes into the next step, so holding a key walks evenly.
 */
export function stepGrid(
  body: GridBody,
  direction: Facing4 | null,
  maze: GridMaze,
  speed: number,
  delta: number,
): GridBody {
  let time = Math.max(0, delta);
  let next: GridBody = { ...body };
  const rate = Math.max(0.1, speed);
  for (let guard = 0; guard < 8; guard += 1) {
    if (next.progress < 1) {
      const need = (1 - next.progress) / rate;
      if (time < need) {
        next = { ...next, progress: next.progress + time * rate };
        time = 0;
        break;
      }
      time -= need;
      next = { ...next, from: next.to, progress: 1 };
    }
    if (direction === null) break;
    const ahead = { x: next.to.x + STEP[direction].x, z: next.to.z + STEP[direction].z };
    next = { ...next, facing: direction };
    if (!gridOpen(maze, ahead.x, ahead.z) || time <= 0) break;
    next = { ...next, from: next.to, to: ahead, progress: 0 };
  }
  return { ...next, moving: next.progress < 1 };
}

/** Unit direction of a facing in the scene's XZ plane (north is -z). */
export function facingVector(facing: Facing4): { dx: number; dz: number } {
  return { dx: STEP[facing].x, dz: STEP[facing].z };
}
