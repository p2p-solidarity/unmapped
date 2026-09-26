// The quota ledger (rev 6 phase 4, D2 "Quota", D3 "Entitlements"): `<data>/ledger.jsonl`, append
// only, one process per data dir, fsync per line. Balances are never stored; they are folded from
//
//   reserve      credits held before a call is forwarded
//   settle       a `UsageRecord` (scope always null: the gateway never learns a world) plus
//                { account, requestId, period, credits, charged }; credits never exceed the hold
//   release      a hold given back (abort, upstream error, the stream cap, or a stale hold at start)
//   grant        credits for one period, from the operator's CLI or a verifier
//   entitlement  a billing provider's event: deduplicated by its event id, ordered by the
//                provider's own timestamp (never by arrival), latest per subscription wins
//
// Execution is de-duplicated by (account, request id) for 24 h: an open hold answers 409
// `request-in-flight`, a settled or released one 409 `request-settled`, and nothing runs again.
// The period is the calendar month in UTC; a period's allowance is its grants plus the entitlements
// active now.

import { ACCOUNT_ID } from "@shared/account";
import { entitlementSchema } from "@shared/billing";
import {
  GATEWAY_ERRORS,
  periodResetsAt,
  QUOTA_PERIOD,
  type QuotaStatus,
  quotaPeriod,
  REQUEST_DEDUP_MS,
  REQUEST_ID,
} from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import { USAGE_PURPOSES, type UsagePurpose, type UsageRecord } from "@shared/usage";
import { z } from "zod";
import { type Refusal, refuse } from "./accounts";
import { type GatewayClock, isoAt } from "./clock";
import { type JsonlFile, parseLines } from "./jsonl";

const account = z.string().regex(ACCOUNT_ID);
const at = z.string().max(40);
const requestId = z.string().regex(REQUEST_ID);
const period = z.string().regex(QUOTA_PERIOD);
const credits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const tokens = z.number().int().nonnegative().max(100_000_000).nullable();
const purpose = z.enum(USAGE_PURPOSES);

const lineSchema = z.discriminatedUnion("t", [
  z.strictObject({
    t: z.literal("reserve"),
    at,
    account,
    requestId,
    period,
    purpose,
    upstream: z.string().max(40),
    model: z.string().max(200),
    credits,
  }),
  z.strictObject({
    t: z.literal("settle"),
    v: z.literal(1),
    at,
    purpose,
    scope: z.null(),
    provider: z.string().max(40),
    model: z.string().max(200),
    input: tokens,
    output: tokens,
    cached: tokens,
    ms: z.number().int().nonnegative().max(86_400_000),
    outcome: z.enum(["done", "failed", "aborted"]),
    account,
    requestId,
    period,
    credits,
    charged: z.enum(["usage", "reserved"]),
  }),
  z.strictObject({
    t: z.literal("release"),
    at,
    account,
    requestId,
    reason: z.enum(["abort", "error", "stream-cap", "stale"]),
  }),
  z.strictObject({
    t: z.literal("grant"),
    at,
    account,
    period,
    credits: credits.min(1),
    source: z.enum(["operator", "verifier"]),
    subject: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  }),
  z.strictObject({
    t: z.literal("entitlement"),
    at,
    provider: z.string().regex(/^[a-z0-9-]{1,32}$/),
    eventId: z.string().min(1).max(255),
    providerAt: z.string().max(40),
    subscription: z.string().min(1).max(255),
    customer: z.string().max(255).nullable(),
    entitlement: entitlementSchema,
  }),
]);

type Line = z.output<typeof lineSchema>;
export type EntitlementLine = Extract<Line, { t: "entitlement" }>;
export type SettleLine = Extract<Line, { t: "settle" }>;
export type ReleaseReason = Extract<Line, { t: "release" }>["reason"];

export interface Reservation {
  account: string;
  requestId: string;
  period: string;
  purpose: UsagePurpose;
  upstream: string;
  model: string;
  credits: number;
  atMs: number;
}

export type RequestState = "unknown" | "in-flight" | "settled";

const STATUS_RANK = { active: 0, past_due: 1, canceled: 2 } as const;

function laterThan(a: EntitlementLine, b: EntitlementLine): boolean {
  const ta = Date.parse(a.providerAt);
  const tb = Date.parse(b.providerAt);
  if (ta !== tb) return ta > tb;
  // Same instant: the more final state wins, then the event id, so every restart folds alike.
  const ra = STATUS_RANK[a.entitlement.status];
  const rb = STATUS_RANK[b.entitlement.status];
  if (ra !== rb) return ra > rb;
  return a.eventId > b.eventId;
}

const keyOf = (accountId: string, id: string) => `${accountId}|${id}`;

export class Ledger {
  private readonly open = new Map<string, Reservation>();
  /** Settled or released request ids → when they were reserved. */
  private readonly spent = new Map<string, number>();
  private readonly used = new Map<string, number>();
  private readonly grants = new Map<string, number>();
  private readonly subjects = new Set<string>();
  private readonly events = new Set<string>();
  private readonly subscriptions = new Map<string, EntitlementLine>();

  constructor(
    private readonly file: JsonlFile,
    private readonly clock: GatewayClock,
  ) {}

  load(): Result<{ lines: number; open: number; torn: number }> {
    const read = this.file.read();
    if (!read.ok) return read;
    const lines = parseLines("ledger.jsonl", read.value.lines, (raw) => {
      const parsed = lineSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    });
    if (!lines.ok) return lines;
    for (const [index, line] of lines.value.entries()) {
      if (!this.apply(line)) {
        return err(
          "gateway-ledger-damaged",
          `ledger.jsonl line ${index + 1} (${line.t}) does not follow from the lines before it.`,
          "Restore the file from a backup; the gateway never guesses at a ledger.",
        );
      }
    }
    return ok({ lines: lines.value.length, open: this.open.size, torn: read.value.torn });
  }

  private apply(line: Line): boolean {
    switch (line.t) {
      case "reserve": {
        const key = keyOf(line.account, line.requestId);
        if (this.open.has(key)) return false;
        this.spent.delete(key);
        this.open.set(key, {
          account: line.account,
          requestId: line.requestId,
          period: line.period,
          purpose: line.purpose,
          upstream: line.upstream,
          model: line.model,
          credits: line.credits,
          atMs: Date.parse(line.at),
        });
        return true;
      }
      case "settle":
      case "release": {
        const key = keyOf(line.account, line.requestId);
        const held = this.open.get(key);
        if (held === undefined) return false;
        if (line.t === "settle") {
          if (line.credits > held.credits || line.period !== held.period) return false;
          const bucket = keyOf(line.account, line.period);
          this.used.set(bucket, (this.used.get(bucket) ?? 0) + line.credits);
        }
        this.open.delete(key);
        this.spent.set(key, held.atMs);
        return true;
      }
      case "grant": {
        const bucket = keyOf(line.account, line.period);
        if (line.subject !== null) {
          const subject = `${line.subject}|${line.period}`;
          if (this.subjects.has(subject)) return false;
          this.subjects.add(subject);
        }
        this.grants.set(bucket, (this.grants.get(bucket) ?? 0) + line.credits);
        return true;
      }
      case "entitlement": {
        const event = `${line.provider}|${line.eventId}`;
        if (this.events.has(event)) return false;
        this.events.add(event);
        const key = `${line.provider}|${line.subscription}`;
        const current = this.subscriptions.get(key);
        if (current === undefined || laterThan(line, current)) this.subscriptions.set(key, line);
        return true;
      }
    }
  }

  private write(line: Line): Result<void> {
    const appended = this.file.append(line);
    if (!appended.ok) return appended;
    if (!this.apply(line)) {
      return err("gateway-internal", `The ${line.t} line did not fold after it was written.`);
    }
    return ok(undefined);
  }

  /** What a request id means for this account right now (24 h window). */
  requestState(accountId: string, id: string): RequestState {
    const key = keyOf(accountId, id);
    if (this.open.has(key)) return "in-flight";
    const spentAt = this.spent.get(key);
    if (spentAt !== undefined && this.clock.now() - spentAt < REQUEST_DEDUP_MS) return "settled";
    return "unknown";
  }

  /** The 409 for a request id that is not "unknown", or null. */
  duplicate(accountId: string, id: string): Refusal | null {
    const state = this.requestState(accountId, id);
    if (state === "in-flight") {
      return refuse(
        409,
        GATEWAY_ERRORS.requestInFlight,
        "A call with this request id is still running.",
        "Wait for it; a new call needs a new X-Request-Id.",
      );
    }
    if (state === "settled") {
      return refuse(
        409,
        GATEWAY_ERRORS.requestSettled,
        "A call with this request id already ran; it is not run or replayed again.",
        "A real retry uses a new X-Request-Id.",
      );
    }
    return null;
  }

  private activeEntitlements(accountId: string, nowMs: number): EntitlementLine[] {
    const out: EntitlementLine[] = [];
    for (const line of this.subscriptions.values()) {
      const e = line.entitlement;
      // A price without credits is not a plan (Rule 2): it neither grants nor names one.
      if (e.accountId !== accountId || e.status === "canceled" || e.creditsPerPeriod < 1) continue;
      if (Date.parse(e.validFrom) > nowMs) continue;
      if (e.validUntil !== null && Date.parse(e.validUntil) <= nowMs) continue;
      out.push(line);
    }
    return out.sort((a, b) => b.entitlement.validFrom.localeCompare(a.entitlement.validFrom));
  }

  quota(accountId: string): QuotaStatus {
    const nowMs = this.clock.now();
    const current = quotaPeriod(nowMs);
    const active = this.activeEntitlements(accountId, nowMs);
    const fromPlans = active.reduce((sum, line) => sum + line.entitlement.creditsPerPeriod, 0);
    let reserved = 0;
    for (const held of this.open.values()) {
      if (held.account === accountId && held.period === current) reserved += held.credits;
    }
    return {
      period: current,
      granted: (this.grants.get(keyOf(accountId, current)) ?? 0) + fromPlans,
      used: this.used.get(keyOf(accountId, current)) ?? 0,
      reserved,
      resetsAt: periodResetsAt(current),
      plan: active[0]?.entitlement.plan ?? null,
    };
  }

  /** Holds `credits` before a call runs, or says why it may not run. */
  reserve(input: Omit<Reservation, "period" | "atMs">): Result<Reservation> | Refusal {
    const duplicate = this.duplicate(input.account, input.requestId);
    if (duplicate !== null) return duplicate;
    const quota = this.quota(input.account);
    const left = quota.granted - quota.used - quota.reserved;
    if (left <= 0 || input.credits > left) {
      return {
        ok: false,
        error: {
          code: GATEWAY_ERRORS.quotaExhausted,
          message:
            left <= 0
              ? "This account's allowance for the month is used up."
              : `This call may cost up to ${input.credits} credits; ${left} are left this month.`,
          hint: "Use your own key or a local model, subscribe, or wait for the reset.",
          resetsAt: quota.resetsAt,
        },
        status: 402,
      };
    }
    const nowMs = this.clock.now();
    const reservation: Reservation = { ...input, period: quota.period, atMs: nowMs };
    const written = this.write({
      t: "reserve",
      at: isoAt(nowMs),
      account: input.account,
      requestId: input.requestId,
      period: quota.period,
      purpose: input.purpose,
      upstream: input.upstream,
      model: input.model,
      credits: input.credits,
    });
    return written.ok ? ok(reservation) : written;
  }

  /**
   * Settles on the provider's usage (`credits` computed from it), or on the hold itself when the
   * provider reported none. Never more than the hold.
   */
  settle(
    held: Reservation,
    usage: { input: number | null; output: number | null; cached: number | null },
    creditsFromUsage: number | null,
    ms: number,
  ): Result<SettleLine> {
    const charged = creditsFromUsage === null ? "reserved" : "usage";
    const line: SettleLine = {
      t: "settle",
      v: 1,
      at: isoAt(this.clock.now()),
      purpose: held.purpose,
      scope: null,
      provider: held.upstream,
      model: held.model,
      input: usage.input,
      output: usage.output,
      cached: usage.cached,
      ms: Math.max(0, Math.min(86_400_000, Math.round(ms))),
      outcome: "done",
      account: held.account,
      requestId: held.requestId,
      period: held.period,
      credits: Math.min(held.credits, creditsFromUsage ?? held.credits),
      charged,
    };
    const written = this.write(line);
    return written.ok ? ok(line) : written;
  }

  release(held: Reservation, reason: ReleaseReason): Result<void> {
    return this.write({
      t: "release",
      at: isoAt(this.clock.now()),
      account: held.account,
      requestId: held.requestId,
      reason,
    });
  }

  /** Releases holds older than `capMs` that no live call owns (a crash, or a stream past its cap). */
  sweep(capMs: number, live: ReadonlySet<string>): number {
    const nowMs = this.clock.now();
    let released = 0;
    for (const held of [...this.open.values()]) {
      if (live.has(keyOf(held.account, held.requestId)) || nowMs - held.atMs < capMs) continue;
      if (this.release(held, "stale").ok) released += 1;
    }
    for (const [key, atMs] of this.spent) {
      if (nowMs - atMs >= REQUEST_DEDUP_MS) this.spent.delete(key);
    }
    return released;
  }

  openHolds(): Reservation[] {
    return [...this.open.values()];
  }

  grant(
    accountId: string,
    amount: number,
    forPeriod: string | null,
    source: "operator" | "verifier" = "operator",
    subject: string | null = null,
  ): Result<QuotaStatus> {
    const target = forPeriod ?? quotaPeriod(this.clock.now());
    if (subject !== null && this.subjects.has(`${subject}|${target}`)) {
      return err(
        "verifier-subject-used",
        "That address already unlocked an allowance this month.",
        "One address funds one account per period.",
      );
    }
    const written = this.write({
      t: "grant",
      at: isoAt(this.clock.now()),
      account: accountId,
      period: target,
      credits: amount,
      source,
      subject,
    });
    return written.ok ? ok(this.quota(accountId)) : written;
  }

  /** "applied" (it is the subscription's newest state), "older" (kept, but decides nothing), or "duplicate". */
  entitlement(event: Omit<EntitlementLine, "t" | "at">): Result<"applied" | "older" | "duplicate"> {
    if (this.events.has(`${event.provider}|${event.eventId}`)) return ok("duplicate");
    const line: EntitlementLine = { t: "entitlement", at: isoAt(this.clock.now()), ...event };
    const written = this.write(line);
    if (!written.ok) return written;
    const current = this.subscriptions.get(`${event.provider}|${event.subscription}`);
    return ok(current?.eventId === event.eventId ? "applied" : "older");
  }

  /** The provider's customer id for the account's newest subscription (the billing portal). */
  customerOf(accountId: string, provider: string): string | null {
    let best: EntitlementLine | null = null;
    for (const line of this.subscriptions.values()) {
      if (line.provider !== provider || line.entitlement.accountId !== accountId) continue;
      if (line.customer === null) continue;
      if (best === null || laterThan(line, best)) best = line;
    }
    return best?.customer ?? null;
  }

  entitlementOf(provider: string, subscription: string): EntitlementLine["entitlement"] | null {
    return this.subscriptions.get(`${provider}|${subscription}`)?.entitlement ?? null;
  }
}

/** A settle line as the `UsageRecord` it contains (what main's own ledger would hold). */
export function usageRecordOf(line: SettleLine): UsageRecord {
  const {
    v,
    at: when,
    purpose: why,
    scope,
    provider,
    model,
    input,
    output,
    cached,
    ms,
    outcome,
  } = line;
  return { v, at: when, purpose: why, scope, provider, model, input, output, cached, ms, outcome };
}

export { keyOf as requestKey };
