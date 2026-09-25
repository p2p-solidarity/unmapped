// Mods ("Seed" extensions): a directory with a `mod.yml` manifest plus prompt/skill markdown.
// A mod contributes system-prompt sections, declarative tools whose execution maps onto
// GameEffects, and skills the model can load on demand. Mods never ship executable code.

import type { GameEffectKind } from "./effects";

export const MOD_MANIFEST_FILE = "mod.yml";
export const MOD_PACK_EXTENSION = "mod";

/** Subset of JSON Schema a mod tool may use for its parameters (validated by the harness). */
export type ModParamSchema =
  | { type: "string"; description?: string; enum?: string[]; required?: boolean }
  | {
      type: "number" | "integer";
      description?: string;
      minimum?: number;
      maximum?: number;
      required?: boolean;
    }
  | { type: "boolean"; description?: string; required?: boolean }
  | { type: "array"; description?: string; items: ModParamSchema; required?: boolean };

export interface ModPromptSection {
  name: string;
  /** Sort order among all sections; built-ins use 100..900. */
  order: number;
  /** Relative path to a markdown file inside the mod. */
  file: string;
}

/**
 * A declarative tool: parameters the model fills in, and an effect template. `{{param}}`
 * placeholders in string fields are replaced by the validated argument of that name.
 */
export interface ModTool {
  name: string;
  description: string;
  parameters: Record<string, ModParamSchema>;
  effect: { kind: GameEffectKind } & Record<string, unknown>;
}

export interface ModManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  /** Other mod names that must be enabled first. */
  inject: string[];
  prompt: ModPromptSection[];
  tools: ModTool[];
  /** Relative directories, each holding `SKILL.md` bundles or flat `<name>.md` files. */
  skills: string[];
}

/** Everything the renderer needs to mount a mod without touching the filesystem. */
export interface ModBundle {
  manifest: ModManifest;
  /** Relative path → UTF-8 content for every prompt/skill file referenced by the manifest. */
  files: Record<string, string>;
  /** Absolute install directory (main only; informational in the renderer). */
  dir: string;
}

export interface ModSummary {
  name: string;
  version: string;
  author: string;
  description: string;
  toolCount: number;
  sectionCount: number;
  skillCount: number;
}

export interface ModLockEntry {
  name: string;
  version: string;
  contentHash: import("./cartridge").ContentHash;
  affectsRuntime: boolean;
  provides: string[];
}
export interface ModLock {
  entries: ModLockEntry[];
  lockHash: import("./cartridge").ContentHash;
}
/** SHA-256 of the canonical empty ordered entries array. */
export const EMPTY_MOD_LOCK: ModLock = {
  entries: [],
  lockHash: "sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
};

export interface WeaponDefinition {
  weaponId: string;
  name: string;
  kind: import("./combat").WeaponKind;
  damage: number;
  range: number;
  cooldownMs: number;
  ammoType: string | null;
  magazine: number | null;
  assetId: string;
}
export interface TimingChange {
  from: import("./timing").TimingSystemId;
  to: import("./timing").TimingSystemId;
  resolution: import("./timing").TurnResolution;
  turnDurationMs: number | null;
}
export interface ScenePatch {
  operations: Array<
    | { type: "replace_asset"; fromAssetId: string; toAssetId: string }
    | { type: "move_asset"; assetId: string; x: number; z: number }
    | { type: "set_objective"; text: string }
    | { type: "set_contract"; contract: import("./gameplay").SceneContract }
  >;
}
export type ModOperation =
  | { type: "add_weapon"; weapon: WeaponDefinition }
  | { type: "change_timing"; change: TimingChange }
  | { type: "add_capability_module"; moduleId: string; version: string }
  | { type: "scene_patch"; sceneId: string; patch: ScenePatch }
  | { type: "asset_patch"; sceneId: string; assets: import("./assets").AssetRef[] };
export interface SeedModProposal {
  /** Optional author-selected version, validated again when publishing. */
  targetVersion?: string;
  proposalId: string;
  base: import("./cartridge").CartridgeRef;
  authorPrompt: string;
  operations: ModOperation[];
  generatedAt: string;
}
export interface ModCompatibilityResult {
  status: "compatible" | "needs_decision" | "needs_migration" | "incompatible";
  reasons: string[];
  affectedScenes: string[];
  saveImpact: "none" | "migration" | "new_instance";
  networkImpact: "none" | "new_effective_hash" | "incompatible";
}
export interface ModProposalPreview {
  proposal: SeedModProposal;
  compatibility: ModCompatibilityResult;
  revision: import("./cartridge").PublishCartridgeInput;
}
