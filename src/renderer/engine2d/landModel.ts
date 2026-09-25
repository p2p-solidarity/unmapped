import { type ChunkCoord, type ChunkTerrain, chunkTerrain, groundAt } from "@shared/chunks";
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

/** Ground at an integer world tile, preserving the authored origin inside its floor rectangle. */
export function landTileAt(scene: SceneGraph, seed: number, x: number, z: number): Tile {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  const insideOrigin =
    tx >= 0 && tz >= 0 && tx < Math.floor(scene.floor.width) && tz < Math.floor(scene.floor.depth);
  if (insideOrigin) return patchTileAt(scene.patches, tx, tz) ?? scene.floor.tile;
  return groundAt(seed, tx, tz, scene.floor.tile);
}

/** Conservative 2D navigation: deep hazards and authored walls are not walkable. */
export function walkableAt(scene: SceneGraph, seed: number, x: number, z: number): boolean {
  const tx = Math.floor(x);
  const tz = Math.floor(z);
  if (isWallTile(scene.walls, tx, tz)) return false;
  return !BLOCKED_GROUND.has(landTileAt(scene, seed, tx, tz));
}

const TERRAIN_CACHE_LIMIT = 256;
const terrainCache = new Map<string, ChunkTerrain>();

/**
 * `chunkTerrain` is pure but walks 32×32 noise samples, so the renderer and the collision test
 * (both called every frame) share one memo instead of regenerating the same chunk 60 times a second.
 */
export function cachedTerrain(seed: number, floor: FloorSpec, coord: ChunkCoord): ChunkTerrain {
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

/** True when world point (x, z) is inside the collider of any prop placed at offset (ox, oz). */
export function blockedByProps(
  props: readonly PropSpec[],
  ox: number,
  oz: number,
  x: number,
  z: number,
): boolean {
  for (const prop of props) {
    const collider = propCollider(prop);
    if (collider === null) continue;
    const dx = x - (ox + collider.center[0]);
    const dz = z - (oz + collider.center[2]);
    if (dx * dx + dz * dz < collider.radius * collider.radius) return true;
  }
  return false;
}
