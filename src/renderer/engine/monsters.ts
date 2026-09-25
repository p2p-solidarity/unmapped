// Monster sizing and tinting. `size` scales the whole silhouette (and with it the reach at which
// the player can interact), `color` overrides the kind's body colour, and a high enough level
// earns a faint aura ring. Pure maths — <Monster> only reads the result.

import type { MonsterSpec } from "@shared/world";
import { MONSTER_LOOK, type MonsterLook } from "./palette";

/** Matches the DSL's Monster(size) clamp; a hallucinated 9000 must not eat the floor. */
export const MIN_MONSTER_SIZE = 0.5;
export const MAX_MONSTER_SIZE = 3;
/** From this level a monster carries a faint emissive aura. */
export const AURA_LEVEL = 30;

export function clampMonsterSize(size: number): number {
  if (!Number.isFinite(size) || size <= 0) return 1;
  return Math.min(MAX_MONSTER_SIZE, Math.max(MIN_MONSTER_SIZE, size));
}

/** Silhouette radius after scaling, in tiles. */
export function monsterRadius(monster: MonsterSpec): number {
  return MONSTER_LOOK[monster.kind].radius * clampMonsterSize(monster.size);
}

/**
 * Extra interaction reach a monster grows by. Zero at the default size, so the prompt distance of
 * an ordinary monster is exactly NEAR_RADIUS and a giant can be talked to from its own edge.
 */
export function monsterReach(monster: MonsterSpec): number {
  const look = MONSTER_LOOK[monster.kind];
  return Math.max(0, (clampMonsterSize(monster.size) - 1) * look.radius);
}

/** Height of the name label above the tile, following the scaled silhouette. */
export function monsterLabelY(monster: MonsterSpec): number {
  return MONSTER_LOOK[monster.kind].height * clampMonsterSize(monster.size) + 0.45;
}

export function hasAura(level: number): boolean {
  return level >= AURA_LEVEL;
}

/** The kind's look with the model's colour override applied to the body only. */
export function monsterLook(monster: MonsterSpec): MonsterLook {
  const look = MONSTER_LOOK[monster.kind];
  if (monster.color === null) return look;
  return { ...look, color: monster.color };
}
