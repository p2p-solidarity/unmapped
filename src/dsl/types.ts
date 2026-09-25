// Public types of the DSL module: the component spec the renderer binds React components to,
// the error every parse* returns, and the prompt contexts the narrative layer fills in.

import type { OpenUIError } from "@openuidev/lang-core";
import type { AppError } from "@shared/result";
import type { Genesis, NpcSpec, SceneGraph } from "@shared/world";
import type { z } from "zod";

/**
 * One component of a library, exposed so the 3D renderer can bind a mesh factory to the exact
 * zod schema the parser validates against (`props` is the same object the library was built from).
 */
export interface ComponentSpec {
  name: string;
  description: string;
  props: z.ZodObject;
}

/** Every `parse*` failure. `errors` carries the model-facing detail `repairPrompt` re-sends. */
export interface DslError extends AppError {
  errors: OpenUIError[];
  /** Names referenced by the program but never defined. */
  unresolved: string[];
  /** Statements that were defined but never reached from the root. */
  orphaned: string[];
}

export interface ScenePromptContext {
  genesis: Genesis;
  /** 1-based floor number of the tower. */
  floor: number;
  /** `Exit.to` label of the floor the player came from, or null on floor 1. */
  previousExit: string | null;
  /** One line per remembered choice, newest last. */
  karmaSummary: string[];
  /** One line per carried item or material. */
  inventorySummary: string[];
}

export interface DialoguePromptContext {
  genesis: Genesis;
  npc: NpcSpec;
  scene: SceneGraph;
  karmaSummary: string[];
  inventorySummary: string[];
}

export interface ItemPromptContext {
  genesis: Genesis;
  /** The player's wish, verbatim. */
  wish: string;
  /** Material names burned at the altar. */
  materials: string[];
  floor: number;
  inventorySummary: string[];
}
