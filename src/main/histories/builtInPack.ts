// The cartridge pack of a shared world on a shipped built-in revision (rev 6 phase 4, D7). The
// genesis plan leaves the `pack` event out for a shipped revision (dsl/history/migrate.ts): a
// desktop that joins installs it from its own build (./receive). A phone has no build to install it
// from — it draws the land from the blob the latest `pack` event names — so once such a world is on
// a service, its owner's device packs the pinned revision (`packPinnedRevision`: the same bytes a
// `.world` export carries), uploads the blob, and only then announces it, so nobody is ever sent to
// a pack the service does not hold.
//
// When: right after attach (./attach), and whenever an attached world opens on this device with the
// service's whole log in hand (./syncWorld: `opened` at the head, or the `entries` that reach it),
// which gives a world shared before this build its pack on its owner's next open. A pass that
// fails is logged and tried again at the next `opened`, not on every entry that arrives.
//
// Never a second `pack`: admit accepts one from any owner at any time (its one rule is the
// cartridge hash), and refusing a repeat there would refuse what earlier builds admitted (a
// PHYSICS_VERSION bump), so the writer makes sure of it:
//   - only while the fold, outbox included, has no `pack` (a queued one counts);
//   - only from a device holding the service's whole log, so it cannot have missed one;
//   - only the world's first current owner (`currentOwners`) writes it, so two owners' devices
//     opening the world at once never both do (any owner still uploads it: `ownPacks`);
//   - one pass per world at a time, the fold read again under the world's lock just before signing.

import type { ContentHash } from "@shared/cartridge";
import { currentOwners } from "@shared/history/owners";
import { err, ok, type Result } from "@shared/result";
import { putBlob } from "../blobs/store";
import { isBuiltIn } from "./builtIn";
import { commitEvents, writeGate } from "./commit";
import type { HostCore } from "./core";
import { prepareEvent } from "./drafts";
import { locked } from "./fsx";
import { isLocalOnly, type LoadedWorld } from "./loaded";
import { packPinnedRevision } from "./packs";
import { sendPackOnce } from "./workPacks";

/** Whether `world` is a shared built-in world with no `pack` yet, sequenced or queued. */
export function lacksBuiltInPack(world: LoadedWorld): boolean {
  return (
    !isLocalOnly(world) &&
    world.now.pack === null &&
    isBuiltIn(world.genesis.body.cartridge) &&
    !world.outbox.some((pending) => pending.event.kind === "pack")
  );
}

/** Whether this device writes the pack now: see the header. Under the world's lock. */
function mine(world: LoadedWorld, me: string): boolean {
  return lacksBuiltInPack(world) && currentOwners(world.now)[0] === me;
}

/**
 * Packs, uploads and announces the pinned revision of `worldId` when this device should (see the
 * header): the pack's hash once it is announced (queued in the outbox, submitted when online), null
 * when there is nothing to do. Call it only when this device holds the service's whole log.
 */
export function announceBuiltInPack(
  core: HostCore,
  worldId: string,
  url: string,
): Promise<Result<ContentHash | null>> {
  return locked(`builtin-pack:${worldId}`, async (): Promise<Result<ContentHash | null>> => {
    const key = await core.deps.key();
    if (!key.ok) return key;
    const me = key.value.author;
    const due = await core.withWorld(worldId, async (world) => ok(mine(world, me) ? world : null));
    if (!due.ok || due.value === null) return due.ok ? ok(null) : due;
    const ref = due.value.genesis.body.cartridge;
    const packed = await packPinnedRevision(core.deps, ref);
    if (!packed.ok) return packed;
    if (packed.value === null) {
      return err(
        "cartridge-missing",
        `${ref.cartridgeId}@${ref.version} (${ref.contentHash.slice(0, 23)}…) is not installed here.`,
        "Update UNMAPPED to the build the world was made with.",
      );
    }
    const stored = await putBlob(core.blobsDir, packed.value.bytes);
    if (!stored.ok) return stored;
    const sent = await sendPackOnce(core, due.value, url, stored.value.hash, key.value);
    if (!sent.ok) return sent;
    return core.withWorld(worldId, async (world) => {
      if (!mine(world, me)) return ok(null);
      const gate = await writeGate(core, world, key.value);
      if (!gate.ok) return gate;
      const body = {
        cartridge: ref.contentHash,
        pack: stored.value.hash,
        bytes: stored.value.bytes,
      };
      const draft = { kind: "pack" as const, body, seen: world.now.head.n };
      const event = prepareEvent(world, draft, key.value, core.nowIso(), core.deps.dsl);
      if (!event.ok) return event;
      const committed = await commitEvents(core, world, [event.value]);
      const refused = committed.skipped[0];
      return refused === undefined ? ok(stored.value.hash) : err(refused.code, refused.message);
    });
  });
}

/** Worlds whose last pass failed, per host: tried again at their next `opened`. */
const failedPasses = new WeakMap<HostCore, Set<string>>();

/**
 * The sync's hook (./syncWorld), called under the world's lock once this device holds the
 * service's whole log: starts a pass in the background when the world lacks its pack. `opened`
 * clears an earlier failure, so a failing pass is retried once per reconnect.
 */
export function announceWhenDue(
  core: HostCore,
  world: LoadedWorld,
  url: string,
  opened: boolean,
): void {
  const failed = failedPasses.get(core) ?? new Set<string>();
  failedPasses.set(core, failed);
  if (opened) failed.delete(world.id);
  if (url === "" || failed.has(world.id) || !lacksBuiltInPack(world)) return;
  void announceBuiltInPack(core, world.id, url).then((result) => {
    if (result.ok) return;
    failed.add(world.id);
    console.warn(
      `[world] ${world.id.slice(0, 12)}… built-in pack not announced (${result.error.code}: ${result.error.message}); tried again at the next reconnect`,
    );
  });
}
