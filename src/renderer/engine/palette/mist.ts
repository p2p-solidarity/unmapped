// Colours of what the world's history leaves on the land (rev 6 phase 3, WP5 views), shared by
// both looks so the 16-bit canvas and the HD-2D overlay draw the same mist, signposts and gifts.
// Mist is a veil of soft puffs over a chunk the store marks fogged (thick) or fading (thin); a
// legend's name floats over it. Alphas live here with the colours: they are the look, not a rule.

export const MIST_PALETTE = {
  /** The puff every patch of mist is drawn from (a radial fade from this to clear). */
  puff: "#e3e8ef",
  puffClear: "rgba(227, 232, 239, 0)",
  /** Peak opacity of one puff: a fogged chunk, and one fading toward fog. */
  thickAlpha: 0.3,
  thinAlpha: 0.12,
  /** The legend's name over a fogged chunk. */
  legend: "#eee8ff",
  legendShadow: "rgba(26, 22, 44, 0.85)",
  /** A signpost: its post, its board, the words and the arrow on it. */
  signpostPost: "#7a5a38",
  signpostBoard: "#d9c39b",
  signpostEdge: "#4a3522",
  signpostInk: "#3a2816",
  /** Not shared yet: the board's outline while the event waits in the outbox. */
  pendingEdge: "#9aa3b2",
  /** Words over a signpost, readable on grass and on mist alike. */
  label: "#fff6e2",
  labelShadow: "rgba(20, 12, 4, 0.85)",
  /** A gift left on the ground: its box, its ribbon and the shadow under it. */
  giftBox: "#c4524a",
  giftLid: "#d8675e",
  giftRibbon: "#f3d27a",
  giftShadow: "rgba(0, 0, 0, 0.3)",
} as const;
