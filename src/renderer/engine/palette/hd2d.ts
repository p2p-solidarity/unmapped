// HD-2D open land: pixel sprites standing in a lit diorama. Every colour the WebGL land view uses
// (light, haze, water, banks, markers, grading) lives here so the look is tuned in one table.

export const HD2D_PALETTE = {
  /** Clear colour and distance haze: warm late-afternoon air. */
  haze: "#b9c3b6",
  /** Key light: low sun from the south-west, warm. */
  sun: "#ffe2b0",
  /** Sky half of the hemisphere fill; ground half is bounced grass. */
  skyFill: "#a9c3e6",
  groundFill: "#5b4a2f",
  /** Water surface, its deep tint and the basin walls cut around it. */
  water: "#4f9fc4",
  waterDeep: "#1f4f6e",
  lava: "#ff7a2e",
  voidFloor: "#07080b",
  bankTop: "#8a6a44",
  bankBottom: "#3b2a1b",
  /** Rock faces under a plateau of rocky ground. */
  cliffTop: "#a08f78",
  cliffBottom: "#4d4033",
  /** Multiplies the painted floor: a faint warm paper tone over the sheet's greens. */
  groundTint: "#f4f1e2",
  /** Wall blocks when a witnessed place builds walls. */
  wallTint: "#d8c9ad",
  /** Props the CC0 sheets have no sprite for stand in as a small carved block. */
  fallbackBlock: "#8d7a5f",
  /** Floating motes that catch the light near the player. */
  mote: "#fff1c4",
  moteFade: "rgba(255, 241, 196, 0)",
  /** Ground tile tint jitter: dark and light ends of a per-tile wash. */
  tileShade: "rgba(34, 52, 18, 0.34)",
  tileLight: "rgba(255, 236, 170, 0.16)",
  /** A shot's streak of light: warm on a hit, pale when it flies wide; foe health bars. */
  shotHit: "#ffe08a",
  shotMiss: "#cfe3ff",
  foeHealth: "#e0605a",
  foeHealthBack: "rgba(20, 12, 8, 0.75)",
  /** Beam over an open story gate. */
  gateBeam: "#ffd27a",
  /** The rift ring turning on the ground under an otherworld's entrance (異界). */
  otherworldRift: "#ff7ad9",
  /** Label text, its shadow and the compass surface drawn over the scene. */
  label: "#fff6e2",
  labelShadow: "rgba(20, 12, 4, 0.85)",
  compassSurface: "rgba(22, 16, 8, 0.72)",
  compassEdge: "#d4a85a",
  /** Where a click sent the walker. */
  goal: "#fff6e2",
} as const;

/** Colour grade applied after tone mapping (linear 0–1 multipliers). */
export const HD2D_GRADE = {
  shadowTint: [0.93, 0.97, 1.06],
  highlightTint: [1.06, 1.0, 0.9],
  saturation: 1.12,
  vignette: 0.38,
} as const;
