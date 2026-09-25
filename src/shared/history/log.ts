// The sequenced log (rev 6 phase 3, D2, D5 step 3): line n of `log.jsonl` is entry n, chained from
// the world id. A broken chain, an entry out of order, a receipt time going backwards or a receipt
// that does not verify means the log itself is wrong — main stops syncing that world
// (`history-diverged`) rather than folding it. An event that fails its own checks is different: it
// stays in the log (the chain needs it) and the fold skips it.
//
// Receipts (D2, exact): rsig(n) = base64url(Ed25519(K, "unmapped-receipt:v1\n" + chain(n))).
// Let s1 < s2 < … be the n of the log's admitted `sequencer` entries (the owner's, verified, first
// of each id); si installs Ki = its body.key. No sequencer entry: every rsig is null (a local-only
// world). n < s2 (every n when there is only s1): K1, which covers the uploaded prefix 1..s1 that
// attach re-receipts. si ≤ n < si+1: Ki. Once a log has s1, no rsig in it is null.

import { z } from "zod";
import { err, ok, type Result } from "../result";
import { readEvent, storedEventSchema } from "./event";
import { CHAIN, chainNext, ISO_TIME, SIGNATURE, timeMs } from "./ids";
import { signReceipt, verifyEvent, verifyReceipt } from "./sign";
import type { LogEntry, StoredEvent } from "./types";

/** Where a log stands: chain(0) is the world id, and there is no receipt time before entry 1. */
export interface LogCursor {
  n: number;
  chain: string;
  rt: string | null;
}

export function logStart(world: string): LogCursor {
  return { n: 0, chain: world, rt: null };
}

export const logEntrySchema: z.ZodType<LogEntry> = z.strictObject({
  n: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  rt: z
    .string()
    .regex(ISO_TIME)
    .refine((text) => Number.isFinite(Date.parse(text)), "must be a real time"),
  chain: z.string().regex(CHAIN),
  event: storedEventSchema,
  rsig: z.string().regex(SIGNATURE).nullable(),
});

export function readEntry(raw: unknown): Result<LogEntry> {
  const parsed = logEntrySchema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  return err(
    "entry-invalid",
    `Log entry ${issue?.path.join(".") || "line"}: ${issue?.message ?? "invalid"}`,
  );
}

/** One line of `log.jsonl` (or of a restored copy). */
export function readLogLine(line: string): Result<LogEntry> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return err("entry-invalid", "A log line is not JSON.");
  }
  return readEntry(raw);
}

/** One step of the receipt schedule: entry `n` (a `sequencer` event with this `id`) installs `key`. */
export interface ReceiptKey {
  n: number;
  id: string;
  key: string;
}

/**
 * The key a `sequencer` entry installs, when it counts: it reads, verifies, belongs to `world`, was
 * written by `owner` and claims to have seen only earlier entries — what `admit` requires of it.
 */
export function sequencerKeyOf(entry: LogEntry, world: string, owner: string): string | null {
  const read = readEvent(entry.event);
  if (!read.ok || read.value.kind !== "sequencer") return null;
  const event = read.value;
  if (event.world !== world || event.author !== owner || event.seen >= entry.n) return null;
  return verifyEvent(event).ok ? event.body.key : null;
}

/**
 * D2: the receipt schedule of `entries`, continuing `known` (the schedule of the entries before
 * them). A repeated sequencer event (same id) installs nothing.
 */
export function receiptSchedule(
  world: string,
  owner: string,
  entries: readonly LogEntry[],
  known: readonly ReceiptKey[] = [],
): ReceiptKey[] {
  const schedule = [...known];
  for (const entry of entries) {
    if (schedule.some((step) => step.id === entry.event.id)) continue;
    const key = sequencerKeyOf(entry, world, owner);
    if (key !== null) schedule.push({ n: entry.n, id: entry.event.id, key });
  }
  return schedule;
}

/** The key entry `n`'s receipt must verify with, or null when the log has no sequencer. */
export function receiptKeyAt(schedule: readonly ReceiptKey[], n: number): string | null {
  let key: string | null = schedule[0]?.key ?? null;
  for (const step of schedule.slice(1)) if (step.n <= n) key = step.key;
  return key;
}

/**
 * D5 step 3: `entry` follows `previous` — the next n, a receipt time not before the previous one,
 * the chain recomputed, and a receipt that verifies with `receiptKey` (`receiptKeyAt`), or none
 * at all when that is null. Returns the cursor after it.
 */
export function verifyEntry(
  previous: LogCursor,
  entry: LogEntry,
  receiptKey: string | null,
): Result<LogCursor> {
  if (entry.n !== previous.n + 1) {
    return err("entry-out-of-order", `Entry ${entry.n} does not follow entry ${previous.n}.`);
  }
  const at = timeMs(entry.rt);
  if (!Number.isFinite(at)) return err("entry-rt-invalid", `Entry ${entry.n} has no receipt time.`);
  if (previous.rt !== null && at < timeMs(previous.rt)) {
    return err("entry-rt-backwards", `Entry ${entry.n} was received before entry ${previous.n}.`);
  }
  if (entry.chain !== chainNext(previous.chain, entry.n, entry.rt, entry.event.id)) {
    return err("entry-chain-broken", `Entry ${entry.n} does not chain onto entry ${previous.n}.`);
  }
  if (receiptKey === null) {
    if (entry.rsig !== null) {
      return err("entry-rsig-unexpected", `Entry ${entry.n} carries a receipt nobody pinned.`);
    }
  } else if (entry.rsig === null || !verifyReceipt(receiptKey, entry.chain, entry.rsig)) {
    return err("entry-rsig-invalid", `Entry ${entry.n} is not signed by the world's service.`);
  }
  return ok({ n: entry.n, chain: entry.chain, rt: entry.rt });
}

export interface LogCheck {
  cursor: LogCursor;
  schedule: ReceiptKey[];
}

/**
 * Every entry in order: the receipt schedule first (from the `sequencer` entries), then each
 * entry against it. From the start, `entries[0]` must be the genesis (its author is the owner).
 * Continuing from `from`, pass the `owner` and the `schedule` so far. A batch that installs the
 * first key (s1) re-receipts everything before it: verify the whole log again from the start.
 */
export function verifyLog(
  world: string,
  entries: readonly LogEntry[],
  options: { from?: LogCursor; owner?: string; schedule?: readonly ReceiptKey[] } = {},
): Result<LogCheck> {
  const from = options.from ?? logStart(world);
  let owner = options.owner;
  if (owner === undefined) {
    const first = entries[0];
    const genesis = first?.n === 1 && first.event.id === world ? readEvent(first.event) : null;
    if (genesis === null || !genesis.ok || genesis.value.kind !== "genesis") {
      return err("log-no-genesis", "The log does not start with its world's genesis.");
    }
    owner = genesis.value.author;
  }
  if ((options.schedule?.length ?? 0) === 0 && from.n > 0) {
    const installs = entries.some((entry) => sequencerKeyOf(entry, world, owner) !== null);
    if (installs) {
      return err("log-attach-partial", "This batch attaches the world; verify the whole log.");
    }
  }
  const schedule = receiptSchedule(world, owner, entries, options.schedule ?? []);
  let cursor = from;
  for (const entry of entries) {
    const next = verifyEntry(cursor, entry, receiptKeyAt(schedule, entry.n));
    if (!next.ok) return next;
    cursor = next.value;
  }
  return ok({ cursor, schedule });
}

/**
 * What a sequencer appends: the next n, a receipt time clamped so it never goes backwards, the
 * chain, and its receipt (null for a local-only world's own device).
 */
export function sequenceEvent(
  previous: LogCursor,
  event: StoredEvent,
  rt: string,
  secretKey: Uint8Array | null,
): LogEntry {
  const received = previous.rt !== null && timeMs(rt) < timeMs(previous.rt) ? previous.rt : rt;
  const n = previous.n + 1;
  const chain = chainNext(previous.chain, n, received, event.id);
  return {
    n,
    rt: received,
    chain,
    event,
    rsig: secretKey === null ? null : signReceipt(secretKey, chain),
  };
}

/** Attach (D9): the same entry with the service's receipt; every other byte is unchanged. */
export function withReceipt(entry: LogEntry, secretKey: Uint8Array): LogEntry {
  return { ...entry, rsig: signReceipt(secretKey, entry.chain) };
}
