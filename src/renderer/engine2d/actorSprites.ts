// Residents and monsters of the land, drawn once by the image model (`scripts/gen-sprites.ts`) and
// packed into one sheet: row 0 holds one cell per NPC role, row 1 one per monster kind, both in
// the order of their lists in @shared/world. Each figure stands on the bottom edge of its cell.

import { MONSTER_KINDS, type MonsterKind, NPC_ROLES, type NpcRole } from "@shared/world";
import type { SpriteAsset } from "./assetCatalog";

export const ACTOR_CELL = 64;
export const ACTOR_COLUMNS = Math.max(NPC_ROLES.length, MONSTER_KINDS.length);

function cell(id: string, column: number, row: number): SpriteAsset {
  return {
    id,
    atlas: "actors",
    sx: column * ACTOR_CELL,
    sy: row * ACTOR_CELL,
    sw: ACTOR_CELL,
    sh: ACTOR_CELL,
  };
}

export const ROLE_SPRITES = Object.fromEntries(
  NPC_ROLES.map((role, column) => [role, cell(`npc.${role}`, column, 0)]),
) as Record<NpcRole, SpriteAsset>;

export const MONSTER_SPRITES = Object.fromEntries(
  MONSTER_KINDS.map((kind, column) => [kind, cell(`monster.${kind}`, column, 1)]),
) as Record<MonsterKind, SpriteAsset>;

/**
 * How many tiles wide a cell stands (the figure inside keeps its own proportions): people a little
 * taller than a tile, a child smaller, golems and serpents big enough to read as a threat.
 */
export const ROLE_WIDTH: Record<NpcRole, number> = {
  merchant: 1.5,
  monk: 1.45,
  smith: 1.55,
  farmer: 1.45,
  guard: 1.55,
  child: 1.1,
  elder: 1.4,
  bard: 1.45,
  stranger: 1.5,
};

export const MONSTER_WIDTH: Record<MonsterKind, number> = {
  slime: 1.1,
  skeleton: 1.5,
  drone: 1.2,
  golem: 2.1,
  wisp: 1.1,
  serpent: 1.9,
  fox_spirit: 1.6,
  shade: 1.6,
};
