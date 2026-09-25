// Which pixels of the CC0 Ninja Adventure sheets stand in the HD-2D land, measured against the
// sheets themselves (16 px = one tile). Sprites stand upright on their feet; ground tiles have a
// plain face plus a few worn variants so a meadow does not repeat one stamp for a whole chunk.

import type { PropKind, Tile } from "@shared/world";
import { type AtlasId, GENERATED_PROP_ASSETS, type SpriteAsset } from "../engine2d/assetCatalog";

export interface SheetRect {
  atlas: AtlasId;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** An upright sprite: its rect, and how many tiles wide it stands at scale 1. */
export interface Billboard extends SheetRect {
  id: string;
  widthTiles: number;
}

function board(
  id: string,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  widthTiles = sw / 16,
): Billboard {
  return { id, atlas: "village", sx, sy, sw, sh, widthTiles };
}

/**
 * Upright sprites per prop kind; several entries are variants picked by position so a grove is
 * not one tree repeated. Kinds without an entry (machines, reactors, …) stand as a carved block.
 */
export const PROP_BOARDS: Partial<Record<PropKind, readonly Billboard[]>> = {
  tree: [board("tree.broad", 0, 96, 64, 48, 3.2), board("tree.round", 64, 96, 32, 32, 2)],
  rock: [board("rock.boulder", 112, 81, 32, 31, 1.5), board("rock.stone", 48, 80, 16, 16, 0.8)],
  flower: [board("flower.bush", 64, 80, 16, 16, 0.8), board("flower.tuft", 80, 80, 16, 16, 0.8)],
  mushroom: [board("mushroom.cap", 208, 176, 16, 16, 0.8)],
  statue: [board("statue.idol", 0, 48, 32, 48, 1.6), board("statue.frog", 144, 84, 32, 28, 1.6)],
  pillar: [board("pillar.stone", 32, 48, 16, 48, 0.9)],
  crate: [board("crate.box", 144, 176, 16, 16, 0.9)],
  well: [board("well.pot", 80, 58, 16, 22, 1)],
  torch: [board("torch.lantern", 240, 176, 16, 16, 0.7)],
  fence: [board("fence.logs", 144, 144, 32, 32, 1.6)],
  altar: [board("altar.stones", 48, 52, 16, 28, 1)],
  house: [
    board("house.cottage", 176, 0, 48, 48, 3),
    board("house.aframe", 192, 96, 64, 80, 4),
    board("house.hut", 256, 80, 64, 80, 4),
  ],
};

/** Ground: a plain face (most tiles) and worn variants (a few), all 16×16 on the floor sheet. */
export interface GroundLook {
  plain: SheetRect;
  worn: readonly SheetRect[];
}

function floorTile(sx: number, sy: number): SheetRect {
  return { atlas: "floor", sx, sy, sw: 16, sh: 16 };
}

export const GROUND_LOOK: Record<Tile, GroundLook> = {
  grass: {
    plain: floorTile(176, 192),
    worn: [floorTile(192, 192), floorTile(208, 192), floorTile(224, 192), floorTile(240, 192)],
  },
  stone: {
    plain: floorTile(176, 304),
    worn: [floorTile(192, 304), floorTile(208, 304), floorTile(224, 304)],
  },
  sand: {
    plain: floorTile(176, 80),
    worn: [floorTile(192, 80), floorTile(208, 80), floorTile(224, 80)],
  },
  snow: {
    plain: floorTile(0, 304),
    worn: [floorTile(16, 304), floorTile(32, 304), floorTile(48, 304)],
  },
  wood: { plain: floorTile(96, 176), worn: [] },
  water: { plain: floorTile(16, 352), worn: [floorTile(96, 368)] },
  lava: { plain: floorTile(192, 352), worn: [floorTile(272, 368)] },
  void: { plain: floorTile(336, 400), worn: [] },
};

/** Ground the land sinks into a basin instead of drawing as a floor tile. */
export const SUNKEN: ReadonlySet<Tile> = new Set<Tile>(["water", "lava", "void"]);

/**
 * Surface height of each ground (tiles): rocky ground stands as a low plateau, liquids and the
 * void sit in basins. Only the look changes — walking rules are the 16-bit land's, unchanged.
 */
export const TILE_HEIGHT: Record<Tile, number> = {
  grass: 0,
  sand: -0.04,
  snow: 0,
  wood: 0.05,
  stone: 0.6,
  water: -0.3,
  lava: -0.24,
  void: -1.6,
};

/**
 * Character sheets are 4 columns (facing down, up, left, right) × rows of frames; the first four
 * rows are the walk cycle.
 */
export const ACTOR_COLUMN = { south: 0, north: 1, west: 2, east: 3 } as const;
export const ACTOR_FRAME = 16;
export const WALK_FRAMES = 4;

/** Small deterministic hash so a tile's variant never flickers between frames. */
export function tileHash(x: number, z: number, salt = 0): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pickBoard(kind: PropKind, x: number, z: number): Billboard | null {
  const generated = (GENERATED_PROP_ASSETS as Partial<Record<PropKind, SpriteAsset>>)[kind];
  if (generated !== undefined) {
    return { ...generated, widthTiles: generated.widthTiles ?? generated.sw / 16 };
  }
  const options = PROP_BOARDS[kind];
  if (options === undefined || options.length === 0) return null;
  return options[Math.floor(tileHash(x, z, 7) * options.length)] ?? options[0] ?? null;
}
