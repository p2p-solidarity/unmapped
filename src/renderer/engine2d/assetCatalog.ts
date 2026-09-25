import type { PropKind, Tile } from "@shared/world";

export const ATLAS_DIMENSIONS = {
  floor: { width: 352, height: 417 },
  village: { width: 320, height: 192 },
  ninja: { width: 64, height: 112 },
  /** Image-model residents and monsters (actorSprites.ts): 9 × 2 cells of 64 px. */
  actors: { width: 576, height: 128 },
  generated: { width: 384, height: 384 },
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
  /** World width for sources whose pixels are not laid out on the 16 px CC0 grid. */
  widthTiles?: number;
}

function sprite(id: string, atlas: AtlasId, sx: number, sy: number, sw = 16, sh = 16): SpriteAsset {
  return { id, atlas, sx, sy, sw, sh };
}

export const GENERATED_PROP_KINDS = [
  "utility_pole",
  "vending_machine",
  "bus_stop",
  "rail_track",
  "chimney",
  "steel_tower",
  "windmill",
  "breakwater",
  "signpost",
  "machine_gear",
  "conveyor",
  "boiler",
  "pipe_stack",
  "crane",
  "reactor",
] as const satisfies readonly PropKind[];

function generated(index: number, widthTiles: number): SpriteAsset {
  return {
    id: `prop.${GENERATED_PROP_KINDS[index]}`,
    atlas: "generated",
    sx: (index % 4) * 96,
    sy: Math.floor(index / 4) * 96,
    sw: 96,
    sh: 96,
    widthTiles,
  };
}

export const GENERATED_PROP_ASSETS: Record<(typeof GENERATED_PROP_KINDS)[number], SpriteAsset> = {
  utility_pole: generated(0, 2.7),
  vending_machine: generated(1, 1.5),
  bus_stop: generated(2, 2.5),
  rail_track: generated(3, 2.3),
  chimney: generated(4, 3),
  steel_tower: generated(5, 3.6),
  windmill: generated(6, 3.4),
  breakwater: generated(7, 2.6),
  signpost: generated(8, 1.4),
  machine_gear: generated(9, 1.5),
  conveyor: generated(10, 2),
  boiler: generated(11, 1.5),
  pipe_stack: generated(12, 1.7),
  crane: generated(13, 2.8),
  reactor: generated(14, 1.7),
};

export const GROUND_ASSETS: Record<Tile, SpriteAsset> = {
  grass: sprite("ground.grass", "floor", 32, 176),
  stone: sprite("ground.stone", "floor", 224, 256),
  sand: sprite("ground.sand", "floor", 176, 80),
  snow: sprite("ground.snow", "floor", 32, 224),
  wood: sprite("ground.wood", "floor", 208, 96),
  lava: sprite("ground.lava", "floor", 208, 384),
  water: sprite("ground.water", "floor", 16, 352),
  void: sprite("ground.void", "floor", 336, 400),
};

export const PROP_ASSETS: Partial<Record<PropKind, SpriteAsset>> = {
  tree: sprite("prop.tree", "village", 0, 96, 64, 48),
  rock: sprite("prop.rock", "village", 96, 68),
  flower: sprite("prop.flower", "village", 128, 64),
  mushroom: sprite("prop.mushroom", "village", 144, 64),
  house: sprite("prop.house", "village", 176, 96, 64, 80),
  crate: sprite("prop.crate", "village", 80, 64),
  fence: sprite("prop.fence", "village", 112, 112),
  ...GENERATED_PROP_ASSETS,
};

export const ACTOR_ASSETS = {
  player: sprite("actor.player", "ninja", 0, 0),
} as const;
