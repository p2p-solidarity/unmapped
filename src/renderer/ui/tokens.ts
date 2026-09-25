// Single source of truth for colour, spacing and type. Hex literals are allowed ONLY here.
// Muted, warm, low-saturation: charcoal ground, parchment text, one brass accent. No neon glows.

export const colors = {
  bg: "#0b0b0e",
  bgRaised: "#141418",
  bgOverlay: "rgba(8, 8, 10, 0.82)",
  surface: "#17171c",
  surfaceBorder: "#34343c",
  surfaceBorderBright: "#e9dfc7",
  text: "#f2eee6",
  textMuted: "#aaa59b",
  textDim: "#6e6a63",
  accent: "#e9dfc7",
  accentInk: "#141210",
  accentSoft: "rgba(233, 223, 199, 0.12)",
  gold: "#d4a85a",
  goldDeep: "#a97c35",
  goldInk: "#1d1408",
  goldSoft: "rgba(212, 168, 90, 0.14)",
  hp: "#8cc08f",
  mp: "#7fa6c2",
  purple: "#9c86c9",
  danger: "#d8645f",
  dangerSoft: "rgba(216, 100, 95, 0.16)",
  success: "#8cc08f",
  info: "#9fb6c9",
  focus: "#e9dfc7",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 40 } as const;

export const radius = { sm: 2, md: 2, lg: 3, pill: 999 } as const;

/** CSS custom properties so stylesheet rules can read the palette without colour literals. */
export const cssVars = {
  "--g-accent": colors.accent,
  "--g-accent-soft": colors.accentSoft,
  "--g-gold": colors.gold,
  "--g-gold-soft": colors.goldSoft,
  "--g-text": colors.text,
  "--g-muted": colors.textMuted,
  "--g-dim": colors.textDim,
  "--g-bg": colors.bg,
  "--g-raised": colors.bgRaised,
  "--g-overlay": colors.bgOverlay,
  "--g-border": colors.surfaceBorder,
  "--g-danger": colors.danger,
  "--g-success": colors.success,
} as const;

export const font = {
  family:
    '"Rajdhani", "Zen Kaku Gothic New", "Noto Sans JP", "Noto Sans TC", "Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
  size: {
    caption: 12,
    label: 13,
    body: 15,
    bodyLarge: 17,
    title: 20,
    titleLarge: 26,
    headline: 34,
  },
  weight: { regular: 400, medium: 500, bold: 700 },
} as const;

export const shadow = {
  card: "0 12px 40px rgba(0, 0, 0, 0.55)",
  glow: "0 0 0 1px rgba(233, 223, 199, 0.25)",
  glowCyan: "0 0 0 1px rgba(233, 223, 199, 0.25)",
  glowGold: "0 0 0 1px rgba(212, 168, 90, 0.35)",
} as const;

export const zIndex = { scene: 0, hud: 10, overlay: 20, console: 30, toast: 40 } as const;

/** Minimum interactive target size (px). */
export const HIT_TARGET = 44;
