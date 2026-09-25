// Per-device appearance preference for the player's avatar. Rule 2: localStorage is for device
// preferences only, and a colour theme is exactly that.
//
// There is deliberately no class/archetype here. plan.md §0.4: the character is not the centre of
// a game definition, and which fields a player even has is decided by the capability modules the
// cartridge selected — so a hardcoded VRMMO class list at app level was describing a game this
// engine does not implement. Real player/party state lands with `team_party@1` and PlayerProfile.

import { create } from "zustand";

export const COLOR_THEMES = ["cyan", "gold", "crimson", "purple", "emerald"] as const;
export type ColorTheme = (typeof COLOR_THEMES)[number];

export interface CharacterState {
  colorTheme: ColorTheme;
  setColorTheme: (colorTheme: ColorTheme) => void;
}

const STORAGE_KEY = "aether_spire_character_config";
const DEFAULT_THEME: ColorTheme = "cyan";

function loadTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_THEME;
    const parsed: unknown = JSON.parse(raw);
    const theme = (parsed as { colorTheme?: unknown } | null)?.colorTheme;
    return COLOR_THEMES.includes(theme as ColorTheme) ? (theme as ColorTheme) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const useCharacterStore = create<CharacterState>()((set) => ({
  colorTheme: loadTheme(),
  setColorTheme: (colorTheme) => {
    set({ colorTheme });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorTheme }));
    } catch {
      // A blocked storage quota must not break play; the theme just resets next launch.
    }
  },
}));
