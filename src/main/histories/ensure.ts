// `world.ensure(instanceId, name)` (rev 6 phase 3, D6, D7): runs when Play opens a save with open
// land. Lazy and idempotent, one at a time per instance:
//
// - No world.json: migrate. The plan's genesis id is deterministic, so a history already renamed
//   into place by an interrupted run (or found through index.json) is caught up, not duplicated.
// - world.json: open that history. Its owner is another device's key and it was never attached →
//   adopt (a re-signed copy; the old history stays untouched). Attached and not a member → read
//   only, `world-device-not-member`. Ours and the source digest changed → catch up (only events
//   whose ids the log lacks), merge progress without regressing it, re-pin.
// - A local-only world owned here gets its catch-up beat (D13); an attached one starts syncing.
//
// Without a device key the history still reads (verification needs only public keys); migrating,
// adopting and writing wait, and the key error is the status's error.

import { roleOf } from "@shared/history/access";
import { readEvent } from "@shared/history/event";
import { err, ok, type Result } from "@shared/result";
import type { Adjusted, Skipped, WorldEnsured } from "@shared/worldApi";
import type { WorldProgress } from "@shared/worldProgress";
import type { DeviceKey } from "../identity/deviceKey";
import { adoptLog, rebasePlanned } from "./adopt";
import { localBeat } from "./beat";
import { commitEvents } from "./commit";
import type { HostCore } from "./core";
import { sameDigest } from "./digest";
import { locked } from "./fsx";
import { isLocalOnly, type LoadedWorld } from "./loaded";
import { readLog } from "./logStore";
import {
  freshLog,
  installLog,
  missingEvents,
  type PlannedHistory,
  pinHistory,
  planHistory,
} from "./migrate";
import { readProgress, readWorldPin, remapProgress, type WorldPin } from "./pin";
import { currentDigest, resolveSave } from "./sources";
import { startSync } from "./syncWorld";
import { worldsOfInstance } from "./worldIndex";

interface Outcome {
  migrated: boolean;
  added: number;
  adoptedFrom: string | null;
  adjusted: Adjusted[];
  lost: string[];
}

const NOTHING: Outcome = { migrated: false, added: 0, adoptedFrom: null, adjusted: [], lost: [] };

const NOT_MEMBER = {
  code: "world-device-not-member",
  message: "This world is shared from another device, and this device is not one of its members.",
  hint: "Open it on the device that made it, or ask its owner for an invite.",
};

function migrateDeps(core: HostCore) {
  return { histories: core.histories, sources: core.sources, dsl: core.deps.dsl };
}

/**
 * The display name the migration wrote (its owner's first `profile`), so a catch-up re-plans the
 * same profile event instead of adding one for a name changed since; "" when it wrote none.
 */
async function migratedName(world: LoadedWorld): Promise<Result<string>> {
  const entries = await readLog(world.dir);
  if (!entries.ok) return entries;
  for (const { event } of entries.value) {
    const read = readEvent(event);
    if (read.ok && read.value.kind === "profile" && read.value.author === world.owner) {
      return ok(read.value.body.name);
    }
  }
  return ok("");
}

/** The plan as it is (or would be) in `world`: the same content gets the same ids. */
function inWorld(world: LoadedWorld, planned: PlannedHistory, key: DeviceKey) {
  const rebased = rebasePlanned(planned.events, planned.genesis.id, world.id, key);
  const placeEvents = planned.events.filter((event) => event.kind === "place").map((e) => e.id);
  const progress: WorldProgress =
    planned.genesis.id === world.id
      ? planned.progress
      : remapProgress(planned.progress, world.id, rebased.idMap, placeEvents).progress;
  return { events: rebased.events, progress };
}

/** Adds what the plan has and the log lacks; returns how many were added or queued. */
async function catchUp(
  core: HostCore,
  world: LoadedWorld,
  planned: PlannedHistory,
  key: DeviceKey,
): Promise<{ added: number; skipped: Skipped[] }> {
  const { events } = inWorld(world, planned, key);
  const queued = new Set(world.outbox.map((pending) => pending.event.id));
  const missing = missingEvents({ events }, world.ids).filter((event) => !queued.has(event.id));
  if (missing.length === 0) return { added: 0, skipped: [] };
  const committed = await commitEvents(core, world, missing);
  return { added: committed.added.length + committed.queued.length, skipped: committed.skipped };
}

/** Index, progress (merged, never regressed) and world.json for `world`, after `planned`. */
async function pinPlanned(
  core: HostCore,
  world: LoadedWorld,
  planned: PlannedHistory,
  key: DeviceKey,
  skipped: Skipped[],
  at: string,
): Promise<Result<void>> {
  const { progress } = inWorld(world, planned, key);
  return pinHistory(migrateDeps(core), {
    genesis: world.genesis,
    saveDir: planned.gathered.saveDir,
    progress,
    pin: { v: 1, worldId: world.id, migrated: { at, source: planned.digest, skipped } },
  });
}

async function migrate(
  core: HostCore,
  key: DeviceKey,
  input: { instanceId: string; name: string; expect?: string },
): Promise<Result<{ worldId: string; outcome: Outcome }>> {
  const planned = await planHistory(migrateDeps(core), key, input.instanceId, input.name);
  if (!planned.ok) return planned;
  const { genesis } = planned.value;
  if (input.expect !== undefined && genesis.id !== input.expect) {
    return err(
      "history-missing",
      "This save's world history is not on this device.",
      "Restore this save from a backup.",
    );
  }
  const owned = await worldsOfInstance(core.histories, input.instanceId, key.author);
  if (!owned.ok) return owned;
  const target = owned.value.includes(genesis.id) ? genesis.id : (owned.value.at(-1) ?? genesis.id);
  let created = false;
  let skipped = planned.value.skipped;
  if (target === genesis.id) {
    const lastPlayed = planned.value.gathered.resolved.instance.meta.updatedAt;
    const log = freshLog(planned.value, lastPlayed, core.verdictOf);
    const installed = await installLog(core.histories, genesis.id, input.instanceId, log.entries);
    if (!installed.ok) return installed;
    created = installed.value;
    if (created) skipped = [...skipped, ...log.skipped];
  }
  return core.withWorld(target, async (world) => {
    let plan = planned.value;
    let added = 0;
    if (!created) {
      const name = await migratedName(world);
      if (!name.ok) return name;
      if (name.value !== input.name) {
        const again = await planHistory(migrateDeps(core), key, input.instanceId, name.value);
        if (!again.ok) return again;
        plan = again.value;
      }
      const caught = await catchUp(core, world, plan, key);
      added = caught.added;
      skipped = [...plan.skipped, ...caught.skipped];
    }
    const pinned = await pinPlanned(core, world, plan, key, skipped, core.nowIso());
    if (!pinned.ok) return pinned;
    const adjusted = plan.adjusted;
    return ok({ worldId: world.id, outcome: { ...NOTHING, migrated: created, added, adjusted } });
  });
}

/** D7: a never-attached world from another device, re-signed here; the old one stays as it is. */
async function adopt(
  core: HostCore,
  old: LoadedWorld,
  key: DeviceKey,
  saveDir: string,
  pin: WorldPin,
): Promise<Result<{ worldId: string; lost: string[] }>> {
  const entries = await readLog(old.dir);
  if (!entries.ok) return entries;
  const adopted = adoptLog(entries.value, old.genesis, key, core.verdictOf);
  const label = `adopt-${old.genesis.body.from.instanceId}`;
  const installed = await installLog(core.histories, adopted.genesis.id, label, adopted.entries);
  if (!installed.ok) return installed;
  const progress = await readProgress(saveDir, old.id);
  if (!progress.ok) return progress;
  const places = old.now.places.map((place) => place.id);
  const remapped = remapProgress(progress.value, adopted.genesis.id, adopted.idMap, places);
  const migrated =
    pin.migrated === null
      ? null
      : { ...pin.migrated, skipped: [...pin.migrated.skipped, ...adopted.dropped] };
  const pinned = await pinHistory(migrateDeps(core), {
    genesis: adopted.genesis,
    saveDir,
    progress: remapped.progress,
    pin: { v: 1, worldId: adopted.genesis.id, migrated },
  });
  return pinned.ok ? ok({ worldId: adopted.genesis.id, lost: remapped.lost }) : pinned;
}

/** Catch-up of a pinned world owned here, when its legacy source changed since the pin. */
async function catchUpPinned(
  core: HostCore,
  world: LoadedWorld,
  key: DeviceKey,
  pin: WorldPin,
  input: { instanceId: string },
): Promise<Result<Pick<Outcome, "added" | "adjusted">>> {
  if (pin.migrated === null) return ok({ added: 0, adjusted: [] });
  const digest = await currentDigest(core.sources, input.instanceId);
  if (!digest.ok) return digest;
  if (sameDigest(digest.value, pin.migrated.source)) return ok({ added: 0, adjusted: [] });
  const name = await migratedName(world);
  if (!name.ok) return name;
  const planned = await planHistory(migrateDeps(core), key, input.instanceId, name.value);
  if (!planned.ok) return planned;
  const caught = await catchUp(core, world, planned.value, key);
  const skipped = [...planned.value.skipped, ...caught.skipped];
  const pinned = await pinPlanned(core, world, planned.value, key, skipped, pin.migrated.at);
  return pinned.ok ? ok({ added: caught.added, adjusted: planned.value.adjusted }) : pinned;
}

async function openPinned(
  core: HostCore,
  key: Result<DeviceKey>,
  input: { instanceId: string; name: string; saveDir: string; pin: WorldPin },
): Promise<Result<{ worldId: string; outcome: Outcome }>> {
  const { pin, saveDir } = input;
  const outcome: Outcome = { ...NOTHING };
  let worldId = pin.worldId;
  const first = await core.withWorld(worldId, async (world) => ok(world));
  if (!first.ok) {
    if (first.error.code !== "history-missing" || !key.ok || pin.migrated === null) return first;
    // The history directory is gone. A migrated world re-plans to the same id; an adopted or a
    // joined one cannot be rebuilt from this save.
    return migrate(core, key.value, { ...input, expect: pin.worldId });
  }
  if (!key.ok) return ok({ worldId, outcome });
  if (first.value.owner !== key.value.author && isLocalOnly(first.value)) {
    const adopted = await core.withWorld(worldId, (old) =>
      adopt(core, old, key.value, saveDir, pin),
    );
    if (!adopted.ok) return adopted;
    outcome.adoptedFrom = worldId;
    outcome.lost = adopted.value.lost;
    worldId = adopted.value.worldId;
  }
  const repinned = await readWorldPin(saveDir);
  if (!repinned.ok) return repinned;
  const current = repinned.value ?? pin;
  return core.withWorld(worldId, async (world) => {
    if (world.owner !== key.value.author) return ok({ worldId, outcome });
    const caught = await catchUpPinned(core, world, key.value, current, input);
    if (!caught.ok) return caught;
    Object.assign(outcome, caught.value);
    const beat = await localBeat(world, key.value, core.deps.clock(), core.verdictOf);
    if (beat.ok && beat.value !== null) await core.emitStatus(world);
    return ok({ worldId, outcome });
  });
}

export function ensureWorld(
  core: HostCore,
  instanceId: string,
  name: string,
): Promise<Result<WorldEnsured>> {
  return locked(`instance:${instanceId}`, async () => {
    const key = await core.deps.key();
    const save = await resolveSave(core.sources, instanceId);
    if (!save.ok) return save;
    const { saveDir } = save.value;
    const pin = await readWorldPin(saveDir);
    if (!pin.ok) return pin;
    let opened: Result<{ worldId: string; outcome: Outcome }>;
    if (pin.value === null) {
      if (!key.ok) return key;
      opened = await migrate(core, key.value, { instanceId, name });
    } else {
      opened = await openPinned(core, key, { instanceId, name, saveDir, pin: pin.value });
    }
    if (!opened.ok) return opened;
    const { worldId, outcome } = opened.value;
    return core.withWorld(worldId, async (world) => {
      if (!isLocalOnly(world)) startSync(core, world);
      const status = await core.status(world, key);
      if (key.ok && roleOf(world.now, key.value.author) === "visitor") status.error ??= NOT_MEMBER;
      const finalPin = await readWorldPin(saveDir);
      return ok({
        worldId,
        migrated: outcome.migrated,
        added: outcome.added,
        adoptedFrom: outcome.adoptedFrom,
        skipped: finalPin.ok ? (finalPin.value?.migrated?.skipped ?? []) : [],
        adjusted: outcome.adjusted,
        lost: outcome.lost,
        status,
      });
    });
  });
}
