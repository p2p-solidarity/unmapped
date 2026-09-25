// Grid-step movement: the Wizardry / Persona-dungeon / old-Quake-maze way of walking.
//
// You stand in the middle of a tile, face one of four directions, and move one whole tile at a
// time; left and right turn you ninety degrees instead of strafing. It is a genuinely different
// game feel from free 3D movement, not a camera preset — which is why it is its own capability
// (`physics:grid_step`) rather than a tweak to the walking one.
//
// Pure maths, so the stepping rules are unit-tested without a canvas.

import type { FloorSpec, WallSpec } from "@shared/world";

/** North/east/south/west as quarter turns; 0 faces -Z, matching the camera's zero yaw. */
export type Facing = 0 | 1 | 2 | 3;

export const FACING_YAW: Record<Facing, number> = {
  0: 0,
  1: -Math.PI / 2,
  2: Math.PI,
  3: Math.PI / 2,
};

const DELTA: Record<Facing, { x: number; z: number }> = {
  0: { x: 0, z: -1 },
  1: { x: 1, z: 0 },
  2: { x: 0, z: 1 },
  3: { x: -1, z: 0 },
};

export function turn(facing: Facing, quarters: number): Facing {
  return ((((facing + quarters) % 4) + 4) % 4) as Facing;
}

/** Tile a wall statement occupies, expanded along its width. */
function wallTiles(walls: readonly WallSpec[]): Set<string> {
  const blocked = new Set<string>();
  for (const wall of walls) {
    for (let step = 0; step < Math.max(1, Math.round(wall.width)); step += 1) {
      blocked.add(`${Math.round(wall.x) + step},${Math.round(wall.z)}`);
    }
  }
  return blocked;
}

export interface GridTile {
  x: number;
  z: number;
}

/**
 * The tile one step ahead (or behind, with `sign = -1`), or the current tile when a wall or the
 * floor edge is in the way. Refusing to move is the correct answer: there is no sliding here.
 */
export function stepTarget(
  from: GridTile,
  facing: Facing,
  sign: 1 | -1,
  floor: FloorSpec,
  walls: readonly WallSpec[],
): GridTile {
  const delta = DELTA[facing];
  const next = { x: from.x + delta.x * sign, z: from.z + delta.z * sign };
  if (next.x < 0 || next.z < 0 || next.x >= floor.width || next.z >= floor.depth) return from;
  if (wallTiles(walls).has(`${next.x},${next.z}`)) return from;
  return next;
}

/** Tile the player starts on: the middle of the floor, which scenes keep clear. */
export function startTile(floor: FloorSpec): GridTile {
  return { x: Math.floor(floor.width / 2), z: Math.floor(floor.depth / 2) };
}

/** Shortest signed angle from `from` to `to`, so a turn never takes the long way round. */
export function shortestTurn(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
