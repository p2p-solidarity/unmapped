// Pure tile ↔ world maths and collider descriptions. No three, no React — importable from
// vitest (node env) and from the R3F components alike.
//
// Convention: tile (x, z) is a 1 × 0.2 × 1 box centred at world (x + 0.5, 0, z + 0.5), so the
// walkable surface is y = TILE_TOP and a floor of width w / depth d spans world x ∈ [0, w].

import type { FloorSpec, PropSpec, SceneGraph, WallSpec } from "@shared/world";
import { PROP_SHAPE } from "./palette";

export const TILE_THICKNESS = 0.2;
export const TILE_TOP = TILE_THICKNESS / 2;

/** Capsule half-height (cylinder part) and radius of the player character. */
export const PLAYER_RADIUS = 0.3;
export const PLAYER_HALF_HEIGHT = 0.5;
/** Distance from the capsule centre to the soles. */
export const PLAYER_FOOT_OFFSET = PLAYER_HALF_HEIGHT + PLAYER_RADIUS;

export type Vec3 = [number, number, number];

export interface BoxSpec {
  /** World-space centre. */
  center: Vec3;
  /** Half extents, matching Rapier's CuboidCollider args. */
  half: Vec3;
}

export interface CylinderSpec {
  center: Vec3;
  radius: number;
  /** Half height, matching Rapier's CylinderCollider args. */
  halfHeight: number;
}

/** Centre of tile (x, z) on the XZ plane. */
export function tileToWorld(x: number, z: number): [number, number] {
  return [x + 0.5, z + 0.5];
}

/** Centre of tile (x, z) with an explicit height above the walkable surface. */
export function tileCenter(x: number, z: number, y = 0): Vec3 {
  return [x + 0.5, TILE_TOP + y, z + 0.5];
}

/** Tile a world position sits on (floor of the raw coordinate). */
export function worldToTile(x: number, z: number): [number, number] {
  return [Math.floor(x), Math.floor(z)];
}

/** One fixed cuboid covering the whole floor; its top face is exactly TILE_TOP. */
export function floorBox(floor: FloorSpec): BoxSpec {
  return {
    center: [floor.width / 2, 0, floor.depth / 2],
    half: [floor.width / 2, TILE_TOP, floor.depth / 2],
  };
}

/**
 * A wall is a run of `width` tiles starting at tile (x, z) along +X, one tile deep, standing
 * `height` world units on top of the floor surface.
 */
export function wallBox(wall: WallSpec): BoxSpec {
  const runs = Math.max(1, Math.round(wall.width));
  const tall = Math.max(0.2, wall.height);
  return {
    center: [wall.x + runs / 2, TILE_TOP + tall / 2, wall.z + 0.5],
    half: [runs / 2, tall / 2, 0.5],
  };
}

/** Every tile a wall occupies, used by spawn selection. */
export function wallTiles(wall: WallSpec): Array<[number, number]> {
  const runs = Math.max(1, Math.round(wall.width));
  const tiles: Array<[number, number]> = [];
  for (let i = 0; i < runs; i += 1) tiles.push([wall.x + i, wall.z]);
  return tiles;
}

export function isWallTile(walls: readonly WallSpec[], x: number, z: number): boolean {
  for (const wall of walls) {
    if (wall.z !== z) continue;
    const runs = Math.max(1, Math.round(wall.width));
    if (x >= wall.x && x < wall.x + runs) return true;
  }
  return false;
}

/** Cylinder collider for a prop, or null for walk-through props (flowers, mushrooms). */
export function propCollider(prop: PropSpec): CylinderSpec | null {
  const shape = PROP_SHAPE[prop.kind];
  if (shape.collider <= 0) return null;
  const scale = prop.scale > 0 ? prop.scale : 1;
  const halfHeight = (shape.colliderHeight * scale) / 2;
  const [wx, wz] = tileToWorld(prop.x, prop.z);
  return {
    center: [wx, TILE_TOP + halfHeight, wz],
    radius: shape.collider * scale,
    halfHeight,
  };
}

export function isInsideFloor(floor: FloorSpec, x: number, z: number, margin = 0): boolean {
  return x >= margin && x <= floor.width - margin && z >= margin && z <= floor.depth - margin;
}

/** Keeps a world position inside the floor rectangle, leaving `margin` to the edge. */
export function clampToFloor(
  floor: FloorSpec,
  x: number,
  z: number,
  margin = PLAYER_RADIUS,
): [number, number] {
  const maxX = Math.max(margin, floor.width - margin);
  const maxZ = Math.max(margin, floor.depth - margin);
  return [Math.min(Math.max(x, margin), maxX), Math.min(Math.max(z, margin), maxZ)];
}

/**
 * Spawn tile: the floor centre, or — when a wall stands there — the closest wall-free tile found
 * by a deterministic outward ring search. Returns null only for a floor with no free tile.
 */
export function spawnTile(scene: SceneGraph): [number, number] | null {
  const { floor, walls } = scene;
  if (floor.width <= 0 || floor.depth <= 0) return null;
  const cx = Math.floor(floor.width / 2);
  const cz = Math.floor(floor.depth / 2);
  const reach = Math.max(floor.width, floor.depth);
  for (let ring = 0; ring <= reach; ring += 1) {
    for (let dz = -ring; dz <= ring; dz += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x >= floor.width || z >= floor.depth) continue;
        if (isWallTile(walls, x, z)) continue;
        return [x, z];
      }
    }
  }
  return null;
}

/** World position of the player capsule centre at spawn (feet resting on the floor surface). */
export function spawnPoint(scene: SceneGraph): Vec3 {
  const tile = spawnTile(scene);
  if (tile === null) return [0.5, TILE_TOP + PLAYER_FOOT_OFFSET, 0.5];
  const [wx, wz] = tileToWorld(tile[0], tile[1]);
  return [wx, TILE_TOP + PLAYER_FOOT_OFFSET, wz];
}

/** Centre of the floor, used to park scene-wide point lights and the initial camera. */
export function floorCenter(floor: FloorSpec): Vec3 {
  return [floor.width / 2, TILE_TOP, floor.depth / 2];
}

export function wallBoxes(walls: readonly WallSpec[]): BoxSpec[] {
  return walls.map(wallBox);
}

export function propColliders(props: readonly PropSpec[]): CylinderSpec[] {
  const out: CylinderSpec[] = [];
  for (const prop of props) {
    const collider = propCollider(prop);
    if (collider !== null) out.push(collider);
  }
  return out;
}
