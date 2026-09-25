import type { GameplayKitId } from "./gameplay";
import type { Biome, PropKind } from "./world";

export const WORLD_MATERIAL_IDS = [
  "clockwork_foundry",
  "sky_relics",
  "biolume_garden",
  "drowned_archive",
] as const;
export type WorldMaterialId = (typeof WORLD_MATERIAL_IDS)[number];

export interface WorldMaterialPack {
  id: WorldMaterialId;
  name: string;
  mark: string;
  tagline: string;
  direction: string;
  biomes: readonly Biome[];
  props: readonly PropKind[];
}

export const WORLD_MATERIAL_PACKS: readonly WorldMaterialPack[] = [
  {
    id: "clockwork_foundry",
    name: "Clockwork Foundry",
    mark: "01 / IRON",
    tagline: "巨大機械、熔爐與會運轉的關卡",
    direction:
      "monumental clockwork foundry, layered machinery, molten energy and moving production lines",
    biomes: ["cyber_workshop", "lava_forge", "ruined_castle"],
    props: ["machine_gear", "conveyor", "boiler", "pipe_stack", "crane", "reactor"],
  },
  {
    id: "sky_relics",
    name: "Sky Relics",
    mark: "02 / AETHER",
    tagline: "浮島、遺跡與垂直移動的空中機關",
    direction:
      "wind-worn floating ruins, impossible bridges, aether machinery and enormous vertical scale",
    biomes: ["sky_isle", "ruined_castle", "snowfield"],
    props: ["pillar", "statue", "reactor", "machine_gear", "crane", "altar"],
  },
  {
    id: "biolume_garden",
    name: "Biolume Garden",
    mark: "03 / GROWTH",
    tagline: "會發光的生命、菌絲與有機機械",
    direction:
      "bioluminescent living garden, oversized fungal silhouettes and organic machines reclaiming ruins",
    biomes: ["meadow", "abyss", "onsen_town"],
    props: ["mushroom", "flower", "tree", "reactor", "well", "altar"],
  },
  {
    id: "drowned_archive",
    name: "Drowned Archive",
    mark: "04 / TIDE",
    tagline: "沉沒圖書館、水道與古老的解謎設施",
    direction:
      "submerged archive halls, reflective waterways, corroded mechanisms and monumental forgotten records",
    biomes: ["onsen_town", "abyss", "ruined_castle"],
    props: ["pillar", "pipe_stack", "machine_gear", "statue", "well", "reactor"],
  },
] as const;

export interface CartridgeBlueprint {
  materialId: WorldMaterialId;
  visualDirection: string;
  assetPalette: PropKind[];
  biomePalette: Biome[];
  sceneKits: [GameplayKitId, GameplayKitId, GameplayKitId];
  gameplayBrief: string;
}

export function materialPack(id: WorldMaterialId): WorldMaterialPack {
  const fallback = WORLD_MATERIAL_PACKS[0];
  if (fallback === undefined) throw new Error("World material registry is empty.");
  return WORLD_MATERIAL_PACKS.find((pack) => pack.id === id) ?? fallback;
}
