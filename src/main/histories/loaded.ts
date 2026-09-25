// One world's history as main holds it while it is open (rev 6 phase 3, D4, D11): the verified log
// (chain and receipt schedule from line 1), a fold of it with verdicts (from a trusted snapshot
// when there is one), the own outbox folded on top as pending, and the sync link. Every change goes
// through the functions here, under the caller's per-world lock, so the file and the fold never
// disagree.
//
// Appending admits first: an event is sequenced (local-only world) or queued (attached world) only
// when a tentative fold keeps it. What the fold would skip is returned as skipped, never written.

import { readEvent } from "@shared/history/event";
import {
  applyEntry,
  emptyNow,
  FOLD_VERSION,
  foldEntries,
  openGenesis,
  withPending,
} from "@shared/history/fold";
import { type LogCursor, type ReceiptKey, sequenceEvent, verifyLog } from "@shared/history/log";
import { signatureVerdict } from "@shared/history/sign";
import type {
  EntryVerdict,
  FoldSnapshot,
  GenesisEvent,
  HistoryEvent,
  LogEntry,
  PendingEvent,
  StoredEvent,
  VerdictEntry,
  WorldNow,
} from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { Skipped } from "@shared/worldApi";
import {
  appendLog,
  readLink,
  readLog,
  readOutbox,
  readSnapshot,
  type WorldLink,
  writeOutbox,
  writeSnapshot,
} from "./logStore";
import { worldDir } from "./paths";

/** Entries folded past the last snapshot before a new one is written (D4). */
export const SNAPSHOT_EVERY = 1000;

export type VerdictOf = (event: StoredEvent) => EntryVerdict;

export interface LoadedWorld {
  id: string;
  dir: string;
  genesis: GenesisEvent;
  owner: string;
  /** Every event id in the log, skipped ones included: what catch-up dedups against. */
  ids: Set<string>;
  cursor: LogCursor;
  schedule: ReceiptKey[];
  /** The fold the renderer starts from (null: from the genesis), and the entries after it. */
  base: FoldSnapshot | null;
  tail: VerdictEntry[];
  /** The sequenced fold. */
  now: WorldNow;
  outbox: PendingEvent[];
  link: WorldLink | null;
}

const LOG_HINT = "Restore this save from a backup; the history was not changed.";

/**
 * Opens a history directory: every line read and chained, every event's id and signature checked
 * (under a snapshot) or its whole verdict computed (after it), folded from a trusted snapshot if any.
 */
export async function loadWorld(
  histories: string,
  worldId: string,
  verdictOf: VerdictOf,
): Promise<Result<LoadedWorld>> {
  const dir = worldDir(histories, worldId);
  const entries = await readLog(dir);
  if (!entries.ok) return entries;
  const first = entries.value[0];
  if (first === undefined) return err("history-log-invalid", "The history is empty.", LOG_HINT);
  const genesis = openGenesis(first.event);
  if (!genesis.ok) return err("history-log-invalid", genesis.error.message, LOG_HINT);
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const check = verifyLog(worldId, entries.value);
  if (!check.ok) {
    return err(
      "history-log-invalid",
      `This world's history does not verify: ${check.error.message}`,
      LOG_HINT,
    );
  }
  // The chain binds ids, not bodies: a body edited on disk under its old id still chains. A
  // snapshot is trusted only while every entry under it still hashes to its id and verifies;
  // otherwise everything is refolded with full verdicts (the edited entry is then skipped).
  const snapshot = await readSnapshot(dir, worldId, entries.value);
  const intact = (entry: LogEntry): boolean => signatureVerdict(entry.event).ok;
  const base =
    snapshot !== null && entries.value.slice(0, snapshot.head.n).every(intact) ? snapshot : null;
  const tail = entries.value
    .slice(base?.head.n ?? 0)
    .map((entry) => ({ entry, verdict: verdictOf(entry.event) }));
  const now = foldEntries(base?.now ?? emptyNow(genesis.value), tail);
  const ids = new Set(entries.value.map((entry) => entry.event.id));
  const outbox = await readOutbox(dir);
  if (!outbox.ok) return outbox;
  const link = await readLink(dir);
  if (!link.ok) return link;
  const world: LoadedWorld = {
    id: worldId,
    dir,
    genesis: genesis.value,
    owner: genesis.value.author,
    ids,
    cursor: check.value.cursor,
    schedule: check.value.schedule,
    base,
    tail,
    now,
    outbox: outbox.value.map((event) => ({ event, verdict: verdictOf(event) })),
    link: link.value,
  };
  await dropSequenced(world);
  return ok(world);
}

/** Whether this world sequences itself on this device (never attached to a service). */
export function isLocalOnly(world: LoadedWorld): boolean {
  return world.link === null && world.now.sequencer === null;
}

/** The fold with the outbox on top, as if received at `rt` (D4 pending overlay). */
export function pendingNow(world: LoadedWorld, rt: string): WorldNow {
  return world.outbox.length === 0 ? world.now : withPending(world.now, world.outbox, rt);
}

/** Removes outbox events whose receipts are now in the log. */
export async function dropSequenced(world: LoadedWorld): Promise<void> {
  const left = world.outbox.filter((pending) => !world.ids.has(pending.event.id));
  if (left.length === world.outbox.length) return;
  world.outbox = left;
  await writeOutbox(
    world.dir,
    left.map((pending) => pending.event),
  );
}

/**
 * Appends entries already verified against `world.cursor` (from the service, or sequenced here),
 * with their verdicts (computed here unless the caller already has them).
 */
export async function appendVerified(
  world: LoadedWorld,
  entries: readonly LogEntry[] | readonly VerdictEntry[],
  schedule: ReceiptKey[],
  verdictOf: VerdictOf,
): Promise<VerdictEntry[]> {
  if (entries.length === 0) return [];
  const added = entries.map((one) =>
    "verdict" in one ? one : { entry: one, verdict: verdictOf(one.event) },
  );
  await appendLog(
    world.dir,
    added.map((one) => one.entry),
  );
  world.now = foldEntries(world.now, added);
  world.tail.push(...added);
  for (const { entry } of added) world.ids.add(entry.event.id);
  const last = added[added.length - 1]?.entry;
  if (last !== undefined) world.cursor = { n: last.n, chain: last.chain, rt: last.rt };
  world.schedule = schedule;
  await dropSequenced(world);
  if (world.tail.length >= SNAPSHOT_EVERY) await snapshotWorld(world);
  return added;
}

/** Writes the fold cache and starts a new tail after it. */
export async function snapshotWorld(world: LoadedWorld): Promise<void> {
  if (world.tail.length === 0) return;
  await writeSnapshot(world.dir, world.now);
  world.base = { foldVersion: FOLD_VERSION, head: world.now.head, now: world.now };
  world.tail = [];
}

export function skippedOf(event: StoredEvent, code: string, message: string): Skipped {
  const read = readEvent(event);
  if (!read.ok) return { what: "event", key: event.id, code, message };
  const e = read.value;
  switch (e.kind) {
    case "witness":
      return { what: "chunk", key: `${e.body.cx},${e.body.cz}`, code, message };
    case "place":
      return { what: "place", key: e.body.legacyId ?? e.body.title, code, message };
    case "chapter":
      return { what: "chapter", key: e.body.episodeId, code, message };
    case "story.more":
      return { what: "story.more", key: e.body.episode.id, code, message };
    default:
      return { what: e.kind, key: e.id, code, message };
  }
}

/** The code the fold would skip `event` under at `rt`, or null when it would keep it. */
function foldVerdict(
  now: WorldNow,
  entry: LogEntry,
  verdict: EntryVerdict,
): { next: WorldNow; code: string | null } {
  const next = applyEntry(now, entry, verdict);
  const skipped = next.ignored.length > now.ignored.length ? next.ignored.at(-1) : undefined;
  return { next, code: skipped === undefined ? null : skipped.code };
}

export interface Admitted {
  entries: VerdictEntry[];
  skipped: Skipped[];
  now: WorldNow;
}

/**
 * Sequences `events` after `from` with receipt times from `rtOf`, keeping only those a fold admits
 * (a refused one is skipped and does not take an n). Pure: nothing is written.
 */
export function sequenceAdmitted(
  now: WorldNow,
  from: LogCursor,
  events: readonly HistoryEvent[],
  rtOf: (event: HistoryEvent, previous: string | null) => string,
  verdictOf: VerdictOf,
): Admitted {
  const entries: VerdictEntry[] = [];
  const skipped: Skipped[] = [];
  let cursor = from;
  let current = now;
  for (const event of events) {
    const entry = sequenceEvent(cursor, event, rtOf(event, cursor.rt), null);
    const verdict = verdictOf(event);
    const { next, code } = foldVerdict(current, entry, verdict);
    if (code !== null) {
      skipped.push(skippedOf(event, code, `Not admitted: ${code}.`));
      continue;
    }
    entries.push({ entry, verdict });
    current = next;
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
  }
  return { entries, skipped, now: current };
}

/** A local-only world: sequences and appends what the fold admits, at `rt`. */
export async function commitLocal(
  world: LoadedWorld,
  events: readonly HistoryEvent[],
  rt: string,
  verdictOf: VerdictOf,
): Promise<{ added: VerdictEntry[]; skipped: Skipped[] }> {
  const admitted = sequenceAdmitted(world.now, world.cursor, events, () => rt, verdictOf);
  const added = await appendVerified(world, admitted.entries, world.schedule, verdictOf);
  return { added, skipped: admitted.skipped };
}

/** An attached world: queues what the pending overlay admits, for the service to sequence. */
export async function enqueue(
  world: LoadedWorld,
  events: readonly HistoryEvent[],
  rt: string,
  verdictOf: VerdictOf,
): Promise<{ queued: PendingEvent[]; skipped: Skipped[] }> {
  const queued: PendingEvent[] = [];
  const skipped: Skipped[] = [];
  for (const event of events) {
    if (world.ids.has(event.id) || world.outbox.some((one) => one.event.id === event.id)) continue;
    const pending = { event, verdict: verdictOf(event) };
    const before = pendingNow(world, rt);
    const after = withPending(world.now, [...world.outbox, pending], rt);
    const refused = after.ignored.find((one) => one.pending && one.id === event.id);
    if (refused !== undefined || before.pending === after.pending) {
      const code = refused?.code ?? "event-refused";
      skipped.push(skippedOf(event, code, `Not admitted: ${code}.`));
      continue;
    }
    world.outbox.push(pending);
    queued.push(pending);
  }
  if (queued.length > 0) {
    await writeOutbox(
      world.dir,
      world.outbox.map((pending) => pending.event),
    );
  }
  return { queued, skipped };
}
