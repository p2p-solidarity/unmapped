// Home is safe (rev 6: combat is optional, and there is always a safe home). In a world with combat
// no foe stands in the home chunk — the origin chunk the authored scene stands in — none follows the
// player into it, and no blow lands on anyone standing there. One pure rule in world tiles, so the
// land and a future world service decide it the same way.
//
// This is where the fight may happen, not what the land is: the ground, the wildlife and the fight
// formulas (`wildMonsters` already keeps home empty) are untouched, so it is outside the physics
// fingerprint (@shared/physics) and no world's land moves because of it. On a continent every
// coordinate is in this world's own frame, so home is this world's origin chunk; other worlds'
// homes stand CONTINENT_SPACING chunks away, beyond any of this world's foes.

import { type ChunkCoord, chunkOf } from "./chunks";

/** Whether `coord` is home: the origin chunk. */
export function safeChunk(coord: ChunkCoord): boolean {
  return coord.cx === 0 && coord.cz === 0;
}

/** Whether world position (x, z), in tiles, stands at home, where no foe may be. */
export function isSafeGround(x: number, z: number): boolean {
  return safeChunk(chunkOf(x, z));
}
