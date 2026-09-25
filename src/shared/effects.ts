// The game-effect vocabulary: the ONLY way a model tool call (from a built-in plugin or a mod)
// can change the world. Effects are declarative data; the renderer's effect provider applies
// them to the stores and dotfiles. Adding a new kind here is a contract change.

import type { Biome, ItemSpec, MonsterSpec, NpcSpec, QuestSpec } from "./world";

export type GameEffect =
  | {
      kind: "mutate_world";
      skyColor: string | null;
      fogDensity: number | null;
      biome: Biome | null;
    }
  | { kind: "grant_materials"; materials: string[] }
  | { kind: "consume_materials"; materials: string[] }
  | { kind: "grant_item"; item: ItemSpec }
  | { kind: "spawn_monster"; monster: MonsterSpec }
  | { kind: "spawn_npc"; npc: NpcSpec }
  | { kind: "remove_entity"; id: string }
  | { kind: "add_quest"; quest: QuestSpec }
  | { kind: "complete_quest"; id: string }
  | { kind: "set_flag"; key: string; value: string | number | boolean }
  | { kind: "teleport_player"; x: number; z: number }
  | { kind: "narrate"; text: string };

export type GameEffectKind = GameEffect["kind"];

export const GAME_EFFECT_KINDS: readonly GameEffectKind[] = [
  "mutate_world",
  "grant_materials",
  "consume_materials",
  "grant_item",
  "spawn_monster",
  "spawn_npc",
  "remove_entity",
  "add_quest",
  "complete_quest",
  "set_flag",
  "teleport_player",
  "narrate",
];

export interface EffectOutcome {
  ok: boolean;
  /** Human/model-readable summary ("granted 2 materials", "no entity 'gate_7'"). */
  message: string;
}

/** World flags live in meta.json and are readable by prompts/tools (quest state, switches). */
export type WorldFlags = Record<string, string | number | boolean>;
