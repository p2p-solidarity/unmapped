/**
 * Canvas-only colours of a place drawn on engine2d (a course seen from the side, a dungeon from
 * above) that do not come from a sprite atlas or from the place's own Sky. Rule 3: hex lives here.
 */
export const PLACE_2D_PALETTE = {
  /** Beyond the floor's edges: nothing there. */
  void: "#07090b",
  /** The earth under the course's walking row, over its tile. */
  underground: "rgba(6, 8, 10, 0.55)",
  /** The far wall behind a course, one parallax band. */
  farBand: "rgba(8, 10, 14, 0.35)",
  /** The walkable lip along a ledge's top, and the post under a floating one. */
  ledgeLip: "#f3d58c",
  ledgePost: "rgba(10, 12, 16, 0.7)",
  /** A shade over wall blocks so they read as solid against the ground tiles. */
  wallShade: "rgba(10, 10, 14, 0.28)",
  /**
   * A dungeon seen from above: the floor sunk into shade, a maze wall's top face lit and its front
   * face dark, so the corridors read even when the floor is the walls' own stone.
   */
  floorShade: "rgba(6, 6, 10, 0.34)",
  wallTop: "rgba(255, 242, 214, 0.16)",
  wallFace: "#2a231d",
  wallEdge: "rgba(255, 236, 196, 0.35)",
  /** The two ways out: back to the land, and the far end that crosses the place. */
  exitBack: "#8fe6ff",
  exitGoal: "#f2c14e",
  doorSurface: "#141a16",
  /** A chest already opened (drawn faded). */
  opened: "#6b6258",
  /** The dungeon's dark beyond the walker's light, and the lit middle. */
  darkness: "rgba(3, 4, 7, 0.9)",
  lit: "rgba(3, 4, 7, 0)",
  /** Under-foot shadow of a standing figure. */
  shadow: "rgba(0, 0, 0, 0.35)",
  /** A hostile's health bar: its track and what is left. */
  hpTrack: "rgba(12, 12, 12, 0.7)",
  hpLeft: "#d85f68",
} as const;
