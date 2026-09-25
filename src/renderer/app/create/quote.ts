// What Build will ask the model for, shown before the button (rev 6 phase 2, D1). The first call's
// input is measured from the very prompt the origin call sends: `originPrompt` assembled into a
// harness with the built-in sections, exactly as `runNarrativeTurn` assembles it for Create, plus
// its user turn. Tokens are an estimate (@shared/pricing `estimateTokens`: ~1 per CJK character,
// ~4 characters per token otherwise); money only when the model has a dated price; a local model
// is free. What the calls really cost lands in the usage ledger afterwards.

import { originPrompt } from "@dsl";
import { createHarness, mountBuiltins, ORDER } from "@harness";
import { CHAPTER_MAX_TOKENS } from "@renderer/narrative/chapter";
import type { WorldIdea } from "@renderer/narrative/newWorld";
import {
  type BuildReadiness,
  ORIGIN_MAX_TOKENS,
  ORIGIN_USER,
  type OriginRoute,
} from "@renderer/narrative/originScene";
import { MAX_REPAIRS } from "@renderer/narrative/program";
import { DSL_SECTION } from "@renderer/narrative/turn";
import { type BibleFields, flattenBible } from "@shared/bible";
import { type CallPrice, callPrice, costUsd, estimateTokens } from "@shared/pricing";
import { err, ok, type Result } from "@shared/result";

export interface BuildQuote {
  route: OriginRoute;
  provider: string;
  model: string;
  /** Repair rounds the origin may take after its first call. */
  repairs: number;
  /** The first call, measured from its prompt; null when the Apple bridge writes the scene. */
  first: { input: number; output: number } | null;
  /** Every round used: each repair resends the prompt with the last answer quoted twice. */
  worst: { calls: number; input: number; output: number } | null;
  price: CallPrice;
  firstUsd: number | null;
  worstUsd: number | null;
  /** The first chapter, written in the background after the player enters: its output cap. */
  chapterCap: number;
}

/** The origin call's system prompt, assembled as the call assembles it. */
function assembledSystem(idea: WorldIdea, fields: BibleFields): string {
  const harness = createHarness();
  try {
    mountBuiltins(harness.ctx);
    return harness.ctx.systemPrompt.assemble({ purpose: "scene", language: idea.language }, [
      {
        name: DSL_SECTION,
        order: ORDER.DSL_SPEC,
        text: originPrompt(idea, flattenBible(fields)),
        interpolate: false,
      },
    ]).text;
  } finally {
    void harness.dispose();
  }
}

export function buildQuote(
  idea: WorldIdea,
  fields: BibleFields,
  readiness: BuildReadiness,
): Result<BuildQuote> {
  const price = callPrice(readiness.kind, readiness.model);
  const base = {
    route: readiness.route,
    provider: readiness.kind,
    model: readiness.model,
    repairs: MAX_REPAIRS,
    // The bridge runs on this Mac: free, and its prompt is not the chat one measured here.
    price: readiness.route === "apple-bridge" ? ({ kind: "free" } as const) : price,
    chapterCap: CHAPTER_MAX_TOKENS,
  };
  if (readiness.route === "apple-bridge") {
    return ok({ ...base, first: null, worst: null, firstUsd: null, worstUsd: null });
  }
  let system: string;
  try {
    system = assembledSystem(idea, fields);
  } catch (thrown) {
    return err(
      "create-quote-failed",
      `The origin prompt could not be assembled: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
  }
  const input = estimateTokens(system) + estimateTokens(ORIGIN_USER);
  const output = ORIGIN_MAX_TOKENS;
  const calls = 1 + MAX_REPAIRS;
  // A repair round sends the opening turns again, the rejected answer, and a repair turn that
  // quotes it once more (plus a few lines on what failed, not counted here).
  const worst = {
    calls,
    input: calls * input + MAX_REPAIRS * 2 * output,
    output: calls * output,
  };
  const usd = (tokensIn: number, tokensOut: number): number | null =>
    price.kind === "priced" ? costUsd(price.price, tokensIn, tokensOut) : null;
  return ok({
    ...base,
    first: { input, output },
    worst,
    firstUsd: usd(input, output),
    worstUsd: usd(worst.input, worst.output),
  });
}
