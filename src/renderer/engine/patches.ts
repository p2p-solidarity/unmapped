// Patches: rectangular tile overrides painted onto the floor (paths, ponds, lava pools). Pure
// maths — <Ground> turns the tile list into one InstancedMesh per tile kind and drops the base
// floor instances underneath, so a pond is a recessed surface rather than z-fighting decals.

import type { FloorSpec, PatchSpec, Tile } from "@shared/world";
import { TILE_THICKNESS, TILE_TOP } from "./colliders";

/** How far a patch surface sits below the floor top. */
export const PATCH_DROP = 0.05;

export interface PatchTile {
  x: number;
  z: number;
  tile: Tile;
}

/** Oscillation applied to a tile kind's shared material — liquids only. */
export interface PatchPulse {
  /** Emissive intensity at rest. */
  base: number;
  /** Peak deviation from `base`. */
  amplitude: number;
  /** Radians per second. */
  speed: number;
}

export const PATCH_PULSE: Partial<Record<Tile, PatchPulse>> = {
  water: { base: 0.22, amplitude: 0.16, speed: 0.9 },
  lava: { base: 0.85, amplitude: 0.45, speed: 1.6 },
};

export function isLiquidTile(tile: Tile): boolean {
  return PATCH_PULSE[tile] !== undefined;
}

/** Instance key for a tile; also the identity used when a later patch overpaints an earlier one. */
export function patchKey(x: number, z: number): string {
  return `${x},${z}`;
}

/** Centre height of a patch instance box, so its top face lands PATCH_DROP below the floor top. */
export function patchCenterY(): number {
  return TILE_TOP - PATCH_DROP - TILE_THICKNESS / 2;
}

/**
 * Every tile a patch list covers, clipped to the floor rectangle and de-duplicated so the last
 * patch in the program wins (the model paints in order). Row-major, so the order is stable.
 */
export function patchTiles(floor: FloorSpec, patches: readonly PatchSpec[]): PatchTile[] {
  const width = Math.max(0, Math.floor(floor.width));
  const depth = Math.max(0, Math.floor(floor.depth));
  const byKey = new Map<string, Tile>();
  for (const patch of patches) {
    const x0 = Math.floor(patch.x);
    const z0 = Math.floor(patch.z);
    const w = Math.max(1, Math.round(patch.width));
    const d = Math.max(1, Math.round(patch.depth));
    for (let z = z0; z < z0 + d; z += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        if (x < 0 || z < 0 || x >= width || z >= depth) continue;
        byKey.set(patchKey(x, z), patch.tile);
      }
    }
  }
  const tiles: PatchTile[] = [];
  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const tile = byKey.get(patchKey(x, z));
      if (tile !== undefined) tiles.push({ x, z, tile });
    }
  }
  return tiles;
}

/** One instanced mesh per tile kind; insertion order follows first appearance, so keys are stable. */
export function groupPatchTiles(tiles: readonly PatchTile[]): Map<Tile, PatchTile[]> {
  const groups = new Map<Tile, PatchTile[]>();
  for (const tile of tiles) {
    const bucket = groups.get(tile.tile);
    if (bucket === undefined) groups.set(tile.tile, [tile]);
    else bucket.push(tile);
  }
  return groups;
}

/** The tiles the base floor mesh must skip because a patch already covers them. */
export function coveredKeys(tiles: readonly PatchTile[]): Set<string> {
  const keys = new Set<string>();
  for (const tile of tiles) keys.add(patchKey(tile.x, tile.z));
  return keys;
}

/** Emissive intensity of a liquid tile at time `t`, or null for a matte tile kind. */
export function pulseIntensity(tile: Tile, t: number): number | null {
  const pulse = PATCH_PULSE[tile];
  if (pulse === undefined) return null;
  return pulse.base + Math.sin(t * pulse.speed) * pulse.amplitude;
}
