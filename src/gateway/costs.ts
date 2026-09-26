// What a call costs the operator (rev 6 phase 4, D2 "Quota"): dated cost records in
// `<data>/costs.json`, each with its source. Amounts are US dollars, as in @shared/pricing (OpenAI
// rows may be copied from there); a self-hosted upstream gets the operator's own dated cost and its
// source. A model with no record in force is not served (`gateway-model-unpriced`), text or image,
// and a record dated after today is not in force yet: nothing is ever priced by a guess (Rule 2).
//
// One credit is one millionth of a dollar of upstream cost, so a price per million tokens is also
// the credits per token: 1,000 output tokens at $4.50 / M cost 4,500 credits. The app shows credits
// only as a share of the allowance, never as money.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import { dayOf } from "./clock";

export const COSTS_FILE = "costs.json";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const amount = z.number().nonnegative().max(1_000_000);

const common = {
  /** The served model id (`upstreams.json`). */
  model: z.string().min(1).max(200),
  /** The upstream id that serves it. */
  upstream: z.string().min(1).max(40),
  /** Where the numbers were read (a URL, an invoice, the operator's own measurement). */
  source: z.string().trim().min(1).max(500),
  /** The day the numbers take effect, YYYY-MM-DD (UTC). */
  asOf: z.string().regex(DAY),
};

const tokenCost = z.strictObject({
  ...common,
  perMillion: z.strictObject({ input: amount, cachedInput: amount, output: amount }),
});

const imageCost = z.strictObject({ ...common, perImage: amount });

const costsSchema = z.strictObject({
  v: z.literal(1),
  records: z.array(z.union([tokenCost, imageCost])).max(1000),
});

export type TokenCost = z.output<typeof tokenCost>;
export type ImageCost = z.output<typeof imageCost>;
export type CostRecord = TokenCost | ImageCost;

export function isTokenCost(record: CostRecord): record is TokenCost {
  return "perMillion" in record;
}

/** Every record in `<data>/costs.json`; an absent file is no records (so nothing is served). */
export function loadCosts(dataDir: string): Result<CostRecord[]> {
  const path = join(dataDir, COSTS_FILE);
  if (!existsSync(path)) return ok([]);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    return err("gateway-costs-invalid", `${path} is not readable JSON (${String(error)}).`);
  }
  const parsed = costsSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return err(
      "gateway-costs-invalid",
      `${path}: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "is not a cost file"}.`,
      'Each record is { model, upstream, perMillion: { input, cachedInput, output } | perImage, source, asOf: "YYYY-MM-DD" }.',
    );
  }
  return ok(parsed.data.records);
}

/** The record in force for `model` on `upstream` at `nowMs`: the latest `asOf` that is not after today. */
export function costFor(
  records: readonly CostRecord[],
  model: string,
  upstream: string,
  nowMs: number,
): CostRecord | null {
  const today = dayOf(nowMs);
  let best: CostRecord | null = null;
  for (const record of records) {
    if (record.model !== model || record.upstream !== upstream || record.asOf > today) continue;
    if (best === null || record.asOf >= best.asOf) best = record;
  }
  return best;
}

export interface TokenCounts {
  /** Prompt tokens, cached ones included (OpenAI's `prompt_tokens`). */
  input: number;
  cached: number;
  output: number;
}

/** Credits for reported (or reserved) token counts; rounded up, so a call is never free by rounding. */
export function tokenCredits(record: TokenCost, counts: TokenCounts): number {
  const cached = Math.min(counts.cached, counts.input);
  const { perMillion } = record;
  const exact =
    (counts.input - cached) * perMillion.input +
    cached * perMillion.cachedInput +
    counts.output * perMillion.output;
  return Math.max(0, Math.ceil(exact - 1e-9));
}

export function imageCredits(record: ImageCost, images: number): number {
  return Math.max(0, Math.ceil(images * record.perImage * 1_000_000 - 1e-9));
}
