// The land's day (both looks): what the light is like at each hour, tinted by the mood of the lore
// around the player, and the lamps that come on at dusk. `engine2d/dayClock.ts` blends between
// these keys; nothing else here moves.

/** One moment of the day. The HD-2D look reads the lights; the 16-bit look multiplies by `wash`. */
export interface DayKey {
  /** Hour of the day, 0–24. */
  hour: number;
  /** Key light (the sun by day, the moon by night), its strength in the HD-2D renderer. */
  sun: string;
  sunIntensity: number;
  /** Hemisphere fill: the sky half, the bounced ground half and their strength. */
  sky: string;
  ground: string;
  fill: number;
  /** Distance haze: clear colour and fog. */
  haze: string;
  /** Colour of distant landmarks against that haze. */
  far: string;
  /** Multiplied over the whole 16-bit frame (white = untouched). */
  wash: string;
  /** Moving highlight on water. */
  glint: string;
  /** 0 by day … 1 at night: how strongly lamps and windows shine. */
  night: number;
}

/** In order of the hour; the day wraps from the last key back to the first. */
export const DAY_KEYS: readonly DayKey[] = [
  {
    hour: 0,
    sun: "#8fa6d8",
    sunIntensity: 0.6,
    sky: "#24304f",
    ground: "#101119",
    fill: 0.6,
    haze: "#151c2e",
    far: "#060912",
    wash: "#48527f",
    glint: "#c8d8ff",
    night: 1,
  },
  {
    hour: 4.5,
    sun: "#8fa6d8",
    sunIntensity: 0.55,
    sky: "#28355a",
    ground: "#131522",
    fill: 0.6,
    haze: "#1f2940",
    far: "#0a0e1c",
    wash: "#4c5585",
    glint: "#c8d8ff",
    night: 1,
  },
  {
    hour: 6,
    sun: "#ff9a6b",
    sunIntensity: 1.3,
    sky: "#b48fb0",
    ground: "#3b2c2a",
    fill: 0.65,
    haze: "#c9a29b",
    far: "#6f5a6e",
    wash: "#e2b3a4",
    glint: "#ffd2b0",
    night: 0.55,
  },
  {
    hour: 7.5,
    sun: "#ffd9b0",
    sunIntensity: 2.7,
    sky: "#a9c6e8",
    ground: "#5a4a34",
    fill: 0.8,
    haze: "#c4cfc6",
    far: "#7c8c92",
    wash: "#fff6ea",
    glint: "#fff4dc",
    night: 0,
  },
  {
    hour: 12,
    sun: "#fff4dc",
    sunIntensity: 3.6,
    sky: "#b4d0f0",
    ground: "#5f5238",
    fill: 0.95,
    haze: "#c3cdc2",
    far: "#7f8e96",
    wash: "#ffffff",
    glint: "#fffaf0",
    night: 0,
  },
  {
    // The look the land had before it had a clock: warm late-afternoon air, a low south-west sun.
    hour: 15.5,
    sun: "#ffe2b0",
    sunIntensity: 3.3,
    sky: "#a9c3e6",
    ground: "#5b4a2f",
    fill: 0.85,
    haze: "#b9c3b6",
    far: "#78868a",
    wash: "#fff4e2",
    glint: "#fff1cc",
    night: 0,
  },
  {
    hour: 18,
    sun: "#ff8a4c",
    sunIntensity: 1.9,
    sky: "#9c7fa6",
    ground: "#3a2a26",
    fill: 0.68,
    haze: "#cf957c",
    far: "#5e4260",
    wash: "#f2ab7e",
    glint: "#ffc08a",
    night: 0.35,
  },
  {
    hour: 19.5,
    sun: "#7b73b4",
    sunIntensity: 0.55,
    sky: "#3a3a6a",
    ground: "#17141f",
    fill: 0.58,
    haze: "#3a3456",
    far: "#140f24",
    wash: "#6e679a",
    glint: "#b8b4ff",
    night: 0.9,
  },
  {
    hour: 21,
    sun: "#8fa6d8",
    sunIntensity: 0.6,
    sky: "#24304f",
    ground: "#101119",
    fill: 0.6,
    haze: "#151c2e",
    far: "#060912",
    wash: "#48527f",
    glint: "#c8d8ff",
    night: 1,
  },
];

/**
 * What the lore's regional tone does to the air (`@shared/lore` regionalTone, -1 … 1): a warm,
 * golden haze where the land is festive; a cold, grey-violet one where it grieves or dreads.
 */
export const MOOD_TINT = {
  warm: "#ffc98a",
  grim: "#5e5c80",
} as const;

/** Lamps that light up at dusk, by what carries them. */
export const LAMP_COLOR = {
  window: "#ffc36b",
  vending: "#cfe8ff",
  pole: "#ffb055",
  torch: "#ff9a3c",
  stop: "#e8f2ff",
  gate: "#ffd27a",
} as const;

/** The same lamps as soft glows on the 16-bit canvas (centre and transparent edge). */
export const LAMP_GLOW_2D = {
  window: ["rgba(255, 195, 107, 0.85)", "rgba(255, 195, 107, 0)"],
  vending: ["rgba(207, 232, 255, 0.85)", "rgba(207, 232, 255, 0)"],
  pole: ["rgba(255, 176, 85, 0.8)", "rgba(255, 176, 85, 0)"],
  torch: ["rgba(255, 154, 60, 0.85)", "rgba(255, 154, 60, 0)"],
  stop: ["rgba(232, 242, 255, 0.8)", "rgba(232, 242, 255, 0)"],
  gate: ["rgba(255, 210, 122, 0.9)", "rgba(255, 210, 122, 0)"],
} as const;

/** Water: the lighter band where it meets the shore. */
export const WATER_LIGHT = {
  shore: "#dff4ef",
} as const;

/** A resident's mood, as the small sign over their head. */
export const MOOD_SIGN_COLOR = {
  calm: "#bfe3c8",
  joyful: "#ffd66b",
  wary: "#ff9a5a",
  mournful: "#8fb0e0",
  manic: "#ff6fb0",
  cryptic: "#c9a0ff",
} as const;

/** Shadow under the mood signs so they read on any ground. */
export const MOOD_SIGN_SHADOW = "rgba(10, 8, 6, 0.8)";

/** White mask that the distant silhouette material tints to the current air colour. */
export const LANDMARK_MASK = "#ffffff";
