// Attaching a local-only world to a service (rev 6 phase 3, D2, D9, D11). The owner's device:
//
//   1. connects and learns the service's key from its challenge;
//   2. signs a `sequencer` event naming exactly that URL and key, and uploads entries 1..k in
//      `attach` frames (≤ 64 entries and ≤ 256 KiB each); the last frame carries the sequencer;
//   3. opens the world from n = 0 and collects what the service now holds: 1..k with its receipts
//      (n, rt, chain and event of each unchanged — only `rsig` may differ) and k + 1 = the sequencer;
//   4. verifies that whole log against the receipt schedule, then replaces log.jsonl with it
//      atomically — the one rewrite a log ever gets, and it changes no entry but its receipt — and
//      writes link.json with the pinned key;
//   5. uploads the packs the history announces (cartridge, AI works) for friends to fetch, noting
//      each one the service confirmed (./workPacks), so the reconnect that follows sends none again.
//
// Anything unexpected leaves the local log exactly as it was.

import { canonicalJson } from "@shared/canonical";
import { admit } from "@shared/history/admit";
import { isServiceUrl } from "@shared/history/bodies";
import { readEvent } from "@shared/history/event";
import { verifyLog } from "@shared/history/log";
import { isOwner } from "@shared/history/owners";
import type { Invite, LogEntry } from "@shared/history/types";
import { PHYSICS_SUPPORTED } from "@shared/physics";
import { err, ok, type Result } from "@shared/result";
import type { WorldStatus } from "@shared/worldApi";
import { FRAME_LIMITS, type FromService, WORLD_PROTOCOL } from "@shared/worldProtocol";
import type { HostCore } from "./core";
import { isLocalOnly } from "./loaded";
import { readLog, writeLink, writeLog } from "./logStore";
import { framesOf } from "./sync";
import { startSync } from "./syncWorld";
import { uploadOwnPacks } from "./workPacks";

const CONNECT_MS = 10_000;
const COLLECT_MS = 30_000;

/**
 * What the service answers after `send` (an `open` from zero, or the attach frames): `opened`,
 * then every entry 1..head, deduplicated by n. Waiters are registered before anything is sent.
 */
export async function collectLog(
  core: HostCore,
  url: string,
  world: string,
  send: () => Result<void>,
): Promise<Result<{ entries: LogEntry[]; opened: Extract<FromService, { t: "opened" }> }>> {
  const byN = new Map<number, LogEntry>();
  let target = Number.POSITIVE_INFINITY;
  // Accumulates every `entries` frame; done (and removed) once 1..target have all arrived.
  const collecting = core.hub.waitFor(
    url,
    (frame) => {
      if (frame.t !== "entries" || frame.world !== world) return false;
      for (const entry of frame.entries) byN.set(entry.n, entry);
      let have = 0;
      for (const n of byN.keys()) if (n >= 1 && n <= target) have += 1;
      return have >= target;
    },
    COLLECT_MS,
  );
  const opened = core.hub.waitFor(
    url,
    (frame) => (frame.t === "opened" || frame.t === "refused") && frame.world === world,
    CONNECT_MS,
  );
  const sent = send();
  if (!sent.ok) return sent;
  const answer = await opened;
  if (answer === null) return err("service-timeout", "The world's service did not answer in time.");
  if (answer.t === "refused") return { ok: false, error: answer.error };
  if (answer.t !== "opened") return err("service-timeout", "The world's service did not open.");
  target = answer.head.n;
  if (byN.size < target) await collecting;
  const entries = [...byN.values()].filter((entry) => entry.n <= target).sort((a, b) => a.n - b.n);
  if (entries.length !== target || entries.some((entry, index) => entry.n !== index + 1)) {
    return err("service-timeout", "The world's history did not arrive whole.", "Try again.");
  }
  return ok({ entries, opened: answer });
}

/** `open` from zero (with the invite and proof when joining). */
export function openFromZero(
  core: HostCore,
  url: string,
  world: string,
  join?: { invite: Invite; proof: string },
): () => Result<void> {
  return () =>
    core.hub.send(url, {
      t: "open",
      world,
      have: 0,
      chain: null,
      protocol: WORLD_PROTOCOL,
      physics: [...PHYSICS_SUPPORTED],
      ...(join === undefined ? {} : { join }),
    });
}

/** The chain binds ids only: the whole event must come back byte for byte, only `rsig` new. */
function sameExceptReceipt(local: LogEntry, remote: LogEntry): boolean {
  return (
    local.n === remote.n &&
    local.rt === remote.rt &&
    local.chain === remote.chain &&
    canonicalJson(local.event) === canonicalJson(remote.event)
  );
}

export async function attachWorld(
  core: HostCore,
  worldId: string,
  url: string,
): Promise<Result<WorldStatus>> {
  if (!isServiceUrl(url)) {
    return err("attach-url-invalid", "A world service is wss://, or ws:// on this machine.");
  }
  const key = await core.deps.key();
  if (!key.ok) return key;
  const token = `attach:${worldId}`;
  const result = await core.withWorld(worldId, async (world) => {
    if (!isOwner(world.now, key.value.author)) {
      return err(
        "access-owner-only",
        "Only the world's owners attach it.",
        "Do it from the device that made the world, or a co-owner's.",
      );
    }
    if (!isLocalOnly(world)) return err("attach-already", "This world is already attached.");
    core.hub.want(url, token);
    if (!(await core.hub.ready(url, CONNECT_MS))) {
      return err(
        "service-unreachable",
        `Cannot reach ${url}.`,
        "Check the address and that the service runs.",
      );
    }
    const serviceKey = core.hub.serviceKey(url);
    if (serviceKey === null)
      return err("service-unreachable", "The service did not identify itself.");
    const local = await readLog(world.dir);
    if (!local.ok) return local;
    const at = core.nowIso();
    const sequencer = key.value.signEvent({
      v: 1,
      world: world.id,
      kind: "sequencer",
      author: key.value.author,
      at,
      seen: world.now.head.n,
      body: { url, key: serviceKey },
    });
    const read = readEvent(sequencer);
    if (!read.ok) return read;
    const admitted = admit(world.now, read.value, at);
    if (!admitted.ok) return admitted;
    // Sized as if each chunk were the last, so the one that is can carry the sequencer.
    const chunks = framesOf(local.value, FRAME_LIMITS.attachEntries, (entries) => ({
      t: "attach",
      world: world.id,
      entries,
      last: true,
      sequencer,
    }));
    if (!chunks.ok) return chunks;
    const frames = chunks.value;
    // The service answers the last frame with `opened` and the whole log, receipted.
    const collected = await collectLog(core, url, world.id, () => {
      for (const [index, frame] of frames.entries()) {
        if (frame.t !== "attach") continue;
        const last = index === frames.length - 1;
        const sent = core.hub.send(
          url,
          last ? frame : { t: "attach", world: world.id, entries: frame.entries, last: false },
        );
        if (!sent.ok) return sent;
      }
      return ok(undefined);
    });
    if (!collected.ok) return collected;
    const remote = collected.value.entries;
    const k = local.value.length;
    const unchanged = local.value.every((entry, index) => {
      const other = remote[index];
      return other !== undefined && sameExceptReceipt(entry, other);
    });
    if (!unchanged || remote.length < k + 1 || remote[k]?.event.id !== sequencer.id) {
      return err(
        "attach-mismatch",
        "The service's copy of this world is not this device's.",
        "Nothing changed here; try another service.",
      );
    }
    const verified = verifyLog(world.id, remote);
    if (!verified.ok) return verified;
    await writeLog(world.dir, remote);
    await writeLink(world.dir, { v: 1, url, key: serviceKey, attachedAt: at, diverged: null });
    core.forget(world.id);
    return ok(undefined);
  });
  core.hub.unwant(url, token);
  if (!result.ok) return result;
  return core.withWorld(worldId, async (world) => {
    core.emitEntries(world, world.tail, true);
    startSync(core, world);
    // Noted as confirmed per pack, so the reconnect that follows sends none of them again.
    const packs = await uploadOwnPacks(core, world, url);
    const status = await core.status(world, key);
    const failed = packs.failed[0];
    if (failed !== undefined) status.error = failed.error;
    await core.emitStatus(world);
    return ok(status);
  });
}
