// The single place where the harness talks to Cordis' generics. Every `unknown`/cast needed to
// bridge our typed services and events onto `@deepseek-ai/cordis` lives here, so the rest of
// src/harness stays plainly typed.
//
// Cordis augmentation works by declaration merging on the package entry: adding a property to
// `interface Context` makes `ctx.systemPrompt` resolve, and adding a member to `interface Events`
// makes `ctx.on` / `ctx.emit` / `ctx.waterfall` accept that event name with its argument tuple.

import type { Context } from "@deepseek-ai/cordis";
import type { EffectsService } from "./effects";
import type { SkillsService } from "./skills";
import type { SystemPromptService } from "./systemPrompt";
import type { ToolsService } from "./tools";
import type { JsonValue, PreToolDecision, ToolExec, ToolExecutionResult } from "./types";
import type { WorldService } from "./world";

declare module "@deepseek-ai/cordis" {
  interface Context {
    systemPrompt: SystemPromptService;
    tools: ToolsService;
    skills: SkillsService;
    effects: EffectsService;
    world: WorldService;
  }

  interface Events {
    /**
     * Allow or deny one call before its body runs. `next()` delegates to the next listener and
     * finally to allow; returning without calling it owns the decision.
     * @mode waterfall
     */
    "tools/pre-execute"(
      exec: ToolExec,
      next: () => Promise<PreToolDecision>,
    ): Promise<PreToolDecision>;
    /**
     * Around-dispatch wrapper for the tool body (timeouts, metrics, substitution). `next()`
     * runs the body and returns its canonical value.
     * @mode waterfall
     */
    "tools/execute"(exec: ToolExec, next: () => Promise<JsonValue>): Promise<JsonValue>;
    /**
     * Accept or replace the normalized result. `next()` accepts it unchanged.
     * @mode waterfall
     */
    "tools/post-execute"(
      exec: ToolExec,
      result: ToolExecutionResult,
      next: () => Promise<ToolExecutionResult>,
    ): Promise<ToolExecutionResult>;
    /**
     * Observe the final outcome of every call, successful or not.
     * @mode emit
     */
    "tools/result"(result: ToolExecutionResult): void;
  }
}

/**
 * A plugin whose `apply` returns its own disposer.
 *
 * Cordis accepts a disposer returned from a plugin body as a fiber effect, so the same object
 * works both as `ctx.plugin(p)` (disposal unwinds with the fiber) and as a direct `p.apply(ctx)`
 * (the caller keeps the disposer). `mountBuiltins` uses the second form because `ctx.plugin()`
 * only finishes loading on a later microtask, and `createHarness()` is synchronous.
 */
export interface HarnessPlugin {
  name: string;
  inject: string[];
  apply(ctx: Context): () => void;
}

/** Run disposers in reverse registration order, like a Cordis fiber unload. */
export function unwind(disposers: readonly (() => void)[]): () => void {
  return () => {
    for (let i = disposers.length - 1; i >= 0; i -= 1) disposers[i]?.();
  };
}
