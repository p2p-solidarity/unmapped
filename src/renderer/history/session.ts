// The one open world and its one subscription (rev 6 phase 3, D4, D6, D11). Opening a save with
// open land runs `world.ensure` (migrate once, catch up, adopt; lazy and idempotent) behind a
// loading state, reads the history, folds it here (`foldEntries` over the verdict entries, the
// outbox on top with `withPending`) and keeps folding as `world:entries` arrive. Every fold goes to
// the history store and, as a land view, to the land store. What ensure did is told once, as a
// notice.
//
// A save whose world cannot be made because this device has no usable key plays from its legacy
// files instead (D7: "unmigrated saves open from their legacy files, and writing … wait[s]").
// Leaving Play closes the world in main (snapshot, stop syncing); coming back re-reads it.

import { translate } from "@renderer/i18n";
import { playerName } from "@renderer/net/room";
import {
  type ChunkStatus,
  openWorld,
  useHistoryStore,
  useLandStore,
  useSessionStore,
} from "@renderer/state";
import { HISTORY_LIMITS, isOneLine } from "@shared/history/bodies";
import { emptyNow, foldEntries, openGenesis, withPending } from "@shared/history/fold";
import type { PendingEvent, WorldNow } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { WorldEnsured, WorldEntriesEvent, WorldRead } from "@shared/worldApi";
import { useEffect } from "react";
import { landFromHistory } from "./landView";
import { legacyChunks, loadLegacyLand } from "./legacyLand";

interface Session {
  instanceId: string;
  worldId: string;
  /** Chunks drawn from this device's frozen files (the migration's skipped chunks). */
  legacy: Record<string, ChunkStatus>;
  stop: () => void;
  /** Play was left and main closed the world; the next resume re-reads it. */
  closed: boolean;
  /** Something arrived before the first fold was ready: read the history again once it is. */
  missed: boolean;
}

let session: Session | null = null;

/**
 * A name as the world keeps it: one line of 1–60 characters (`member.join`, `profile`), control
 * characters as spaces, runs of spaces as one, never half of a surrogate pair; "" when blank.
 */
export function displayNameOf(raw: string): string {
  let flat = "";
  for (const char of raw) flat += isOneLine(char) ? char : " ";
  let name = "";
  for (const char of flat.replace(/\s+/g, " ").trim()) {
    if (name.length + char.length > HISTORY_LIMITS.nameChars) break;
    name += char;
  }
  return name.trim();
}

/** This device's name for the worlds it writes (the session profile's, else the device's). */
export function worldDisplayName(): string {
  const name = displayNameOf(useSessionStore.getState().playerProfile?.displayName ?? playerName());
  return name.length > 0 ? name : "Player";
}

/** A receipt time for the pending overlay: now, never before the head it sits on. */
function overlayRt(sequenced: WorldNow): string {
  const now = new Date().toISOString();
  return sequenced.rt !== null && sequenced.rt > now ? sequenced.rt : now;
}

function publish(active: Session, sequenced: WorldNow, pending: PendingEvent[]): void {
  const now =
    pending.length === 0 ? sequenced : withPending(sequenced, pending, overlayRt(sequenced));
  useHistoryStore.getState().folded(active.worldId, { sequenced, now, pending });
  useLandStore.getState().applyWorld(active.instanceId, landFromHistory(now, active.legacy));
}

function foldRead(read: WorldRead): Result<WorldNow> {
  const genesis = openGenesis(read.genesis);
  if (!genesis.ok) return genesis;
  if (genesis.value.id !== read.world) {
    return err("history-genesis-mismatch", "The world's first entry is not its genesis.");
  }
  const base = read.snapshot?.now ?? emptyNow(genesis.value);
  return ok(foldEntries(base, read.entries));
}

function onEntries(active: Session, event: WorldEntriesEvent): void {
  if (session !== active || event.world !== active.worldId) return;
  const open = openWorld();
  if (open === null || open.worldId !== active.worldId) {
    active.missed = true;
    return;
  }
  if (event.reset) {
    void reread(active);
    return;
  }
  const head = open.sequenced.head.n;
  const fresh = event.entries.filter(({ entry }) => entry.n > head);
  if (fresh.length > 0 && fresh[0]?.entry.n !== head + 1) {
    // A gap: this renderer missed entries (it was busy re-reading); read the whole history again.
    void reread(active);
    return;
  }
  const sequenced = fresh.length === 0 ? open.sequenced : foldEntries(open.sequenced, fresh);
  publish(active, sequenced, event.pending);
}

function subscribe(active: Omit<Session, "stop">): Session {
  const entry: Session = { ...active, stop: () => undefined };
  const stops = [
    window.seed.world.onEntries((event) => onEntries(entry, event)),
    window.seed.world.onStatus((status) => {
      if (session !== entry || status.world !== entry.worldId) return;
      const open = openWorld();
      if (open === null) entry.missed = true;
      useHistoryStore.getState().setStatus(status);
      // Refused events are listed until dismissed (Rule 2): re-read the list when the count moves.
      if (open !== null && open.refused.length !== status.refused) void rereadRefused(entry);
    }),
  ];
  entry.stop = () => {
    for (const stop of stops) stop();
  };
  return entry;
}

async function rereadRefused(active: Session): Promise<void> {
  const read = await window.seed.world.read(active.worldId);
  if (session !== active || !read.ok) return;
  useHistoryStore.getState().setRefused(active.worldId, read.value.refused);
}

/** The whole history again (after a reset or a gap, or coming back to Play). */
async function reread(active: Session): Promise<Result<void>> {
  const read = await window.seed.world.read(active.worldId);
  if (session !== active) return ok(undefined);
  if (!read.ok) return read;
  const sequenced = foldRead(read.value);
  if (!sequenced.ok) return sequenced;
  useHistoryStore.getState().setStatus(read.value.status);
  useHistoryStore.getState().setRefused(active.worldId, read.value.refused);
  publish(active, sequenced.value, read.value.pending);
  return ok(undefined);
}

/** Brings the land up to the world's history now (after an append whose entry has not come). */
export async function syncWorld(): Promise<Result<void>> {
  return session === null ? ok(undefined) : reread(session);
}

function isKeyError(error: AppError): boolean {
  return error.code.startsWith("identity-");
}

/**
 * What opening the world changed, told once. A first migration is only news when the save had
 * something to carry (land, notes, signposts); a brand-new world's first open migrates too, and
 * "brought up to date" would only puzzle a new player.
 */
function noticeOf(ensured: WorldEnsured, carried: boolean): void {
  const toast = useSessionStore.getState().toast;
  if (ensured.migrated && carried) {
    toast("info", translate("landHistory.migrated", { n: ensured.status.head.n }));
  }
  if (ensured.added > 0) toast("info", translate("landHistory.caughtUp", { n: ensured.added }));
  if (ensured.adoptedFrom !== null) toast("info", translate("landHistory.adopted"));
  if (ensured.lost.length > 0) {
    toast("danger", translate("landHistory.lost", { n: ensured.lost.length }));
  }
  // Told on the first migration and after a catch-up; the list itself stays with the world.
  if ((ensured.migrated || ensured.added > 0) && ensured.skipped.length > 0) {
    toast("info", translate("landHistory.skipped", { n: ensured.skipped.length }));
  }
  if ((ensured.migrated || ensured.added > 0) && ensured.adjusted.length > 0) {
    toast("info", translate("landHistory.adjusted", { n: ensured.adjusted.length }));
  }
}

/** The chunks this device draws from its own frozen files: the ones the migration kept out. */
async function legacyOnly(instanceId: string, ensured: WorldEnsured) {
  const keys = new Set(ensured.skipped.filter((one) => one.what === "chunk").map((one) => one.key));
  if (keys.size === 0) return {};
  const record = await window.seed.instances.readLand(instanceId);
  return record.ok ? legacyChunks(record.value, keys) : {};
}

function stale(instanceId: string): boolean {
  return useLandStore.getState().instanceId !== instanceId;
}

/** Stops following the open world (another save opens, or the land is reset). */
export function endWorld(): void {
  const active = session;
  session = null;
  if (active === null) return;
  active.stop();
  if (!active.closed) void window.seed.world.close(active.worldId);
}

/**
 * Opens the land of a save with open land through its world's history; see the header. Resolves
 * once the land is ready or has failed (the land store says which).
 */
export async function openWorldLand(instanceId: string): Promise<void> {
  endWorld();
  useLandStore.getState().beginLoad(instanceId);
  useHistoryStore.getState().begin(instanceId);
  const ensured = await window.seed.world.ensure(instanceId, worldDisplayName());
  if (stale(instanceId)) return;
  if (!ensured.ok) {
    useHistoryStore.getState().failed(instanceId, ensured.error, ensured.error);
    if (isKeyError(ensured.error)) await loadLegacyLand(instanceId);
    else useLandStore.getState().loadFailed(instanceId, ensured.error);
    return;
  }
  const { worldId } = ensured.value;
  // Subscribed before the read, so nothing main sends meanwhile is lost (it is read again then).
  const active = subscribe({ instanceId, worldId, legacy: {}, closed: false, missed: false });
  session = active;
  const [read, legacy] = await Promise.all([
    window.seed.world.read(worldId),
    legacyOnly(instanceId, ensured.value),
  ]);
  if (session !== active || stale(instanceId)) {
    if (session === active) endWorld();
    else void window.seed.world.close(worldId);
    return;
  }
  active.legacy = legacy;
  const sequenced = read.ok ? foldRead(read.value) : read;
  if (!read.ok || !sequenced.ok) {
    const error = !read.ok ? read.error : sequenced.ok ? null : sequenced.error;
    endWorld();
    if (error !== null) {
      useHistoryStore.getState().failed(instanceId, error, error);
      useLandStore.getState().loadFailed(instanceId, error);
    }
    return;
  }
  const pending = read.value.pending;
  const overlay =
    pending.length === 0
      ? sequenced.value
      : withPending(sequenced.value, pending, overlayRt(sequenced.value));
  const status = read.value.status;
  useHistoryStore.getState().opened(instanceId, {
    worldId,
    sequenced: sequenced.value,
    now: overlay,
    pending,
    status,
    refused: read.value.refused,
    ensured: ensured.value,
  });
  useLandStore.getState().setPersonal(instanceId, ensured.value.progress);
  const land = landFromHistory(overlay, legacy);
  useLandStore.getState().applyWorld(instanceId, land);
  const carried =
    Object.keys(land.chunks).length > 0 || land.notes.length > 0 || land.signposts.length > 0;
  noticeOf(ensured.value, carried);
  if (active.missed) void reread(active);
}

/** Leaving Play: main snapshots the world and stops syncing it; the fold here stays. */
export function closeWorldLand(): void {
  if (session === null || session.closed) return;
  session.closed = true;
  void window.seed.world.close(session.worldId);
}

/** Back in Play with the same save: read the world again (main starts syncing on read). */
export function resumeWorldLand(): void {
  const active = session;
  if (active === null || !active.closed) return;
  active.closed = false;
  void reread(active);
}

/** Mounted by Play: the open world syncs while Play is up and is closed in main when it goes. */
export function useWorldLink(): void {
  useEffect(() => {
    resumeWorldLand();
    return () => closeWorldLand();
  }, []);
}

// The land let go of its save (a legacy world opened, the library reset it): so does the world.
useLandStore.subscribe((state, previous) => {
  if (previous.instanceId === null || state.instanceId !== null) return;
  endWorld();
  useHistoryStore.getState().reset();
});
