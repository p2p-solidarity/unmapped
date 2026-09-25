// UI language. Chrome is translated; anything the model wrote is not (Rule 10 — a generated line
// is already in the player's language, and re-translating it client-side would be a second author).
//
// The choice is a per-device preference, so it lives in localStorage next to the colour theme and
// the player name, and never in a save or a cartridge.

import { create } from "zustand";

export const UI_LANGUAGES = ["en", "zh-TW", "ja"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<UiLanguage, string> = {
  en: "English",
  "zh-TW": "繁體中文",
  ja: "日本語",
};

const STORAGE_KEY = "aether.uiLanguage";

/** Best match for the OS locale, used on the very first run. */
function detect(): UiLanguage {
  const tag = typeof navigator === "undefined" ? "en" : navigator.language;
  if (tag.startsWith("zh")) return "zh-TW";
  if (tag.startsWith("ja")) return "ja";
  return "en";
}

function load(): UiLanguage {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null && (UI_LANGUAGES as readonly string[]).includes(stored)) {
      return stored as UiLanguage;
    }
  } catch {
    // Storage disabled: fall back to the OS locale for this session.
  }
  return detect();
}

interface LanguageState {
  language: UiLanguage;
  setLanguage(language: UiLanguage): void;
}

export const useLanguageStore = create<LanguageState>()((set) => ({
  language: load(),
  setLanguage: (language) => {
    set({ language });
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // A blocked quota must not break the toggle; it just resets next launch.
    }
  },
}));
