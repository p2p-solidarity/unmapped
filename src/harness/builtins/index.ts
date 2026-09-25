// The four plugins every world gets before any mod is mounted.

import type { Context } from "@deepseek-ai/cordis";
import { type HarnessPlugin, unwind } from "../events";
import { persona } from "./persona";
import { skillTool } from "./skillTool";
import { worldContext } from "./worldContext";
import { worldTools } from "./worldTools";

export { persona, skillTool, worldContext, worldTools };

export const builtins = { persona, worldContext, worldTools, skillTool } as const;

/** Mount order: persona, then what the model may read, then what it may do. */
const ORDERED: readonly HarnessPlugin[] = [persona, worldContext, worldTools, skillTool];

/**
 * Mount every built-in on `ctx` synchronously.
 *
 * `ctx.plugin()` only finishes loading on a later microtask, which would leave a just-created
 * harness without its persona; the built-ins depend on services `createHarness` has already
 * provided, so applying them directly is both safe and immediate. The returned disposer unwinds
 * them in reverse order.
 */
export function mountBuiltins(ctx: Context): () => void {
  return unwind(ORDERED.map((plugin) => plugin.apply(ctx)));
}
