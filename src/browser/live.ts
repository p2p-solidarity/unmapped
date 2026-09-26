// One joined world as the page holds it while it is open (rev 6 phase 4, D7, over P3 D4 and D11):
// its record, the verified log's cursor and receipt schedule, the fold of every entry with its
// verdict (`entryVerdict`: read, id, signature, DSL body), and the own outbox. Loading re-verifies
// the whole log from IndexedDB — the device is untrusted storage too — and a log that no longer
// verifies is an error, never folded. A log the LRU dropped loads as the bare genesis; the next sync
// fetches it again from the start.

import { entryVerdict } from "@dsl/history/verdict";
import { roleOf } from "@shared/history/access";
import { emptyNow, foldEntries, newerCount, openGenesis, withPending } from "@shared/history/fold";
import { type LogCursor, logStart, type ReceiptKey, verifyLog } from "@shared/history/log";
import type { GenesisEvent, PendingEvent, VerdictEntry, WorldNow } from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import { type AppError, err, ok, type Result } from "@shared/result";
import type {
  LinkState,
  WorldEntriesEvent,
  WorldPresenceEvent,
  WorldRole,
  WorldStatus,
  WorldStreamEvent,
} from "@shared/worldApi";
import type { BrowserSigner } from "./signer";
import type { SocketHub } from "./socket";
import type { BrowserStore, WorldRecord } from "./store";

export interface LiveWorld {
  record: WorldRecord;
  genesis: GenesisEvent;
  cursor: LogCursor;
  schedule: ReceiptKey[];
  /** The sequenced fold. */
  now: WorldNow;
  outbox: PendingEvent[];
  link: LinkState;
  /** The latest link or advisory error (a refused frame, a pack that did not arrive). */
  error: AppError | null;
}

/** What the sync, join and append code share: storage, sockets, the key, and the listeners. */
export interface Host {
  store: BrowserStore;
  hub: SocketHub;
  signer(): Promise<Result<BrowserSigner>>;
  worlds: Map<string, LiveWorld>;
  /** Runs `body` after every earlier call for the same world (IndexedDB writes stay in order). */
  serial<T>(world: string, body: () => Promise<T>): Promise<T>;
  emitEntries(event: WorldEntriesEvent): void;
  emitStatus(status: WorldStatus): void;
  emitPresence(event: WorldPresenceEvent): void;
  emitStream(event: WorldStreamEvent): void;
  nowIso(): string;
}

const LOG_HINT =
  "Clear this site's data and join again from the invite, or open the world on the desktop.";

export async function loadLive(host: Host, record: WorldRecord): Promise<Result<LiveWorld>> {
  const genesis = openGenesis(record.genesis);
  if (!genesis.ok) return err("history-log-invalid", genesis.error.message, LOG_HINT);
  if (genesis.value.id !== record.id) {
    return err("history-log-invalid", "The stored genesis is not this world's.", LOG_HINT);
  }
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const entries = await host.store.readLog(record.id);
  if (!entries.ok) return entries;
  let cursor = logStart(record.id);
  let schedule: ReceiptKey[] = [];
  let now = emptyNow(genesis.value);
  if (entries.value.length > 0) {
    const check = verifyLog(record.id, entries.value);
    if (!check.ok) {
      return err(
        "history-log-invalid",
        `This world's history on this device does not verify: ${check.error.message}`,
        LOG_HINT,
      );
    }
    cursor = check.value.cursor;
    schedule = check.value.schedule;
    now = foldEntries(now, verdictsOf(entries.value));
  }
  const outbox = await host.store.readOutbox(record.id);
  if (!outbox.ok) return outbox;
  const ids = new Set(Object.keys(now.events));
  return ok({
    record,
    genesis: genesis.value,
    cursor,
    schedule,
    now,
    outbox: outbox.value
      .filter((event) => !ids.has(event.id))
      .map((event) => ({ event, verdict: entryVerdict(event) })),
    link: record.diverged === null ? "offline" : "diverged",
    error: record.diverged,
  });
}

export function verdictsOf(entries: readonly VerdictEntry["entry"][]): VerdictEntry[] {
  return entries.map((entry) => ({ entry, verdict: entryVerdict(entry.event) }));
}

/** The fold with the outbox on top, as if received at `rt` (D4 pending overlay). */
export function pendingNow(world: LiveWorld, rt: string): WorldNow {
  return world.outbox.length === 0 ? world.now : withPending(world.now, world.outbox, rt);
}

/**
 * D8: the service's word that it removed this key, until it opens the world again. The fold cannot
 * say so: this device's copy ends before its own `member.remove`.
 */
export function removalOf(world: LiveWorld): AppError | null {
  return world.record.removed ?? null;
}

export function statusOf(world: LiveWorld, me: Result<BrowserSigner>): WorldStatus {
  const removal = removalOf(world);
  const role: WorldRole = !me.ok
    ? "visitor"
    : removal !== null
      ? "removed"
      : roleOf(world.now, me.value.author);
  const writable =
    me.ok &&
    world.link !== "diverged" &&
    role !== "removed" &&
    (role === "owner" || role === "member" || world.now.access === "public");
  return {
    world: world.record.id,
    link: world.link,
    url: world.record.url,
    role,
    writable,
    head: world.now.head,
    pending: world.outbox.length,
    refused: world.record.refused.length,
    ignored: world.now.ignored.length,
    newer: newerCount(world.now),
    error: world.error ?? removal ?? (me.ok ? null : me.error),
    me: me.ok ? me.value.author : null,
  };
}

export async function emitStatus(host: Host, world: LiveWorld): Promise<void> {
  host.emitStatus(statusOf(world, await host.signer()));
}

export function emitEntries(
  host: Host,
  world: LiveWorld,
  entries: VerdictEntry[],
  reset = false,
): void {
  host.emitEntries({
    world: world.record.id,
    entries,
    pending: world.outbox,
    head: world.now.head,
    reset,
  });
}
