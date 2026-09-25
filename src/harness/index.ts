// The Seed harness: how anything in UNMAPPED talks to the model (Rule 11, docs/harness.md).
//
// Framework-agnostic — it runs in the renderer, in the Electron main process and in vitest, and
// imports no React, no Electron and no DOM. Five Cordis services hold everything a turn needs:
//
//   ctx.systemPrompt   ordered prompt sections + {{variables}}
//   ctx.tools          model-facing tools and the pre/execute/post pipeline
//   ctx.skills         the on-demand catalog
//   ctx.effects        the ONLY seam through which a tool changes the world
//   ctx.world          the read-only snapshot prompts and tools may read
//
// Every registration is a reversible `ctx.effect`, so a mod can be mounted and unmounted while a
// world stays open.

import { Context } from "@deepseek-ai/cordis";
import "./events";
import { EffectsService } from "./effects";
import { SkillsService } from "./skills";
import { SystemPromptService } from "./systemPrompt";
import { ToolsService } from "./tools";
import { WorldService } from "./world";

export interface Harness {
  ctx: Context;
  dispose(): Promise<void>;
}

/** Create a context with the five services mounted. Synchronous: `ctx.systemPrompt` works now. */
export function createHarness(): Harness {
  const ctx = new Context();
  // Constructing a Service registers it on the current (root) fiber, so disposing that fiber
  // takes all five with it. `ctx.plugin()` would only settle on a later microtask.
  void new SystemPromptService(ctx);
  void new ToolsService(ctx);
  void new SkillsService(ctx);
  void new EffectsService(ctx);
  void new WorldService(ctx);
  return { ctx, dispose: () => ctx.fiber.dispose() };
}

export { builtins, mountBuiltins, persona, skillTool, worldContext, worldTools } from "./builtins";
export {
  type DefineToolConfig,
  defineTool,
  type InferArgs,
  type InferParam,
  type ParamSpec,
  type ParamSpecMap,
  parametersJsonSchema,
  parametersZod,
  paramJsonSchema,
  paramZod,
  toParamSpecMap,
} from "./defineTool";
export {
  type EffectApplier,
  EffectsService,
  gameEffectSchema,
  parseGameEffect,
} from "./effects";
export { type HarnessPlugin, unwind } from "./events";
export {
  type BundledSkill,
  collectSkillFiles,
  parseModManifest,
  validateModBundle,
} from "./mods/manifest";
export { modPlugin } from "./mods/plugin";
export { fillTemplate } from "./mods/template";
export { ORDER, type OrderName } from "./order";
export { parseSkillFile, SkillsService } from "./skills";
export { interpolate, SystemPromptService } from "./systemPrompt";
export { ToolsService } from "./tools";
export { addUsage, runTurn, TURN_DEFAULTS, type TurnInput } from "./turn";
export type {
  AssembleContext,
  AssembledPrompt,
  ChatFn,
  JsonValue,
  PreToolDecision,
  PromptPurpose,
  PromptSection,
  SkillProvider,
  SkillSummary,
  ToolDefinition,
  ToolExec,
  ToolExecInput,
  ToolExecutionResult,
  TurnResult,
  VariableProvider,
  WorldSnapshot,
} from "./types";
export { jsonRecord, outcomeText, outcomeValue } from "./values";
export { WorldService } from "./world";
