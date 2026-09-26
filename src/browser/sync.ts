// Syncing a joined world from the page (rev 6 phase 4, D7, the device side of P3 D9 and D11):
// "after my n, with a chain check", exactly as main does (main/histories/syncWorld.ts). On a ready
// socket the page opens every world it holds there with its head; every pushed entry is verified
// against this device's chain and receipt schedule (`verifyLog`) before it is stored and folded
// with its verdict. A service whose history is not this device's stops the sync for that world
// (`history-diverged`, kept in its record), and nothing is ever merged silently.
//
// The outbox is (re)submitted whenever the world opens and whenever an event is queued; a
// duplicate submit is harmless (ids are content addresses). A `rejected` own event leaves the
// outbox for the record's refused list, where it stays until the player dismisses it; so does the
// whole outbox when the service says this key was removed (`access-removed`, D8, as main does).
// The record keeps that removal, so the page signs nothing more until the service opens the world
// again.

import { foldEntries } from "@shared/history/fold";
import { verifyLog } from "@shared/history/log";
import { ownershipOf } from "@shared/history/owners";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import type { AppError } from "@shared/result";
import type { LinkState } from "@shared/worldApi";
import { FRAME_LIMITS, type FromService, WORLD_PROTOCOL } from "@shared/worldProtocol";
import { emitEntries, emitStatus, type Host, type LiveWorld, removalOf, verdictsOf } from "./live";
import { ensurePack, makeRoom } from "./packs";
import type { WorldRecord } from "./store";

const DIVERGED_HINT =
  "Sync with this service stopped so nothing merges silently. Ask the world's owner which history is right.";

/** Refusals that end the link whatever state it is in (as main's `refusalEndsLink`). */
const LINK_ENDING: ReadonlySet<string> = new Set([
  "history-diverged",
  "physics-newer",
  "access-removed",
  "access-private",
  "access-members-only",
  "world-unknown",
  "protocol-unsupported",
  "protocol-newer",
]);

function setLink(world: LiveWorld, link: LinkState, error: AppError | null): void {
  world.link = link;
  world.error = error;
}

/** Wants the world's socket and opens the world once it is ready. */
export function startSync(host: Host, world: LiveWorld): void {
  if (world.record.diverged !== null) return;
  host.hub.want(world.record.url, world.record.id);
  if (host.hub.state(world.record.url) === "ready") sendOpen(host, world);
  else setLink(world, "connecting", world.error);
}

export function stopSync(host: Host, world: LiveWorld): void {
  host.hub.send(world.record.url, { t: "close", world: world.record.id });
  host.hub.unwant(world.record.url, world.record.id);
  setLink(world, world.record.diverged === null ? "offline" : "diverged", world.error);
}

export function sendOpen(host: Host, world: LiveWorld): void {
  const sent = host.hub.send(world.record.url, {
    t: "open",
    world: world.record.id,
    have: world.cursor.n,
    chain: world.cursor.n === 0 ? null : world.cursor.chain,
    protocol: WORLD_PROTOCOL,
    physics: [...PHYSICS_SUPPORTED],
  });
  setLink(world, sent.ok ? "connecting" : "offline", sent.ok ? null : world.error);
}

/** Sends the whole outbox (in frames of at most 16 events) when the world is online. */
export function submitOutbox(host: Host, world: LiveWorld): void {
  if (world.link !== "online" || world.outbox.length === 0) return;
  const events = world.outbox.map((pending) => pending.event);
  for (let at = 0; at < events.length; at += FRAME_LIMITS.submitEvents) {
    const chunk = events.slice(at, at + FRAME_LIMITS.submitEvents);
    host.hub.send(world.record.url, { t: "submit", world: world.record.id, events: chunk });
  }
}

async function diverge(host: Host, world: LiveWorld, why: string): Promise<void> {
  const error: AppError = { code: "history-diverged", message: why, hint: DIVERGED_HINT };
  world.record = { ...world.record, diverged: error };
  await host.store.putWorld(world.record);
  host.hub.unwant(world.record.url, world.record.id);
  setLink(world, "diverged", error);
  await emitStatus(host, world);
}

async function onOpened(
  host: Host,
  world: LiveWorld,
  frame: Extract<FromService, { t: "opened" }>,
) {
  if (frame.genesis.id !== world.record.id) {
    await diverge(host, world, "The service opened another world under this world's id.");
    return;
  }
  if (frame.head.n < world.cursor.n) {
    await diverge(host, world, "The service has less of this world's history than this device.");
    return;
  }
  if (frame.head.n === world.cursor.n && frame.head.chain !== world.cursor.chain) {
    await diverge(host, world, "The service's history ends on another chain than this device's.");
    return;
  }
  // The service serves this key again: whatever removal it said before no longer holds.
  let kept: AppError | null = null;
  if (removalOf(world) !== null) {
    world.record = { ...world.record, removed: null };
    const put = await host.store.putWorld(world.record);
    if (!put.ok) kept = put.error;
  }
  setLink(world, "online", kept);
  await emitStatus(host, world);
  submitOutbox(host, world);
  void ensurePack(host, world);
}

/** Verifies and keeps the entries after this device's head; returns whether any were new. */
export async function receiveEntries(
  host: Host,
  world: LiveWorld,
  frame: Extract<FromService, { t: "entries" }>,
): Promise<boolean> {
  const fresh = frame.entries.filter((entry) => entry.n > world.cursor.n);
  if (fresh.length === 0) {
    if (frame.head.n < world.cursor.n) {
      await diverge(host, world, "The service has less of this world's history than this device.");
    }
    return false;
  }
  if (fresh[0]?.n !== world.cursor.n + 1) {
    sendOpen(host, world);
    return false;
  }
  const check =
    world.cursor.n === 0
      ? verifyLog(world.record.id, fresh)
      : verifyLog(world.record.id, fresh, {
          from: world.cursor,
          ownership: ownershipOf(world.now),
          schedule: world.schedule,
        });
  if (!check.ok) {
    await diverge(
      host,
      world,
      `The service's entries do not follow this device's: ${check.error.message}`,
    );
    return false;
  }
  const stored = await host.store.appendLog(world.record.id, fresh);
  if (!stored.ok) {
    setLink(world, world.link, stored.error);
    await emitStatus(host, world);
    return false;
  }
  const added = verdictsOf(fresh);
  world.now = foldEntries(world.now, added);
  world.cursor = check.value.cursor;
  world.schedule = check.value.schedule;
  const sequenced = new Set(fresh.map((entry) => entry.event.id));
  const left = world.outbox.filter((pending) => !sequenced.has(pending.event.id));
  if (left.length !== world.outbox.length) {
    world.outbox = left;
    await host.store.writeOutbox(
      world.record.id,
      left.map((pending) => pending.event),
    );
  }
  emitEntries(host, world, added);
  await emitStatus(host, world);
  await makeRoom(host, 0);
  return true;
}

/**
 * Moves the outbox events `which` picks to the record's refused list with `error`, where they stay
 * listed until the player dismisses them (Rule 2), writing `record` (the world's record, or it with
 * a change) and the outbox that is left in one transaction. Memory follows even if the write
 * fails, and the storage error is shown: the service refuses them again on the next open.
 */
async function refuseQueued(
  host: Host,
  world: LiveWorld,
  which: (id: string) => boolean,
  error: AppError,
  record: WorldRecord = world.record,
): Promise<void> {
  const moved = world.outbox.filter((one) => which(one.event.id));
  if (moved.length === 0 && record === world.record) return;
  const at = host.nowIso();
  const refused = [...record.refused, ...moved.map((one) => ({ event: one.event, error, at }))];
  world.record = { ...record, refused };
  world.outbox = world.outbox.filter((one) => !which(one.event.id));
  const put = await host.store.putWorldAndOutbox(
    world.record,
    world.outbox.map((one) => one.event),
  );
  if (!put.ok) setLink(world, world.link, put.error);
  emitEntries(host, world, []);
  await emitStatus(host, world);
}

function onRejected(host: Host, world: LiveWorld, frame: Extract<FromService, { t: "rejected" }>) {
  return refuseQueued(host, world, (id) => id === frame.id, frame.error);
}

/**
 * D8: the service removed this key. Nothing it queued can ever be sequenced, so all of it is
 * refused now rather than left waiting for good, and the record keeps the removal, which stops
 * `append` before it signs, until the service opens the world again.
 */
async function onRemoved(host: Host, id: string, error: AppError): Promise<void> {
  const world = host.worlds.get(id);
  if (world === undefined) return;
  await refuseQueued(host, world, () => true, error, { ...world.record, removed: error });
}

/** Every frame from `url`; frames for worlds this page does not hold are ignored. */
export async function onFrame(host: Host, url: string, frame: FromService): Promise<void> {
  if (frame.t === "challenge" || frame.t === "claimed") return;
  if (frame.t === "refused") {
    for (const world of host.worlds.values()) {
      if (world.record.url !== url || (frame.world !== "" && frame.world !== world.record.id)) {
        continue;
      }
      const ends = LINK_ENDING.has(frame.error.code) || world.link !== "online";
      setLink(world, ends ? "refused" : world.link, frame.error);
      if (frame.error.code === "access-removed") {
        const id = world.record.id;
        await host.serial(id, () => onRemoved(host, id, frame.error));
      } else await emitStatus(host, world);
    }
    return;
  }
  const world = host.worlds.get(frame.world);
  if (world === undefined || world.record.url !== url) return;
  if (frame.t === "presence") {
    host.emitPresence({ world: frame.world, from: frame.from, p: frame.p });
    return;
  }
  if (frame.t === "stream") {
    const { t: _t, ...event } = frame;
    host.emitStream(event);
    return;
  }
  await host.serial(frame.world, async () => {
    const current = host.worlds.get(frame.world);
    if (current === undefined || current.record.diverged !== null) return;
    if (frame.t === "opened") await onOpened(host, current, frame);
    else if (frame.t === "entries") await receiveEntries(host, current, frame);
    else if (frame.t === "rejected") await onRejected(host, current, frame);
  });
}

/** A socket is authenticated: open every world held over it. */
export function onReady(host: Host, url: string): void {
  for (const world of host.worlds.values()) {
    if (world.record.url === url && world.record.diverged === null) sendOpen(host, world);
  }
}

export function onDown(host: Host, url: string, error: AppError, fatal: boolean): void {
  for (const world of host.worlds.values()) {
    if (world.record.url !== url || world.link === "diverged") continue;
    setLink(world, fatal ? "refused" : "offline", fatal ? error : null);
    void emitStatus(host, world);
  }
}
