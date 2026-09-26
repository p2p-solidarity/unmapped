// A world moving to another service (rev 6 phase 4, D5), from this device's side. Both paths keep
// P3 D2's receipt schedule unchanged and never merge:
//
// - **Rehost** (`world.attach` on a world already attached, by an owner or co-owner): the new
//   service already holds the log — a mirror imported from a `.world` — so nothing is uploaded.
//   Main opens the world there from its own head (the service refuses `history-diverged` unless its
//   copy holds this device's chain at that n), takes and verifies anything newer, then submits a
//   `sequencer` naming the new service's key and waits for its receipt, which must verify under
//   that key (s(i+1)). Then link.json points at the new service.
// - **Move link** (`unmapped://world?w=<worldId>&svc=<url>`, a member following its world): link.json
//   switches only when the served log extends this device's (a chain prefix) and the latest admitted
//   `sequencer` in it names that service's key. A log that does not extend ours is
//   `history-diverged`; one not rehosted there yet is `move-not-rehosted`. Nothing is written then.
//
// While it runs, the world's old sync is stopped, so frames from the new service reach only the
// waiters here; on any refusal the old link resumes.

import { admit } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { type LogCursor, type ReceiptKey, verifyLog } from "@shared/history/log";
import { isOwner, type Ownership, ownershipOf } from "@shared/history/owners";
import type { Head, LogEntry } from "@shared/history/types";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { WorldStatus } from "@shared/worldApi";
import { readMoveLink, type WorldMoved } from "@shared/worldBundle";
import { WORLD_PROTOCOL } from "@shared/worldProtocol";
import type { HostCore } from "../histories/core";
import { appendVerified, isLocalOnly, type LoadedWorld } from "../histories/loaded";
import { type WorldLink, writeLink } from "../histories/logStore";
import { receiveWorks } from "../histories/receive";
import { startSync, stopSync } from "../histories/syncWorld";
import type { DeviceKey } from "../identity/deviceKey";

const CONNECT_MS = 10_000;
const COLLECT_MS = 30_000;
const SEQUENCE_MS = 15_000;

const DIVERGED_HINT =
  "Nothing was changed here. Ask the world's owner which service holds the history this device has.";

/** What this device holds of a world, as a move is checked against it. */
export interface MoveFrom {
  world: string;
  cursor: LogCursor;
  ownership: Ownership;
  schedule: readonly ReceiptKey[];
}

/** What the new service served after this device's head. */
export interface MoveServed {
  genesis: string;
  head: Head;
  /** Entries cursor.n + 1 … head.n, in order. */
  entries: readonly LogEntry[];
  /** The key the service proved in its challenge. */
  serviceKey: string;
}

/**
 * D5, pure: whether the served log extends this device's (every entry after its head chains on and
 * verifies under the schedule so far, with the ownership pass), and — for a member following a move
 * link (`requireKey`) — whether its latest admitted `sequencer` names that service. Returns the
 * entries to append and the schedule after them.
 */
export function checkMove(
  from: MoveFrom,
  served: MoveServed,
  requireKey: boolean,
): Result<{ entries: LogEntry[]; schedule: ReceiptKey[] }> {
  const diverged = (why: string): Result<never> => err("history-diverged", why, DIVERGED_HINT);
  if (served.genesis !== from.world) return diverged("That service holds another world.");
  if (served.head.n < from.cursor.n) {
    return diverged("That service holds less of this world's history than this device.");
  }
  if (served.head.n === from.cursor.n && served.head.chain !== from.cursor.chain) {
    return diverged("That service's history ends on another chain than this device's.");
  }
  const entries = [...served.entries];
  const whole =
    entries.length === served.head.n - from.cursor.n &&
    entries.every((entry, index) => entry.n === from.cursor.n + 1 + index);
  if (!whole)
    return err("service-timeout", "The world's history did not arrive whole.", "Try again.");
  const last = entries[entries.length - 1];
  if (last !== undefined && last.chain !== served.head.chain) {
    return diverged("That service's history ends on another chain than it sent.");
  }
  const checked = verifyLog(from.world, entries, {
    from: from.cursor,
    ownership: from.ownership,
    schedule: from.schedule,
  });
  if (!checked.ok) {
    return diverged(
      `That service's history does not extend this device's: ${checked.error.message}`,
    );
  }
  if (requireKey && checked.value.schedule.at(-1)?.key !== served.serviceKey) {
    return err(
      "move-not-rehosted",
      "That service holds this world, but no owner has moved it there yet.",
      "Follow the link again once an owner has moved the world to that service.",
    );
  }
  return ok({ entries, schedule: checked.value.schedule });
}

/** Opens `world` on `url` from this device's head; what the service holds after it. */
async function servedAfter(
  core: HostCore,
  url: string,
  world: LoadedWorld,
  serviceKey: string,
): Promise<Result<MoveServed>> {
  const have = world.cursor.n;
  const byN = new Map<number, LogEntry>();
  let target = Number.POSITIVE_INFINITY;
  const collecting = core.hub.waitFor(
    url,
    (frame) => {
      if (frame.t !== "entries" || frame.world !== world.id) return false;
      for (const entry of frame.entries) if (entry.n > have) byN.set(entry.n, entry);
      let count = 0;
      for (const n of byN.keys()) if (n <= target) count += 1;
      return count >= target - have;
    },
    COLLECT_MS,
  );
  const opened = core.hub.waitFor(
    url,
    (frame) => (frame.t === "opened" || frame.t === "refused") && frame.world === world.id,
    CONNECT_MS,
  );
  const sent = core.hub.send(url, {
    t: "open",
    world: world.id,
    have,
    chain: have === 0 ? null : world.cursor.chain,
    protocol: WORLD_PROTOCOL,
    physics: [...PHYSICS_SUPPORTED],
  });
  if (!sent.ok) return sent;
  const answer = await opened;
  if (answer === null) return err("service-timeout", "The world's service did not answer in time.");
  if (answer.t === "refused") return { ok: false, error: answer.error };
  if (answer.t !== "opened") return err("service-timeout", "The world's service did not open.");
  target = answer.head.n;
  if (target > have && byN.size < target - have) await collecting;
  const entries = [...byN.values()].filter((entry) => entry.n <= target).sort((a, b) => a.n - b.n);
  return ok({ genesis: answer.genesis.id, head: answer.head, entries, serviceKey });
}

/** Submits this device's `sequencer` for `url` and waits for its receipted entry (or refusal). */
async function sequenceHere(
  core: HostCore,
  url: string,
  world: LoadedWorld,
  key: DeviceKey,
  serviceKey: string,
): Promise<Result<LogEntry[]>> {
  const at = core.nowIso();
  const event = key.signEvent({
    v: 1,
    world: world.id,
    kind: "sequencer",
    author: key.author,
    at,
    seen: world.now.head.n,
    body: { url, key: serviceKey },
  });
  const read = readEvent(event);
  if (!read.ok) return read;
  const admitted = admit(world.now, read.value, at);
  if (!admitted.ok) return admitted;
  const answer = core.hub.waitFor(
    url,
    (frame) =>
      (frame.t === "rejected" && frame.world === world.id && frame.id === event.id) ||
      (frame.t === "entries" &&
        frame.world === world.id &&
        frame.entries.some((entry) => entry.event.id === event.id)),
    SEQUENCE_MS,
  );
  const sent = core.hub.send(url, { t: "submit", world: world.id, events: [event] });
  if (!sent.ok) return sent;
  const frame = await answer;
  if (frame === null) {
    return err(
      "service-timeout",
      "The new service did not sequence the move in time.",
      "Try again.",
    );
  }
  if (frame.t === "rejected") return { ok: false, error: frame.error };
  if (frame.t !== "entries") return err("service-timeout", "The new service did not answer.");
  return ok(frame.entries.filter((entry) => entry.n > world.cursor.n));
}

type Moving = (world: LoadedWorld, url: string, serviceKey: string) => Promise<Result<number>>;

/**
 * Runs `move` on the world with its old sync stopped and the new service's socket wanted; on
 * success link.json points at `url` (pinned to the key it proved) and sync resumes there, else the
 * old link resumes.
 */
async function moveWorld(
  core: HostCore,
  worldId: string,
  url: string,
  key: Result<DeviceKey>,
  move: Moving,
): Promise<Result<{ added: number; status: WorldStatus }>> {
  const token = `move:${worldId}`;
  core.hub.want(url, token);
  try {
    if (!(await core.hub.ready(url, CONNECT_MS))) {
      return err(
        "service-unreachable",
        `Cannot reach ${url}.`,
        "Check the address and that it runs.",
      );
    }
    const serviceKey = core.hub.serviceKey(url);
    if (serviceKey === null)
      return err("service-unreachable", "The service did not identify itself.");
    const moved = await core.withWorld(worldId, async (world) => {
      if (isLocalOnly(world)) {
        return err(
          "move-local-only",
          "This world was never shared, so there is nothing to move.",
          "Share it on a world service from the device that made it.",
        );
      }
      stopSync(core, world);
      const done = await move(world, url, serviceKey);
      if (!done.ok) {
        startSync(core, world);
        return done;
      }
      const link: WorldLink = {
        v: 1,
        url,
        key: serviceKey,
        attachedAt: core.nowIso(),
        diverged: null,
      };
      await writeLink(world.dir, link);
      world.link = link;
      return done;
    });
    if (!moved.ok) return moved;
    return core.withWorld(worldId, async (world) => {
      startSync(core, world);
      void receiveWorks(core, world);
      const status = await core.status(world, key);
      await core.emitStatus(world);
      return ok({ added: moved.value, status });
    });
  } finally {
    core.hub.unwant(url, token);
  }
}

/** Takes what the new service holds after this device's head, verified; returns how many. */
async function catchUp(
  core: HostCore,
  world: LoadedWorld,
  url: string,
  serviceKey: string,
  requireKey: boolean,
): Promise<Result<number>> {
  const served = await servedAfter(core, url, world, serviceKey);
  if (!served.ok) return served;
  const from: MoveFrom = {
    world: world.id,
    cursor: world.cursor,
    ownership: ownershipOf(world.now),
    schedule: world.schedule,
  };
  const checked = checkMove(from, served.value, requireKey);
  if (!checked.ok) return checked;
  const added = await appendVerified(
    world,
    checked.value.entries,
    checked.value.schedule,
    core.verdictOf,
  );
  if (added.length > 0) core.emitEntries(world, added);
  return ok(added.length);
}

/**
 * The rehost path of `world.attach` (D5): an owner or co-owner moves an attached world to a
 * service that already holds its log. See the header.
 */
export async function rehostWorld(
  core: HostCore,
  worldId: string,
  url: string,
): Promise<Result<WorldStatus>> {
  const key = await core.deps.key();
  if (!key.ok) return key;
  const moved = await moveWorld(core, worldId, url, key, async (world, target, serviceKey) => {
    if (!isOwner(world.now, key.value.author)) {
      return err(
        "access-owner-only",
        "Only the world's owners move it to another service.",
        "Do it from an owner's or a co-owner's device.",
      );
    }
    if (world.link?.url === target && world.link.key === serviceKey) {
      return err("attach-already", "This world is already on that service.");
    }
    const caught = await catchUp(core, world, target, serviceKey, false);
    if (!caught.ok) return caught;
    // Another owner may have moved it there already: then only the link follows.
    if (world.schedule.at(-1)?.key === serviceKey) return caught;
    const fresh = await sequenceHere(core, target, world, key.value, serviceKey);
    if (!fresh.ok) return fresh;
    const from: MoveFrom = {
      world: world.id,
      cursor: world.cursor,
      ownership: ownershipOf(world.now),
      schedule: world.schedule,
    };
    const last = fresh.value[fresh.value.length - 1];
    const head = last === undefined ? world.cursor : { n: last.n, chain: last.chain };
    const served = { genesis: world.id, head, entries: fresh.value, serviceKey };
    const checked = checkMove(from, served, true);
    if (!checked.ok) return checked;
    const added = await appendVerified(
      world,
      checked.value.entries,
      checked.value.schedule,
      core.verdictOf,
    );
    core.emitEntries(world, added);
    return ok(caught.value + added.length);
  });
  return moved.ok ? ok(moved.value.status) : moved;
}

/** Follows a move link (D5): see the header. */
export async function followMoveLink(core: HostCore, text: string): Promise<Result<WorldMoved>> {
  const link = readMoveLink(text);
  if (!link.ok) return link;
  const { world: worldId, svc: url } = link.value;
  const key = await core.deps.key();
  if (!key.ok) return key;
  const present = await core.withWorld(worldId, async (world) => ok(world.id));
  if (!present.ok) {
    return present.error.code === "history-missing"
      ? err(
          "move-world-missing",
          "This world is not on this device.",
          "Join it with an invite link, or import its .world file.",
        )
      : present;
  }
  const moved = await moveWorld(core, worldId, url, key, async (world, target, serviceKey) =>
    world.link?.url === target && world.link.key === serviceKey && world.link.diverged === null
      ? ok(0)
      : catchUp(core, world, target, serviceKey, true),
  );
  return moved.ok
    ? ok({ worldId, url, added: moved.value.added, status: moved.value.status })
    : moved;
}
