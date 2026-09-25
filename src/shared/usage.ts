// What every model call cost (rev 6 §3.2): one append-only line per call — what it was for, which
// world it belongs to, the provider and model, input / output / cached-input tokens and how long it
// took — written by main, where every provider call passes, never by the renderer. Only numbers:
// no prompt, no answer and no key is ever written here.
//
// A world's total is every line of its scope, plus the lines of the scopes linked into it (the
// Create draft a world was built from). The ledger only grows; a summary is always derived.

import { z } from "zod";

export const USAGE_PURPOSES = [
  "witness",
  "chapter",
  "place",
  "dialogue",
  "item",
  "scene",
  "origin",
  "bible",
  "story",
  "story-edit",
  "resolve",
  "mod",
  "tweak",
  "work",
  "image",
] as const;
export type UsagePurpose = (typeof USAGE_PURPOSES)[number];

export const USAGE_SCOPE_KINDS = ["instance", "create", "work"] as const;
export type UsageScopeKind = (typeof USAGE_SCOPE_KINDS)[number];

/** Which world a call belongs to: a save being played, a Create draft, or an AI world draft. */
export interface UsageScope {
  kind: UsageScopeKind;
  id: string;
}

/** What the caller says about a call; main adds the rest from the provider it actually used. */
export interface UsageTag {
  purpose: UsagePurpose;
  scope: UsageScope | null;
}

export type UsageOutcome = "done" | "failed" | "aborted";

export interface UsageRecord {
  v: 1;
  at: string;
  purpose: UsagePurpose;
  scope: UsageScope | null;
  provider: string;
  model: string;
  /** Null when the provider did not report it; never estimated (Rule 2). */
  input: number | null;
  output: number | null;
  cached: number | null;
  ms: number;
  outcome: UsageOutcome;
}

/** Folds `from`'s calls into `to`'s total (a Create draft into the world built from it). */
export interface UsageLink {
  v: 1;
  at: string;
  link: { from: UsageScope; to: UsageScope };
}

export type UsageLine = UsageRecord | UsageLink;

export const usageScopeSchema = z
  .object({
    kind: z.enum(USAGE_SCOPE_KINDS),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
  })
  .strict();

export const usageTagSchema = z
  .object({ purpose: z.enum(USAGE_PURPOSES), scope: usageScopeSchema.nullable() })
  .strict();

const count = z.number().int().nonnegative().max(100_000_000).nullable();

const recordSchema = z
  .object({
    v: z.literal(1),
    at: z.string().max(40),
    purpose: z.enum(USAGE_PURPOSES),
    scope: usageScopeSchema.nullable(),
    provider: z.string().max(40),
    model: z.string().max(200),
    input: count,
    output: count,
    cached: count,
    ms: z.number().int().nonnegative().max(86_400_000),
    outcome: z.enum(["done", "failed", "aborted"]),
  })
  .strict();

const linkSchema = z
  .object({
    v: z.literal(1),
    at: z.string().max(40),
    link: z.object({ from: usageScopeSchema, to: usageScopeSchema }).strict(),
  })
  .strict();

const lineSchema = z.union([recordSchema, linkSchema]);

export function isUsageLink(line: UsageLine): line is UsageLink {
  return "link" in line;
}

export function usageScopeKey(scope: UsageScope): string {
  return `${scope.kind}:${scope.id}`;
}

/** Every valid line of a ledger; a torn or foreign line is counted, never guessed at. */
export function parseUsageLines(text: string): { lines: UsageLine[]; skipped: number } {
  const lines: UsageLine[] = [];
  let skipped = 0;
  for (const raw of text.split("\n")) {
    if (raw.trim() === "") continue;
    try {
      const parsed = lineSchema.safeParse(JSON.parse(raw));
      if (parsed.success) lines.push(parsed.data as UsageLine);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { lines, skipped };
}

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cached: number;
  ms: number;
  /** Calls whose provider reported no token counts: their tokens are unknown, not zero. */
  unreported: number;
}

export interface UsageSummary extends UsageTotals {
  scope: UsageScope;
  byPurpose: Partial<Record<UsagePurpose, UsageTotals>>;
  /** Newest first, at most `RECENT_USAGE`. */
  recent: UsageRecord[];
  /** Ledger lines that could not be read. */
  skipped: number;
}

export const RECENT_USAGE = 12;

function emptyTotals(): UsageTotals {
  return { calls: 0, input: 0, output: 0, cached: 0, ms: 0, unreported: 0 };
}

function add(totals: UsageTotals, record: UsageRecord): void {
  totals.calls += 1;
  totals.input += record.input ?? 0;
  totals.output += record.output ?? 0;
  totals.cached += record.cached ?? 0;
  totals.ms += record.ms;
  if (record.input === null && record.output === null) totals.unreported += 1;
}

/** The scopes whose calls count toward `scope`: itself and everything linked into it. */
export function scopesOf(lines: readonly UsageLine[], scope: UsageScope): Set<string> {
  const wanted = new Set([usageScopeKey(scope)]);
  const links = lines.filter(isUsageLink);
  for (let grew = true; grew; ) {
    grew = false;
    for (const { link } of links) {
      const from = usageScopeKey(link.from);
      if (wanted.has(usageScopeKey(link.to)) && !wanted.has(from)) {
        wanted.add(from);
        grew = true;
      }
    }
  }
  return wanted;
}

export function summarizeUsage(
  lines: readonly UsageLine[],
  scope: UsageScope,
  skipped = 0,
): UsageSummary {
  const wanted = scopesOf(lines, scope);
  const totals = emptyTotals();
  const byPurpose: Partial<Record<UsagePurpose, UsageTotals>> = {};
  const mine: UsageRecord[] = [];
  for (const line of lines) {
    if (isUsageLink(line) || line.scope === null || !wanted.has(usageScopeKey(line.scope))) {
      continue;
    }
    mine.push(line);
    add(totals, line);
    const bucket = byPurpose[line.purpose] ?? emptyTotals();
    add(bucket, line);
    byPurpose[line.purpose] = bucket;
  }
  return {
    scope,
    ...totals,
    byPurpose,
    recent: mine.slice(-RECENT_USAGE).reverse(),
    skipped,
  };
}
