// Small JSON helpers shared by the tool bodies. A tool's canonical value is lossless JSON, so
// every tool that ends in `ctx.effects.apply(...)` returns the same `{ ok, message }` shape and
// renders the message back to the model.

import type { EffectOutcome } from "@shared/effects";
import type { JsonValue } from "./types";

/**
 * Read a validated argument payload as a plain JSON record.
 *
 * A mod's parameters exist only at runtime, so its tool body cannot be statically typed from the
 * spec the way `defineTool`'s generic bodies are. Taking `unknown` keeps that one narrowing
 * explicit and contained instead of spreading casts through the mod loader.
 */
export function jsonRecord(value: unknown): Record<string, JsonValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, JsonValue>;
}

/** The canonical value of an effect-applying tool. */
export function outcomeValue(outcome: EffectOutcome): JsonValue {
  return { ok: outcome.ok, message: outcome.message };
}

/** What the model reads back: the world's own sentence, not a JSON blob. */
export function outcomeText(value: JsonValue): string {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const message = value.message;
    if (typeof message === "string") return message;
  }
  return JSON.stringify(value);
}
