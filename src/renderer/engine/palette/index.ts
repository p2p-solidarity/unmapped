// The ONLY engine directory allowed hex colour literals (repo Rule 3). Everything the 3D layer
// draws resolves its colours through these tables so a biome swap is a data change, not a code
// change. Split by what is coloured: biomes/tiles/entities here, prop meshes in props.ts,
// monster silhouettes in monsters.ts.
//
// Style target: HD-2D — low-poly silhouettes, warm lantern accents, deep fog, cool ambient.

import type { Biome, Tile } from "@shared/world";

export {
  DAY_KEYS,
  type DayKey,
  LAMP_COLOR,
  LAMP_GLOW_2D,
  LANDMARK_MASK,
  MOOD_SIGN_COLOR,
  MOOD_SIGN_SHADOW,
  MOOD_TINT,
  WATER_LIGHT,
} from "./daylight";
export { HD2D_GRADE, HD2D_PALETTE, HD2D_SEASON } from "./hd2d";
export { LAND_2D_PALETTE, LAND_2D_SEASON } from "./land2d";
export { MONSTER_LOOK, type MonsterLook, type MonsterShape } from "./monsters";
export {
  type GeoKey,
  PROP_SHAPE,
  type PropPart,
  type PropShape,
} from "./props";

export interface BiomePalette {
  /** Base colour of the floor instanced mesh. */
  ground: string;
  /** Base colour of the wall instanced mesh. */
  wall: string;
  /** Lantern/emissive accent used by exits, rings and fallback lights. */
  accent: string;
  /** Ambient light colour when the scene declares no ambient light. */
  ambient: string;
  /** Fog colour when `scene.sky` is null. */
  fog: string;
  /** Background colour when `scene.sky` is null. */
  sky: string;
}

export const BIOME_PALETTE: Record<Biome, BiomePalette> = {
  meadow: {
    ground: "#4e7a43",
    wall: "#6b5b43",
    accent: "#ffd27a",
    ambient: "#8fb2d8",
    fog: "#2a3b34",
    sky: "#16242e",
  },
  onsen_town: {
    ground: "#3a3550",
    wall: "#5a4436",
    accent: "#ff9d5c",
    ambient: "#7b6ea8",
    fog: "#221a2c",
    sky: "#171226",
  },
  ruined_castle: {
    ground: "#4a4a52",
    wall: "#6a6470",
    accent: "#c9a86a",
    ambient: "#6e7590",
    fog: "#1d1d26",
    sky: "#12131c",
  },
  cyber_workshop: {
    ground: "#26303f",
    wall: "#33415a",
    accent: "#59f2d6",
    ambient: "#5d7ba8",
    fog: "#101722",
    sky: "#0a1018",
  },
  abyss: {
    ground: "#1b1630",
    wall: "#2a2148",
    accent: "#a06bff",
    ambient: "#4b3a7a",
    fog: "#08060f",
    sky: "#05040a",
  },
  sky_isle: {
    ground: "#6f8fb5",
    wall: "#cfd8e8",
    accent: "#ffe7a8",
    ambient: "#bcd6f2",
    fog: "#9fbcdd",
    sky: "#7fa9d8",
  },
  snowfield: {
    ground: "#cfd9e6",
    wall: "#9fb0c6",
    accent: "#ffd9a0",
    ambient: "#a8c2e0",
    fog: "#b6c6d8",
    sky: "#8fa8c4",
  },
  lava_forge: {
    ground: "#3a2320",
    wall: "#55302a",
    accent: "#ff7a3c",
    ambient: "#a05030",
    fog: "#1a0d0a",
    sky: "#200d08",
  },
  // Late-afternoon Shōwa countryside: dry grass, weathered wood, a pale warm sky.
  countryside: {
    ground: "#8c9a6a",
    wall: "#8a7358",
    accent: "#e39a4a",
    ambient: "#c9c2b0",
    fog: "#d9d4c4",
    sky: "#b9cbd6",
  },
};

/**
 * Per-tile hue. Applied as an instance colour *modulation* (normalised to its brightest channel)
 * on top of the biome ground/wall colour, so the biome sets value and the tile sets hue.
 */
export const TILE_TINT: Record<Tile, string> = {
  grass: "#6fae5a",
  stone: "#9a9aa4",
  sand: "#d9c48a",
  snow: "#eaf2fb",
  wood: "#a97b4f",
  lava: "#ff6a2a",
  water: "#4aa6d8",
  void: "#2a2440",
};

// ── Entities that are not enum-keyed ─────────────────────────────────────────────────────────

export const ENTITY_PALETTE = {
  /** Distant landmarks drawn past the fog: a flat shape against the sky. */
  farSilhouette: "#46505c",
  /** Home: the door's weathered frame and panel, reused for keepsake pedestals. */
  doorFrame: "#6b5440",
  doorPanel: "#b3804e",
  /** A note left on the land. */
  notePaper: "#efe6cf",
  playerBody: "#f2efe6",
  playerHead: "#f0d9bd",
  npcHead: "#f0d9bd",
  treasureBody: "#c89a4a",
  treasureLid: "#8a5f2a",
  treasureOpened: "#4f4438",
  treasureGlow: "#ffd98a",
  exitRing: "#8fe6ff",
  exitCore: "#e8fbff",
  triggerDebug: "#ff5c7a",
  /** Warm beam of the FPS kit's flashlight. */
  flashlight: "#fff3d6",
  /** Glowing lip along the top of a baked platform. */
  platformEdge: "#00f0ff",
  /** Bounce pads: the launch colour, on the lip and on the crystal. */
  platformBounce: "#ff3366",
  /** Energy strut under a floating platform. */
  platformStrut: "#0b1224",
  /** Edge of the draft the platform editor currently has selected. */
} as const;

/**
 * Colours a humanoid part can ask for that do NOT come from the NpcSpec. `body` resolves to
 * `npc.color` and `accent`/`glow` to `npc.accent`, so the model still owns every villager's
 * identity while the shared materials stay cached per colour.
 */
export const HUMANOID_PALETTE = {
  skin: "#f0d9bd",
  dark: "#1f1b26",
  metal: "#9aa3b2",
  wood: "#7a5a3a",
  cloth: "#e6dcc2",
} as const;

/** Look of a `team_party@1` squad member: plain kit, no hat, sidearm in hand. */
export const PARTY_LOOK = {
  body: "slim",
  hat: "none",
  held: "none",
  color: "#4a5a72",
  accent: "#7fd4ff",
} as const;

export const CHARACTER_THEME_COLORS = {
  cyan: {
    primary: "#0b162c",
    armor: "#16284e",
    accent: "#00f0ff",
    skin: "#f2d4b8",
    hair: "#161b2e",
    weapon: "#c8f6ff",
    weaponGlow: "#00f0ff",
  },
  gold: {
    primary: "#241a0e",
    armor: "#382914",
    accent: "#ffb648",
    skin: "#f2d4b8",
    hair: "#e2c275",
    weapon: "#fff0cd",
    weaponGlow: "#ffb648",
  },
  crimson: {
    primary: "#260e15",
    armor: "#3d1421",
    accent: "#ff3366",
    skin: "#f2d4b8",
    hair: "#2b1018",
    weapon: "#ffccd7",
    weaponGlow: "#ff3366",
  },
  purple: {
    primary: "#180f26",
    armor: "#281742",
    accent: "#a855f7",
    skin: "#f2d4b8",
    hair: "#caa8f5",
    weapon: "#ebd5ff",
    weaponGlow: "#a855f7",
  },
  emerald: {
    primary: "#0c2016",
    armor: "#143323",
    accent: "#10b981",
    skin: "#f2d4b8",
    hair: "#1d3d2c",
    weapon: "#c6f7e2",
    weaponGlow: "#10b981",
  },
} as const;
