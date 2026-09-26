// Syncing an attached world (rev 6 phase 3, D9, D11): "after my n, with a chain check". On a ready
// socket main opens every world it syncs there with its head; the service answers `opened` and then
// pushes `entries`. Every entry is verified against this device's chain and receipt schedule
// before it is appended — a service whose history is not this device's (less of it, another chain,
// a receipt that does not verify) stops the sync for that world with `history-diverged`, persisted
// in link.json. Nothing is ever merged silently, and the local log is never rewritten here.
//
// The outbox is (re)submitted whenever the world opens and whenever an event is queued; a duplicate
// submit is harmless (ids are content addresses). A `rejected` own event moves from the outbox to
// refused.jsonl, where it stays listed until the player dismisses it; so does the whole outbox when
// the service says this key was removed (`access-removed`, D8). Every time the world comes
// online, the packs this device announced and the service has not confirmed go up (./workPacks).

import { verifyLog } from "@shared/history/log";
import { ownershipOf } from "@shared/history/owners";
import type { StoredEvent } from "@shared/history/types";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import { type AppError, err, ok, type Result } from "@shared/result";
import {
  type LinkState,
  WORLD_IPC,
  type WorldPresenceEvent,
  type WorldStreamEvent,
} from "@shared/worldApi";
import { type FromService, WORLD_PROTOCOL } from "@shared/worldProtocol";
import type { HostCore } from "./core";
import { appendVerified, type LoadedWorld } from "./loaded";
import { appendRefused, writeLink, writeOutbox } from "./logStore";
import { receiveWorks } from "./receive";
import { framesOf, SUBMIT_BATCH } from "./sync";
import { uploadOwnPacks } from "./workPacks";

const DIVERGED_HINT =
  "Sync with this service stopped so nothing merges silently. Keep playing here; ask the world's owner which history is right.";

function urlOf(world: LoadedWorld): string | null {
  return world.link?.url ?? world.now.sequencer?.url ?? null;
}

/**
 * Starts syncing `world` (it must be attached): wants its socket and opens it once ready. A world
 * already open or opening on that socket is left alone — every `read` calls this, and opening again
 * would flip an online link back to "connecting" (a claim then answers `claim-offline`) and spend
 * the connection's frame budget.
 */
export function startSync(core: HostCore, world: LoadedWorld): void {
  const url = urlOf(world);
  if (url === null || world.link?.diverged != null) return;
  const info = core.sync.get(world.id);
  core.hub.want(url, world.id);
  if (info?.url === url && (info.link === "online" || info.link === "connecting")) return;
  if (info === undefined) core.setSync(world.id, { url, link: "connecting", error: null });
  if (core.hub.state(url) === "ready") sendOpen(core, world);
}

export function stopSync(core: HostCore, world: LoadedWorld): void {
  const url = urlOf(world);
  core.sync.delete(world.id);
  if (url === null) return;
  core.hub.send(url, { t: "close", world: world.id });
  core.hub.unwant(url, world.id);
}

export function sendOpen(core: HostCore, world: LoadedWorld): void {
  const url = urlOf(world);
  if (url === null) return;
  const sent = core.hub.send(url, {
    t: "open",
    world: world.id,
    have: world.cursor.n,
    chain: world.cursor.n === 0 ? null : world.cursor.chain,
    protocol: WORLD_PROTOCOL,
    physics: [...PHYSICS_SUPPORTED],
  });
  core.setSync(world.id, {
    url,
    link: sent.ok ? "connecting" : "offline",
    error: sent.ok ? null : sent.error,
  });
}

/** Sends `events` (default: the whole outbox) when the world is online. */
export function submit(core: HostCore, world: LoadedWorld, events?: readonly StoredEvent[]): void {
  const url = urlOf(world);
  const info = core.sync.get(world.id);
  if (url === null || info?.link !== "online") return;
  const list = events ?? world.outbox.map((pending) => pending.event);
  if (list.length === 0) return;
  const frames = framesOf(list, SUBMIT_BATCH, (chunk) => ({
    t: "submit",
    world: world.id,
    events: chunk,
  }));
  if (!frames.ok) return;
  for (const frame of frames.value) core.hub.send(url, frame);
}

/** Stops syncing with `history-diverged`; persisted so a restart does not resume silently. */
async function diverge(core: HostCore, world: LoadedWorld, why: string): Promise<void> {
  const error: AppError = { code: "history-diverged", message: why, hint: DIVERGED_HINT };
  if (world.link !== null) {
    world.link = { ...world.link, diverged: error };
    await writeLink(world.dir, world.link);
  }
  const url = urlOf(world);
  if (url !== null) core.hub.unwant(url, world.id);
  core.setSync(world.id, { url: url ?? "", link: "diverged", error });
  await core.emitStatus(world);
}

async function onOpened(
  core: HostCore,
  world: LoadedWorld,
  frame: Extract<FromService, { t: "opened" }>,
): Promise<void> {
  if (frame.genesis.id !== world.id) {
    await diverge(core, world, "The service opened another world under this world's id.");
    return;
  }
  if (frame.head.n < world.cursor.n) {
    await diverge(core, world, "The service has less of this world's history than this device.");
    return;
  }
  if (frame.head.n === world.cursor.n && frame.head.chain !== world.cursor.chain) {
    await diverge(
      core,
      world,
      "The service's history ends on a different chain than this device's.",
    );
    return;
  }
  const url = urlOf(world) ?? "";
  // The service serves this device again: whatever removal it said before no longer holds.
  core.removals.delete(world.id);
  core.setSync(world.id, { url, link: "online", error: null });
  await core.emitStatus(world);
  submit(core, world);
  // Packs this device announced while offline (an otherworld placed, a cartridge pack that failed
  // at attach) go up now; in the background, so the world's lock is not held for the upload.
  if (url !== "") void uploadOwnPacks(core, world, url);
}

async function onEntries(
  core: HostCore,
  world: LoadedWorld,
  frame: Extract<FromService, { t: "entries" }>,
): Promise<void> {
  const fresh = frame.entries.filter((entry) => entry.n > world.cursor.n);
  if (fresh.length === 0) {
    if (frame.head.n < world.cursor.n) {
      await diverge(core, world, "The service has less of this world's history than this device.");
    }
    return;
  }
  if (fresh[0]?.n !== world.cursor.n + 1) {
    sendOpen(core, world);
    return;
  }
  // Co-owners (phase 4, D5): the batch's sequencers count by who owns the world at the cursor.
  const check = verifyLog(world.id, fresh, {
    from: world.cursor,
    ownership: ownershipOf(world.now),
    schedule: world.schedule,
  });
  if (!check.ok) {
    await diverge(
      core,
      world,
      `The service's entries do not follow this device's: ${check.error.message}`,
    );
    return;
  }
  const added = await appendVerified(world, fresh, check.value.schedule, core.verdictOf);
  core.emitEntries(world, added);
  await core.emitStatus(world);
  void receiveWorks(core, world);
}

/**
 * Moves the outbox events `which` picks to refused.jsonl with `error`, where they stay listed until
 * the player dismisses them (Rule 2), and tells the renderer. Under the world's lock.
 */
async function refuseQueued(
  core: HostCore,
  world: LoadedWorld,
  which: (id: string) => boolean,
  error: AppError,
): Promise<void> {
  const refused = world.outbox.filter((one) => which(one.event.id));
  if (refused.length === 0) return;
  const at = core.nowIso();
  world.outbox = world.outbox.filter((one) => !which(one.event.id));
  await appendRefused(
    world.dir,
    refused.map((one) => ({ event: one.event, error, at })),
  );
  await writeOutbox(
    world.dir,
    world.outbox.map((one) => one.event),
  );
  core.emitEntries(world, []);
  await core.emitStatus(world);
}

function onRejected(
  core: HostCore,
  world: LoadedWorld,
  frame: Extract<FromService, { t: "rejected" }>,
): Promise<void> {
  return refuseQueued(core, world, (id) => id === frame.id, frame.error);
}

/**
 * Refusals that end this device's link to a world whatever state it is in: divergence, physics,
 * a removal, a world or protocol the service does not have.
 */
const LINK_ENDING: ReadonlySet<string> = new Set([
  "history-diverged",
  "physics-newer",
  "access-removed",
  "world-unknown",
  "protocol-unsupported",
  "protocol-newer",
]);

/**
 * Whether a `refused` frame ends the link. Before a world is open, a refusal is the door answering
 * `open` (access, invites, quotas on open) and does. Once it is online, any other refusal is about
 * one frame — a claim the door refused, a stream without its lease (`stream-no-lease`,
 * `lease-expired`), a presence or stream quota — and the link stays up.
 */
export function refusalEndsLink(code: string, link: LinkState | undefined): boolean {
  return LINK_ENDING.has(code) || link !== "online";
}

/** Every frame for a world this device syncs; frames for other worlds are ignored. */
export async function onFrame(core: HostCore, url: string, frame: FromService): Promise<void> {
  if (frame.t === "challenge" || frame.t === "claimed") return;
  if (frame.t === "refused") {
    const worlds = [...core.sync.entries()].filter(
      ([id, info]) => info.url === url && (frame.world === "" || id === frame.world),
    );
    for (const [id, info] of worlds) {
      const ends = refusalEndsLink(frame.error.code, info.link);
      if (!ends) {
        console.warn(`[world] ${id.slice(0, 12)}… refused one frame: ${frame.error.code}`);
      }
      // An advisory refusal is surfaced in the status's error; the link stays as it is.
      core.setSync(id, { ...info, link: ends ? "refused" : info.link, error: frame.error });
      // D8: a removed key's queued events can never be sequenced, so they are refused now rather
      // than left waiting for good.
      if (frame.error.code === "access-removed") {
        core.removals.set(id, frame.error);
        await core.withWorld(id, async (world) => {
          await refuseQueued(core, world, () => true, frame.error);
          return ok(undefined);
        });
      }
      const world = core.worlds.get(id);
      if (world !== undefined) await core.emitStatus(world);
    }
    return;
  }
  if (core.sync.get(frame.world)?.url !== url) return;
  if (frame.t === "stream") {
    const { t: _t, ...event } = frame;
    core.deps.broadcast(WORLD_IPC.stream, event satisfies WorldStreamEvent);
    return;
  }
  if (frame.t === "presence") {
    const { t: _t, ...event } = frame;
    core.deps.broadcast(WORLD_IPC.presence, event satisfies WorldPresenceEvent);
    return;
  }
  await core.withWorld(frame.world, async (world) => {
    if (world.link?.diverged != null) return ok(undefined);
    if (frame.t === "opened") await onOpened(core, world, frame);
    else if (frame.t === "entries") await onEntries(core, world, frame);
    else if (frame.t === "rejected") await onRejected(core, world, frame);
    return ok(undefined);
  });
}

/** A socket is authenticated: open every world synced over it. */
export function onReady(core: HostCore, url: string): void {
  for (const [id, info] of core.sync) {
    const world = core.worlds.get(id);
    if (info.url === url && world !== undefined) sendOpen(core, world);
  }
}

export function onDown(core: HostCore, url: string, error: AppError, fatal: boolean): void {
  for (const [id, info] of core.sync) {
    if (info.url !== url || info.link === "diverged") continue;
    core.setSync(id, { url, link: fatal ? "refused" : "offline", error: fatal ? error : null });
    const world = core.worlds.get(id);
    if (world !== undefined) void core.emitStatus(world);
  }
}

/** D15: asks the service who writes `target`; 1.5 s at most. */
export async function claimOnline(
  core: HostCore,
  world: LoadedWorld,
  message: { t: "claim" | "release"; target: string },
): Promise<Result<Extract<FromService, { t: "claimed" }> | null>> {
  const url = urlOf(world);
  if (url === null || core.sync.get(world.id)?.link !== "online") {
    return err(
      "claim-offline",
      "The world's service is not connected.",
      "Writing goes ahead here.",
    );
  }
  const target = message.target as Extract<FromService, { t: "claimed" }>["target"];
  if (message.t === "release") {
    const sent = core.hub.send(url, { t: "release", world: world.id, target });
    return sent.ok ? ok(null) : sent;
  }
  const answer = core.hub.waitFor(
    url,
    (frame) => frame.t === "claimed" && frame.world === world.id && frame.target === target,
    1_500,
  );
  const sent = core.hub.send(url, { t: "claim", world: world.id, target });
  if (!sent.ok) return sent;
  const frame = await answer;
  return frame?.t === "claimed"
    ? ok(frame)
    : err(
        "claim-offline",
        "The world's service did not answer in time.",
        "Writing goes ahead here.",
      );
}
