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
