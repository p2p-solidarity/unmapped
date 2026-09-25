// Monster silhouettes and colours per MonsterKind (hex literals allowed here by Rule 3).

import type { MonsterKind } from "@shared/world";

/** Primitive silhouette each monster kind is assembled from. */
export type MonsterShape = "blob" | "bones" | "octa" | "block" | "orb" | "chain" | "fox" | "shade";

export interface MonsterLook {
  shape: MonsterShape;
  color: string;
  accent: string;
  emissive: number;
  /** Full height in world units, used to place the name label. */
  height: number;
  /** Silhouette radius at size 1 — the interaction reach a scaled monster grows by. */
  radius: number;
}

export const MONSTER_LOOK: Record<MonsterKind, MonsterLook> = {
  slime: {
    shape: "blob",
    color: "#6fe3a0",
    accent: "#bffadb",
    emissive: 0.35,
    height: 0.7,
    radius: 0.5,
  },
  skeleton: {
    shape: "bones",
    color: "#e8e4d8",
    accent: "#9c9484",
    emissive: 0.05,
    height: 1.6,
    radius: 0.32,
  },
  drone: {
    shape: "octa",
    color: "#7cc4ff",
    accent: "#d6efff",
    emissive: 0.6,
    height: 1.2,
    radius: 0.42,
  },
  golem: {
    shape: "block",
    color: "#8a7f70",
    accent: "#5c5348",
    emissive: 0.05,
    height: 2,
    radius: 0.55,
  },
  wisp: {
    shape: "orb",
    color: "#ffd98a",
    accent: "#fff3d0",
    emissive: 1.8,
    height: 1.4,
    radius: 0.48,
  },
  serpent: {
    shape: "chain",
    color: "#6fbf8f",
    accent: "#3f8f66",
    emissive: 0.2,
    height: 1,
    radius: 0.6,
  },
  fox_spirit: {
    shape: "fox",
    color: "#ff9a5c",
    accent: "#ffe0c4",
    emissive: 0.45,
    height: 1.1,
    radius: 0.44,
  },
  shade: {
    shape: "shade",
    color: "#2a2440",
    accent: "#6b5bb0",
    emissive: 0.15,
    height: 1.3,
    radius: 0.58,
  },
};
