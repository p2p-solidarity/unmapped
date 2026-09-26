// What a model call would cost, for the quote Create a game shows before Build (rev 6 phase 2, D1).
// Only prices read from a provider's own pricing page, each with its source and the day it was
// read; a model not listed here has no price ("price unknown"), never a guess (Rule 2). A local
// provider costs nothing to call. A call through the generation gateway (`hosted`) is paid from the
// account's allowance, which the gateway counts in its own credits (rev 6 phase 4, D2). Token counts before a call are estimates (`estimateTokens`); what
// a call really used is the usage ledger's (@shared/usage), reported by the provider.

import type { ProviderKind } from "./llm";

/** USD per one million tokens. */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
  /** Where the numbers were read, and when (YYYY-MM-DD). */
  source: string;
  asOf: string;
}

const OPENAI_PRICING = "https://developers.openai.com/api/docs/pricing";
const OPENAI_AS_OF = "2026-09-26";

/**
 * OpenAI, Standard tier, short-context text tokens, read from OPENAI_PRICING on 2026-09-26
 * (platform.openai.com/docs/pricing redirects there). gpt-5.4 lists a higher long-context price
 * above 272K tokens; no Create call comes near that.
 */
const OPENAI: Record<string, ModelPrice> = {
  "gpt-5.4": price(2.5, 0.25, 15),
  "gpt-5.4-mini": price(0.75, 0.075, 4.5),
  "gpt-5.4-nano": price(0.2, 0.02, 1.25),
  "gpt-5": price(1.25, 0.125, 10),
  "gpt-5-mini": price(0.25, 0.025, 2),
  "gpt-4.1-mini": price(0.4, 0.1, 1.6),
  "gpt-4o-mini": price(0.15, 0.075, 0.6),
};

function price(input: number, cachedInput: number, output: number): ModelPrice {
  return { input, cachedInput, output, source: OPENAI_PRICING, asOf: OPENAI_AS_OF };
}

/** Providers that run on this machine: calling them costs nothing. */
export const LOCAL_PROVIDERS: readonly ProviderKind[] = ["llamacpp", "ollama", "vllm", "apple-fm"];

export type CallPrice =
  | { kind: "free" }
  | { kind: "allowance" }
  | { kind: "priced"; price: ModelPrice }
  | { kind: "unknown"; model: string };

/** The price of one call to `model` on `kind`: free, a listed price, or unknown. */
export function callPrice(kind: ProviderKind, model: string): CallPrice {
  if (LOCAL_PROVIDERS.includes(kind)) return { kind: "free" };
  if (kind === "hosted") return { kind: "allowance" };
  const listed = kind === "openai" ? OPENAI[model] : undefined;
  return listed === undefined ? { kind: "unknown", model } : { kind: "priced", price: listed };
}

/** USD for `input` prompt tokens and `output` answer tokens at `price` (no cached input assumed). */
export function costUsd(price: ModelPrice, input: number, output: number): number {
  return (input * price.input + output * price.output) / 1_000_000;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

/**
 * A rough token count for text before it is sent: about one token per CJK character, and about one
 * per 3.4 characters of anything else. 3.4 is measured, not the usual rule of thumb of 4: the origin
 * prompt (9,115 characters, 376 CJK) came back from gpt-5.4-mini as 2,929–3,008 input tokens in four
 * builds, 1.14× what one-per-four predicted (docs/e2e/milestone-rev6-p2-create). Different
 * tokenizers disagree, so this is only ever shown as an estimate.
 */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const rest = [...text].length - cjk;
  return cjk + Math.ceil(rest / 3.4);
}
