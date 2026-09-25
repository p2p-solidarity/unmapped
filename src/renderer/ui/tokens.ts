// Single source of truth for colour, spacing and type. Hex literals are allowed ONLY here.
// HD-2D storybook chrome: deep ink-blue windows with a thin double brass frame, parchment serif
// text, one gold accent — the frame around a lit diorama, never louder than the land itself.

export const colors = {
  bg: "#0a0b13",
  bgRaised: "#121523",
  bgOverlay: "rgba(10, 12, 24, 0.80)",
  surface: "#161a2c",
  surfaceBorder: "#51462f",
  surfaceBorderBright: "#e6c98a",
  text: "#f4ecd8",
  textMuted: "#bdb095",
  textDim: "#81786a",
  accent: "#ecd49a",
  accentInk: "#1a1307",
  accentSoft: "rgba(236, 212, 154, 0.13)",
  gold: "#d9ae5f",
  goldDeep: "#9c7231",
  goldInk: "#1d1408",
  goldSoft: "rgba(217, 174, 95, 0.15)",
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

// A Han character takes the first face in the stack that has it, so the CJK faces are ordered by
// the UI language: Japanese Mincho ahead of Songti would draw Chinese text with Japanese forms.
// Book faces that ship with the OS (nothing is downloaded); Mincho/Song faces carry CJK in the
// same voice, so a Chinese or Japanese land reads like the English one.
const CJK = {
  ja: {
    serif: ['"Hiragino Mincho ProN"', '"Yu Mincho"', '"Songti TC"', '"Noto Serif CJK TC"'],
    sans: ['"Hiragino Sans"', '"Zen Kaku Gothic New"', '"PingFang TC"', '"Noto Sans TC"'],
  },
  zh: {
    serif: ['"Songti TC"', '"Noto Serif CJK TC"', '"Hiragino Mincho ProN"', '"Yu Mincho"'],
    sans: ['"PingFang TC"', '"Noto Sans TC"', '"Hiragino Sans"', '"Zen Kaku Gothic New"'],
  },
} as const;

/** The three type stacks with CJK fallbacks ordered for a UI language ("en", "zh-TW", "ja"). */
export function fontStacks(language: string): { family: string; mono: string; display: string } {
  const cjk = language.startsWith("zh") ? CJK.zh : CJK.ja;
  return {
    family: [
      '"Iowan Old Style"',
      '"Palatino Linotype"',
      "Palatino",
      ...cjk.serif,
      "Georgia",
      "serif",
    ].join(", "),
    mono: ['"JetBrains Mono"', '"SF Mono"', "Menlo", ...cjk.sans, "monospace"].join(", "),
    display: [
      '"Cinzel"',
      '"Trajan Pro"',
      '"Big Caslon"',
      '"Iowan Old Style"',
      ...cjk.serif,
      "Georgia",
      "serif",
    ].join(", "),
  };
}

const { family: SERIF_STACK, mono: MONO_STACK, display: DISPLAY_STACK } = fontStacks("en");

export const font = {
  // Prose, menus and windows are set in a book serif; ids, hashes, coordinates and code keep the
  // monospace (`mono`) so they stay aligned. `display` is for the logo and screen titles only.
  family: SERIF_STACK,
  mono: MONO_STACK,
  display: DISPLAY_STACK,
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

/** Window fill: a faint ink-blue fall from top to bottom, like the menus of a storybook RPG. */
export const surfaces = {
  window: "linear-gradient(180deg, rgba(26, 32, 58, 0.90) 0%, rgba(11, 13, 26, 0.92) 100%)",
  windowSoft: "linear-gradient(180deg, rgba(26, 32, 58, 0.66) 0%, rgba(11, 13, 26, 0.74) 100%)",
  goldButton: "linear-gradient(180deg, #ecca7e 0%, #c3924a 100%)",
} as const;

export const shadow = {
  /** Thin inner second frame inside a window's border. */
  frame: "inset 0 0 0 3px rgba(4, 5, 12, 0.55), inset 0 0 0 4px rgba(217, 174, 95, 0.28)",
  textGlow: "0 0 18px rgba(236, 212, 154, 0.45), 0 2px 3px rgba(0, 0, 0, 0.8)",
  card: "0 12px 40px rgba(0, 0, 0, 0.55)",
  glow: "0 0 0 1px rgba(233, 223, 199, 0.25)",
  glowCyan: "0 0 0 1px rgba(233, 223, 199, 0.25)",
  glowGold: "0 0 0 1px rgba(212, 168, 90, 0.35)",
} as const;

export const zIndex = { scene: 0, hud: 10, overlay: 20, console: 30, toast: 40 } as const;

/** Minimum interactive target size (px). */
export const HIT_TARGET = 44;

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
  "--g-window": surfaces.window,
  "--g-window-soft": surfaces.windowSoft,
  "--g-frame": shadow.frame,
  "--g-glow": shadow.textGlow,
  "--ui-font": font.family,
  "--ui-mono": font.mono,
  "--ui-display": font.display,
} as const;
