/** Canvas-only colours that do not come from a sprite atlas. */
export const LAND_2D_PALETTE = {
  background: "#101712",
  fallbackBody: "#75624c",
  /** Props the atlases have no sprite for (engine2d/propShapes.ts). */
  propShadow: "rgba(8, 10, 8, 0.28)",
  propStone: "#9a9486",
  propStoneLight: "#c8c1b0",
  propStoneDark: "#5f5a50",
  propWood: "#7a5536",
  propWoodDark: "#553a24",
  propWater: "#24384a",
  propFlame: "#f29a3a",
  propFlameCore: "#ffe39a",
  markerSurface: "#172018",
  treasure: "#d8a849",
  exit: "#8fe6ff",
  monster: "#d85f68",
  note: "#efe6cf",
  door: "#b3804e",
  episodeOpen: "#f2c14e",
  episodeLocked: "#7d7a70",
  episodeCleared: "#8cc08f",
  compassSurface: "rgba(12, 14, 12, 0.78)",
  vignetteClear: "rgba(9, 13, 10, 0)",
  vignetteEdge: "rgba(9, 13, 10, 0.42)",
  /** Entrances of places: a course (side-scroller) and a dungeon. */
  placeSide: "#7fd1ff",
  placeDungeon: "#c49bff",
  /** An otherworld's entrance (異界): its crest, and the rift swirling on the ground under it. */
  placeOtherworld: "#ff7ad9",
  otherworldGlow: "rgba(255, 122, 217, 0.22)",
  /** A shot's streak: warm when it connects, pale when it flies wide. */
  shotHit: "#ffd27a",
  shotMiss: "#d9e4ea",
  /** Where a click sent the walker. */
  goal: "#f4ecd8",
  /** A world's offset marker on a continent, and the names over other players' heads. */
  continent: "#9fd8c8",
  remote: "#ffe29a",
} as const;
