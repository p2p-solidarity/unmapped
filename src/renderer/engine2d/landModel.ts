import type { ChunkStatus } from "@renderer/state";
import {
  CHUNK_SIZE,
  type ChunkCoord,
  type ChunkTerrain,
  chunkKey,
  chunkOf,
  chunkTerrain,
  groundAt,
} from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import type { FloorSpec, PatchSpec, PropSpec, SceneGraph, Tile } from "@shared/world";
import { isWallTile, propCollider } from "../engine/colliders";

const BLOCKED_GROUND: ReadonlySet<Tile> = new Set(["water", "lava", "void"]);

function patchTileAt(patches: readonly PatchSpec[], x: number, z: number): Tile | null {
  let tile: Tile | null = null;
  for (const patch of patches) {
    const width = Math.max(1, Math.round(patch.width));
    const depth = Math.max(1, Math.round(patch.depth));
    if (x < Math.floor(patch.x) || z < Math.floor(patch.z)) continue;
    if (x >= Math.floor(patch.x) + width || z >= Math.floor(patch.z) + depth) continue;
    tile = patch.tile;
  }
  return tile;
}

/**
 * Ground at an integer world tile, preserving the authored origin inside its floor rectangle. On a
 * continent (`land`), a tile on another world's territory is that world's own ground, read at its
 * own coordinates — seeds are never mixed inside one chunk.
 */
export function landTileAt(
  scene: SceneGraph,
  seed: number,
  x: number,
  z: number,
  land: TerritoryMap | null = null,
): Tile {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const foreign = land?.at(chunkOf(tx, tz)) ?? null;
  if (foreign !== null) {
    return landTileAt(foreign.origin, foreign.seed, tx + foreign.dx, tz + foreign.dz);
  }
  const insideOrigin =
    tx >= 0 && tz >= 0 && tx < Math.floor(scene.floor.width) && tz < Math.floor(scene.floor.depth);
  if (insideOrigin) return patchTileAt(scene.patches, tx, tz) ?? scene.floor.tile;
  return groundAt(seed, tx, tz, scene.floor.tile);
}

/** Conservative 2D navigation: deep hazards and authored walls are not walkable. */
export function walkableAt(
  scene: SceneGraph,
  seed: number,
  x: number,
  z: number,
  land: TerritoryMap | null = null,
): boolean {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if ((land?.at(chunkOf(tx, tz)) ?? null) === null && isWallTile(scene.walls, tx, tz)) return false;
  return !BLOCKED_GROUND.has(landTileAt(scene, seed, tx, tz, land));
}

const TERRAIN_CACHE_LIMIT = 256;
const terrainCache = new Map<string, ChunkTerrain>();

/**
 * `chunkTerrain` is pure but walks 32×32 noise samples, so the renderer and the collision test
 * (both called every frame) share one memo instead of regenerating the same chunk 60 times a second.
 */
export function cachedTerrain(
  seed: number,
  floor: FloorSpec,
  coord: ChunkCoord,
  land: TerritoryMap | null = null,
): ChunkTerrain {
  const foreign = land?.at(coord) ?? null;
  if (foreign !== null) {
    // Props come back in chunk-local tiles, so the caller places them at its own coordinate.
    return cachedTerrain(foreign.seed, foreign.origin.floor, {
      cx: coord.cx + foreign.dx / CHUNK_SIZE,
      cz: coord.cz + foreign.dz / CHUNK_SIZE,
    });
  }
  const key = `${seed}:${floor.tile}:${floor.width}x${floor.depth}:${coord.cx},${coord.cz}`;
  const hit = terrainCache.get(key);
  if (hit !== undefined) return hit;
  const terrain = chunkTerrain({ seed, coord, origin: { floor } });
  if (terrainCache.size >= TERRAIN_CACHE_LIMIT) {
    const oldest = terrainCache.keys().next().value;
    if (oldest !== undefined) terrainCache.delete(oldest);
  }
  terrainCache.set(key, terrain);
  return terrain;
}

/**
 * True when a circle of radius `pad` at world point (x, z) overlaps the collider of any prop
 * placed at offset (ox, oz); `pad` 0 tests the point itself.
 */
export function blockedByProps(
  props: readonly PropSpec[],
  ox: number,
  oz: number,
  x: number,
  z: number,
  pad = 0,
): boolean {
  for (const prop of props) {
    const collider = propCollider(prop);
    if (collider === null) continue;
    const dx = x - (ox + collider.center[0]);
    const dz = z - (oz + collider.center[2]);
    const reach = collider.radius + pad;
    if (dx * dx + dz * dz < reach * reach) return true;
  }
  return false;
}

/** The walker's half-size on the land, in tiles. */
export const PLAYER_RADIUS = 0.22;
/** Farther than the largest prop collider (a giant tree) plus the walker reaches. */
const PROP_REACH = 1.6;

/**
 * Whether the walker can stand at world point (x, z). Ground and walls are tiles, so they are
 * tested with the walker's square footprint; props are round, so they are tested circle against
 * circle. (Testing a round trunk with the square's corners made a notch: pressed against a trunk
 * at its centre line, a step either way along it brought one corner closer, and the walker could
 * only back off.) Props are looked up in every chunk the walker's reach touches.
 */
export function canStandAt(
  origin: SceneGraph,
  seed: number,
  chunks: Readonly<Record<string, ChunkStatus>>,
  x: number,
  z: number,
  land: TerritoryMap | null = null,
): boolean {
  const r = PLAYER_RADIUS;
  for (const [px, pz] of [
    [x - r, z - r],
    [x + r, z - r],
    [x - r, z + r],
    [x + r, z + r],
  ] as const) {
    if (!walkableAt(origin, seed, px, pz, land)) return false;
    const coord = chunkOf(px, pz);
    const written = chunks[chunkKey(coord)];
    if (written?.status !== "written") continue;
    const tx = Math.floor(px) - coord.cx * CHUNK_SIZE;
    const tz = Math.floor(pz) - coord.cz * CHUNK_SIZE;
    if (isWallTile(written.scene.walls, tx, tz)) return false;
  }
  if (blockedByProps(origin.props, 0, 0, x, z, r)) return false;
  const near = new Map<string, ChunkCoord>();
  for (const [px, pz] of [
    [x - PROP_REACH, z - PROP_REACH],
    [x + PROP_REACH, z - PROP_REACH],
    [x - PROP_REACH, z + PROP_REACH],
    [x + PROP_REACH, z + PROP_REACH],
  ] as const) {
    const coord = chunkOf(px, pz);
    near.set(chunkKey(coord), coord);
  }
  for (const [key, coord] of near) {
    const ox = coord.cx * CHUNK_SIZE;
    const oz = coord.cz * CHUNK_SIZE;
    const terrain = cachedTerrain(seed, origin.floor, coord, land);
    if (blockedByProps(terrain.props, ox, oz, x, z, r)) return false;
    const written = chunks[key];
    if (written?.status === "written" && blockedByProps(written.scene.props, ox, oz, x, z, r)) {
      return false;
    }
  }
  return true;
}
