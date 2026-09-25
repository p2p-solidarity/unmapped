import type { PropKind, Tile } from "@shared/world";

export const ATLAS_DIMENSIONS = {
  floor: { width: 352, height: 417 },
  village: { width: 320, height: 192 },
  ninja: { width: 64, height: 112 },
  samuraiBlue: { width: 64, height: 112 },
  samuraiGreen: { width: 64, height: 112 },
} as const;

export type AtlasId = keyof typeof ATLAS_DIMENSIONS;

/**
 * A semantic asset is the stable contract used by the renderer. The atlas coordinates remain an
 * implementation detail, so generated scenes never need to know how the CC0 sprite sheets are laid
 * out.
 */
export interface SpriteAsset {
  id: string;
  atlas: AtlasId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function sprite(id: string, atlas: AtlasId, sx: number, sy: number, sw = 16, sh = 16): SpriteAsset {
  return { id, atlas, sx, sy, sw, sh };
}

export const GROUND_ASSETS: Record<Tile, SpriteAsset> = {
  grass: sprite("ground.grass", "floor", 32, 176),
  stone: sprite("ground.stone", "floor", 224, 256),
  sand: sprite("ground.sand", "floor", 32, 16),
  snow: sprite("ground.snow", "floor", 32, 224),
  wood: sprite("ground.wood", "floor", 208, 96),
  lava: sprite("ground.lava", "floor", 208, 384),
  water: sprite("ground.water", "floor", 32, 352),
  void: sprite("ground.void", "floor", 336, 400),
};

export const PROP_ASSETS: Partial<Record<PropKind, SpriteAsset>> = {
  tree: sprite("prop.tree", "village", 16, 96, 32, 48),
  rock: sprite("prop.rock", "village", 96, 68),
  flower: sprite("prop.flower", "village", 128, 64),
  mushroom: sprite("prop.mushroom", "village", 144, 64),
  house: sprite("prop.house", "village", 176, 96, 64, 80),
  crate: sprite("prop.crate", "village", 80, 64),
  fence: sprite("prop.fence", "village", 112, 112),
  signpost: sprite("prop.signpost", "village", 144, 112),
};

export const ACTOR_ASSETS = {
  player: sprite("actor.player", "ninja", 0, 0),
  resident: [
    sprite("actor.resident.blue", "samuraiBlue", 0, 0),
    sprite("actor.resident.green", "samuraiGreen", 0, 0),
  ],
} as const;
