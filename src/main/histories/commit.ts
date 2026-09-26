// Writing to a world (rev 6 phase 3, D11): a local-only world appends straight to its log (this
// device is its sequencer, receipts null); an attached world queues in the outbox and submits at
// once, and offline the outbox waits. Either way only what the fold admits is written, and the
// renderer hears about it (`world:entries`, `world:status`).

import type { EventDraft, HistoryEvent, PendingEvent, VerdictEntry } from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import type { Skipped, WorldAppended } from "@shared/worldApi";
import type { DeviceKey } from "../identity/deviceKey";
import type { HostCore } from "./core";
import { prepareEvent } from "./drafts";
import { commitLocal, enqueue, isLocalOnly, type LoadedWorld } from "./loaded";
import { submit } from "./syncWorld";

export interface Committed {
  added: VerdictEntry[];
  queued: PendingEvent[];
  skipped: Skipped[];
}

/** Appends or queues `events` (already signed and read), keeping what the fold admits. */
export async function commitEvents(
  core: HostCore,
  world: LoadedWorld,
  events: readonly HistoryEvent[],
): Promise<Committed> {
  const rt = core.nowIso();
  if (isLocalOnly(world)) {
    const { added, skipped } = await commitLocal(world, events, rt, core.verdictOf);
    if (added.length > 0) {
      core.emitEntries(world, added);
      await core.emitStatus(world);
    }
    return { added, queued: [], skipped };
  }
  const { queued, skipped } = await enqueue(world, events, rt, core.verdictOf);
  if (queued.length > 0) {
    core.emitEntries(world, []);
    await core.emitStatus(world);
    submit(
      core,
      world,
      queued.map((pending) => pending.event),
    );
  }
  return { added: [], queued, skipped };
}

/** Whether this device may write `world` now, or why not (Rule 2: an error with a hint). */
export async function writeGate(
  core: HostCore,
  world: LoadedWorld,
  key: DeviceKey,
): Promise<Result<void>> {
  const status = await core.status(world, { ok: true, value: key });
  // D8: a removed key writes nothing (`mayWrite`). Its own copy ends before its removal, so the
  // role comes from the service's `access-removed` (`core.removal`); without this main would sign
  // and queue drafts nobody will ever sequence.
  if (status.role === "removed") {
    return err("access-removed", "The owner removed this key from the world.", status.error?.hint);
  }
  if (status.link === "diverged") {
    return err(
      "history-diverged",
      "This world's sync stopped because the service's history is not this device's.",
      status.error?.hint,
    );
  }
  if (isLocalOnly(world) && world.owner !== key.author) {
    return err(
      "world-device-not-member",
      "This world was made on another device.",
      "Open it on the device that made it, or ask its owner for an invite.",
    );
  }
  return ok(undefined);
}

/**
 * A draft from the renderer, or an owner action built against the world as it stands (`draft` as
 * a function of it): checked, signed, then committed.
 */
export async function appendDraft(
  core: HostCore,
  worldId: string,
  draft: EventDraft | ((world: LoadedWorld) => EventDraft),
): Promise<Result<WorldAppended>> {
  const key = await core.deps.key();
  if (!key.ok) return key;
  return core.withWorld(worldId, async (world) => {
    const gate = await writeGate(core, world, key.value);
    if (!gate.ok) return gate;
    const built = typeof draft === "function" ? draft(world) : draft;
    const event = prepareEvent(world, built, key.value, core.nowIso(), core.deps.dsl);
    if (!event.ok) return event;
    const committed = await commitEvents(core, world, [event.value]);
    const refused = committed.skipped[0];
    if (refused !== undefined) return err(refused.code, refused.message);
    const entry = committed.added.find((one) => one.entry.event.id === event.value.id);
    return ok({ id: event.value.id, n: entry?.entry.n ?? null });
  });
}
