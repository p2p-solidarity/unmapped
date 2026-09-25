import { create } from "zustand";

export type CharacterClassId = "swordsman" | "mage" | "gunner" | "paladin";
export type ColorTheme = "cyan" | "gold" | "crimson" | "purple" | "emerald";

export interface CharacterState {
  classId: CharacterClassId;
  colorTheme: ColorTheme;
  showWeapon: boolean;
  showAura: boolean;
  isCustomizing: boolean;
  setClassId: (classId: CharacterClassId) => void;
  setColorTheme: (colorTheme: ColorTheme) => void;
  setShowWeapon: (show: boolean) => void;
  setShowAura: (show: boolean) => void;
  setIsCustomizing: (open: boolean) => void;
}

const STORAGE_KEY = "aether_spire_character_config";

function loadInitial(): { classId: CharacterClassId; colorTheme: ColorTheme } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        classId: parsed.classId ?? "swordsman",
        colorTheme: parsed.colorTheme ?? "cyan",
      };
    }
  } catch {
    // fallback
  }
  return { classId: "swordsman", colorTheme: "cyan" };
}

const initial = loadInitial();

export const useCharacterStore = create<CharacterState>()((set) => ({
  classId: initial.classId,
  colorTheme: initial.colorTheme,
  showWeapon: true,
  showAura: true,
  isCustomizing: false,
  setClassId: (classId) => {
    set({ classId });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ classId }));
    } catch {
      // ignore
    }
  },
  setColorTheme: (colorTheme) => {
    set({ colorTheme });
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, colorTheme }));
    } catch {
      // ignore
    }
  },
  setShowWeapon: (showWeapon) => set({ showWeapon }),
  setShowAura: (showAura) => set({ showAura }),
  setIsCustomizing: (isCustomizing) => set({ isCustomizing }),
}));
