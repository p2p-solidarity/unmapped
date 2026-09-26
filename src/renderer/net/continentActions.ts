// What the door and the HUD can do with continents: open this world's door (start a continent under
// its own door number), walk through a friend's door number (bring this world into theirs), and
// leave. Each returns a Result so the panel can say what went wrong (Rule 5).
//
// Rev 6 phase 3 (D12): continents are for worlds kept on this device only. A world attached to a
// world service refuses one (`continent-world-attached`). A note a visitor leaves on this world's
// land is no longer kept by itself: it waits here, at most VISITOR_NOTES_PER_DAY of one visitor's
// a day, until the owner keeps it as an owner-signed `note` event with the visitor's name.

import { doorArrival } from "@renderer/app/land/doorArrival";
import { getOpenWorld } from "@renderer/app/land/together";
import { spawnPoint } from "@renderer/engine/colliders";
import { doorPosition } from "@renderer/engine/home";
import { isVisiting, samplePlayer } from "@renderer/engine/playerProbe";
import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { chunkStands } from "@shared/history/decay";
import { EVENT_ID } from "@shared/history/ids";
import type { NoteBody, WorldNow } from "@shared/history/types";
import { type LandNote, landSeedOf, NOTE_MAX_CHARS } from "@shared/land";
import { physicsOf } from "@shared/physics";
import { type AppError, err, fail, ok, type Result } from "@shared/result";
import type { WorldBadgeKind } from "@shared/worldApi";
import { useSyncExternalStore } from "react";
import { isValidRoomCode, normalizeRoomCode, plateOf, ROOM_CODE_LENGTH } from "./codes";
import { getActiveContinent, openContinent, setActiveContinent } from "./continent";
import { playerName } from "./room";

// ── Attached worlds stay off continents ───────────────────────────────────────────────────────

export const WORLD_ATTACHED: AppError = {
  code: "continent-world-attached",
  message: "This world is shared through a world service, so it cannot also join a continent.",
  hint: "Friends join it with an invite from its door instead; continents are for worlds kept on this device only.",
};

/** Where each save's world lives, as main last said (`world.badges`), by instance id. */
let badges = new Map<string, WorldBadgeKind>();

/** Re-reads where this device's worlds live; the continent checks read the answer. */
export async function refreshWorldBadges(): Promise<void> {
  const read = await window.seed.world.badges().catch(() => null);
  if (read?.ok !== true) return;
  badges = new Map(read.value.map((badge) => [badge.instanceId, badge.kind]));
}

/** Whether this save's world is on a world service (the open world says so first, else a badge). */
export function worldAttached(instanceId: string): boolean {
  const open = getOpenWorld();
  if (open !== null && open.instanceId === instanceId) return open.status.link !== "local";
  const kind = badges.get(instanceId);
  return kind !== undefined && kind !== "local";
}

// A save opening is when its world's place may have changed (attached or joined elsewhere).
useLandStore.subscribe((state, previous) => {
  if (state.instanceId !== previous.instanceId && state.instanceId !== null) {
    void refreshWorldBadges();
  }
});

/** This world's door number, or null when no open-land world is loaded. */
export function myPlate(): string | null {
  const instanceId = useLandStore.getState().instanceId;
  return instanceId === null ? null : plateOf(instanceId);
}

/**
 * A visitor on another world's land stands at that land's coordinates shifted into this world's.
 * Once this continent is gone those coordinates are this world's own land, where the player never
 * walked, so they would be stranded there (and it would be witnessed). Send them home to their own
 * door first, on their own ground only; the save never held the spot they leave (playerProbe.ts).
 */
function bringVisitorHome(): void {
  const where = samplePlayer();
  if (where === null || !isVisiting(where)) return;
  const scene = useWorldStore.getState().scene;
  const save = useSessionStore.getState().activeInstance?.instance.save;
  const land = useLandStore.getState();
  if (scene.status !== "ready" || save === undefined || land.progress === null) return;
  const home = land.progress.home;
  const [doorX, doorZ] = doorPosition(scene.value, home);
  const beside = [doorX + 1, doorZ] as const;
  const point = doorArrival(home, scene.value, landSeedOf(save), land.chunks, null, beside);
  const [spawnX, , spawnZ] = spawnPoint(scene.value);
  useEngineStore.getState().requestTeleport(...(point ?? [spawnX, spawnZ]));
}

function openHere(code: string): Result<string> {
  const session = useSessionStore.getState();
  const worldId = useLandStore.getState().instanceId;
  if (worldId === null || useLandStore.getState().progress === null) {
    return err(
      "continent-no-land",
      "Only a world with open land can join a continent.",
      "Open a saved world and step out onto its land first.",
    );
  }
  if (session.networkRole !== "solo") {
    return err(
      "continent-in-room",
      "This world is already in a shared room.",
      "Leave the room in Console → Multiplayer first.",
    );
  }
  if (worldAttached(worldId)) return fail(WORLD_ATTACHED);
  const current = getActiveContinent();
  if (current?.code === normalizeRoomCode(code)) return ok(current.code);
  const pin = session.activeInstance?.instance.meta.runtimePin;
  if (pin === undefined) {
    return err(
      "continent-no-land",
      "Only a world with open land can join a continent.",
      "Open a saved world and step out onto its land first.",
    );
  }
  const opened = openContinent({
    code,
    worldId,
    name: session.playerProfile?.displayName ?? playerName(),
    physicsVersion: physicsOf(pin),
  });
  if (!opened.ok) return opened;
  // Moving to another continent leaves this one's land behind as well.
  bringVisitorHome();
  setActiveContinent(opened.value);
  return ok(opened.value.code);
}

/** Opens this world's door: a continent named by its own door number, which friends can dial. */
export function openMyDoor(): Result<string> {
  const plate = myPlate();
  if (plate === null) {
    return err(
      "continent-no-land",
      "Only a world with open land can open its door.",
      "Open a saved world and step out onto its land first.",
    );
  }
  return openHere(plate);
}

/** Brings this world onto the continent behind a friend's door number. */
export function joinContinentByCode(code: string): Result<string> {
  const normalized = normalizeRoomCode(code);
  if (!isValidRoomCode(normalized)) {
    return err(
      "room-bad-code",
      `"${code}" is not a door number.`,
      `Door numbers are ${ROOM_CODE_LENGTH} characters, as a friend's door shows them.`,
    );
  }
  return openHere(normalized);
}

/**
 * Takes this world back off the continent; its land stays exactly as it is on this disk. A player
 * standing on another world's land is brought home first.
 */
export function leaveContinent(): void {
  bringVisitorHome();
  setActiveContinent(null);
}

// ── A visitor's notes wait for the owner ──────────────────────────────────────────────────────

/** At most this many of one visitor's notes are offered to keep in one (UTC) day. */
export const VISITOR_NOTES_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VisitorNote {
  note: LandNote;
  /** Who left it: the name the continent carried. */
  visitor: string;
}

export interface VisitorNotes {
  offered: VisitorNote[];
  /** Notes past today's allowance, offered on a later day. */
  waiting: number;
}

let visitorNotes: VisitorNotes = { offered: [], waiting: 0 };
const noteListeners = new Set<() => void>();
/** Kept or set aside this session, by note id, with the visitor and the day (the daily count). */
const handled = new Map<string, { visitor: string; day: number }>();

function publishVisitorNotes(next: VisitorNotes): void {
  visitorNotes = next;
  for (const listener of noteListeners) listener();
}

function subscribeVisitorNotes(listener: () => void): () => void {
  noteListeners.add(listener);
  return () => noteListeners.delete(listener);
}

const currentVisitorNotes = (): VisitorNotes => visitorNotes;

export function useVisitorNotes(): VisitorNotes {
  return useSyncExternalStore(subscribeVisitorNotes, currentVisitorNotes, currentVisitorNotes);
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** Already part of this world's land: the same note, or one kept from it (same tile and words). */
function standsAmong(note: LandNote, notes: readonly LandNote[]): boolean {
  return notes.some(
    (one) =>
      one.id === note.id ||
      (one.text === note.text &&
        one.coord.cx === note.coord.cx &&
        one.coord.cz === note.coord.cz &&
        one.coord.x === note.coord.x &&
        one.coord.z === note.coord.z),
  );
}

/**
 * Offers the notes others left on this world's land (`theirs`, from the continent), at most
 * VISITOR_NOTES_PER_DAY of one visitor's a day; returns the visitors whose notes are newly offered.
 */
export function offerVisitorNotes(theirs: readonly LandNote[]): string[] {
  const own = useLandStore.getState().notes;
  const today = Math.floor(Date.now() / DAY_MS);
  const byVisitor = new Map<string, LandNote[]>();
  for (const note of theirs) {
    if (handled.has(note.id) || standsAmong(note, own)) continue;
    const visitor = oneLine(note.author);
    if (visitor === "") continue;
    byVisitor.set(visitor, [...(byVisitor.get(visitor) ?? []), note]);
  }
  const offered: VisitorNote[] = [];
  let waiting = 0;
  for (const [visitor, notes] of byVisitor) {
    const done = [...handled.values()].filter(
      (one) => one.visitor === visitor && one.day === today,
    ).length;
    const room = Math.max(0, VISITOR_NOTES_PER_DAY - done);
    // Oldest first by what the note says, then by id: code units, never the locale.
    const sorted = [...notes].sort((a, b) =>
      a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1,
    );
    for (const note of sorted.slice(0, room)) offered.push({ note, visitor });
    waiting += Math.max(0, sorted.length - room);
  }
  const before = new Set(visitorNotes.offered.map((one) => one.note.id));
  const fresh = [
    ...new Set(offered.filter((one) => !before.has(one.note.id)).map((one) => one.visitor)),
  ];
  const same =
    offered.length === visitorNotes.offered.length &&
    waiting === visitorNotes.waiting &&
    offered.every((one, at) => one.note.id === visitorNotes.offered[at]?.note.id);
  if (!same) publishVisitorNotes({ offered, waiting });
  return fresh;
}

export function clearVisitorNotes(): void {
  if (visitorNotes.offered.length > 0 || visitorNotes.waiting > 0) {
    publishVisitorNotes({ offered: [], waiting: 0 });
  }
}

/** The owner-signed note a visitor's note becomes: their name, `via: "continent"`. */
export function visitorNoteBody(now: WorldNow | null, note: LandNote): NoteBody | null {
  const name = oneLine(note.author).slice(0, HISTORY_LIMITS.nameChars);
  const text = note.text.slice(0, NOTE_MAX_CHARS);
  const { cx, cz, x, z } = note.coord;
  if (name === "" || text.trim() === "" || Math.abs(cx) > 40_000 || Math.abs(cz) > 40_000) {
    return null;
  }
  const chunk = now?.chunks[`${cx},${cz}`];
  const anchors =
    now !== null && chunk !== undefined && chunkStands(now, chunk) ? [chunk.live.id] : [];
  const contested = note.contests === null ? undefined : now?.events[note.contests];
  const contests =
    note.contests !== null && EVENT_ID.test(note.contests) && contested?.kind === "note"
      ? note.contests
      : null;
  return { coord: { cx, cz, x, z }, anchors, text, contests, name, via: "continent" };
}

function settle(note: VisitorNote): void {
  handled.set(note.note.id, { visitor: note.visitor, day: Math.floor(Date.now() / DAY_MS) });
  publishVisitorNotes({
    offered: visitorNotes.offered.filter((one) => one.note.id !== note.note.id),
    waiting: visitorNotes.waiting,
  });
}

/** Keeps a visitor's note: an owner-signed `note` event in this world's history. */
export async function keepVisitorNote(note: VisitorNote): Promise<Result<string>> {
  const instanceId = useLandStore.getState().instanceId;
  if (instanceId === null) return err("continent-no-land", "No world with open land is open.");
  const open = getOpenWorld();
  let target: { worldId: string; now: WorldNow | null; seen: number } | null =
    open !== null && open.instanceId === instanceId
      ? { worldId: open.worldId, now: open.now, seen: open.now.head.n }
      : null;
  if (target === null) {
    // The land's history has not said which world this is yet: ask main where it lives.
    const listed = await window.seed.world.badges();
    if (!listed.ok) return listed;
    const badge = listed.value.find((one) => one.instanceId === instanceId);
    if (badge === undefined) {
      return err(
        "world-not-migrated",
        "This save has no world history yet.",
        "Walk its land once in Play, then try again.",
      );
    }
    const read = await window.seed.world.read(badge.worldId);
    if (!read.ok) return read;
    target = { worldId: badge.worldId, now: null, seen: read.value.status.head.n };
  }
  const body = visitorNoteBody(target.now, note.note);
  if (body === null) {
    settle(note);
    return err("note-invalid", "That note cannot be kept: it has no words or no name.");
  }
  const appended = await window.seed.world.append(target.worldId, {
    kind: "note",
    body,
    seen: target.seen,
  });
  if (!appended.ok) return appended;
  settle(note);
  return ok(appended.value.id);
}

/** Sets a visitor's note aside for this session; it counts toward today's allowance. */
export function setAsideVisitorNote(note: VisitorNote): void {
  settle(note);
}
