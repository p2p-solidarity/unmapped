// `saves/<saveId>/world.json` and `progress.json` (rev 6 phase 3, D1, D6). `save.json` keeps its
// exact legacy shape (its schemas are strict); these two files sit beside it and are owned here.
//
// - world.json pins the save to a world. It is the commit point of a migration: written last,
//   after the history is in place and progress.json is written.
// - progress.json is this player's progress in the world. The migration plan builds it from the
//   legacy land fields; every catch-up merges it again, and it never regresses: an errand's stage
//   only moves forward, a cleared episode or place stays cleared, found/felled/met only grow.

import { join } from "node:path";
import { CHAPTER_LIMITS } from "@shared/chapter";
import { CONTENT_HASH, EVENT_ID, placeIdOf } from "@shared/history/ids";
import { ok, type Result } from "@shared/result";
import type { Skipped } from "@shared/worldApi";
import {
  emptyWorldProgress,
  WORLD_PROGRESS_LIMITS,
  type WorldEpisodeProgress,
  type WorldPlaceProgress,
  type WorldProgress,
  worldProgressSchema,
} from "@shared/worldProgress";
import { z } from "zod";
import type { SourceDigest } from "./dslSeam";
import { readJsonFile, writeJsonAtomic } from "./fsx";
import { PROGRESS_FILE, WORLD_PIN_FILE } from "./paths";

/** `world.json`: which world this save plays in, and what its migration read. */
export interface WorldPin {
  v: 1;
  worldId: string;
  /** Null for a save that joined someone's world (nothing of its own was migrated). */
  migrated: { at: string; source: SourceDigest; skipped: Skipped[] } | null;
}

const hash = z.custom<SourceDigest["chunks"]>(
  (value) => typeof value === "string" && CONTENT_HASH.test(value),
);
const count = z.number().int().min(0).max(1_000_000);

export const sourceDigestSchema: z.ZodType<SourceDigest> = z.strictObject({
  counts: z.strictObject({
    chunks: count,
    lore: count,
    notes: count,
    places: count,
    storyMore: count,
    episodes: count,
    errands: count,
  }),
  chunks: hash,
  lore: hash,
  notes: hash,
  land: hash,
});

const skippedSchema: z.ZodType<Skipped> = z.strictObject({
  what: z.string().min(1).max(40),
  key: z.string().max(200),
  code: z.string().min(1).max(64),
  message: z.string().max(500),
});

export const worldPinSchema: z.ZodType<WorldPin> = z.strictObject({
  v: z.literal(1),
  worldId: z.string().regex(EVENT_ID),
  migrated: z
    .strictObject({
      at: z.string().min(1).max(40),
      source: sourceDigestSchema,
      skipped: z.array(skippedSchema).max(10_000),
    })
    .nullable(),
});

const PIN_HINT = "world.json is damaged; restore this save from a backup.";

export function readWorldPin(saveDir: string): Promise<Result<WorldPin | null>> {
  return readJsonFile(join(saveDir, WORLD_PIN_FILE), worldPinSchema, "world-pin-invalid", PIN_HINT);
}

export function writeWorldPin(saveDir: string, pin: WorldPin): Promise<void> {
  return writeJsonAtomic(join(saveDir, WORLD_PIN_FILE), pin);
}

/** The save's progress in `worldId` (empty when the file is absent or for another world). */
export async function readProgress(
  saveDir: string,
  worldId: string,
): Promise<Result<WorldProgress>> {
  const read = await readJsonFile(
    join(saveDir, PROGRESS_FILE),
    worldProgressSchema,
    "progress-invalid",
    "Restore this save from a backup.",
  );
  if (!read.ok) return read;
  return ok(
    read.value !== null && read.value.worldId === worldId
      ? read.value
      : emptyWorldProgress(worldId),
  );
}

export function writeProgress(saveDir: string, progress: WorldProgress): Promise<void> {
  return writeJsonAtomic(join(saveDir, PROGRESS_FILE), progress);
}

const STAGE_RANK = { accepted: 0, reached: 1, done: 2 } as const;

function union(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])].slice(0, CHAPTER_LIMITS.doneIds);
}

function mergeEpisode(a: WorldEpisodeProgress, b: WorldEpisodeProgress): WorldEpisodeProgress {
  const playId = a.playId ?? b.playId;
  return {
    cleared: a.cleared || b.cleared,
    summary: a.summary ?? b.summary,
    found: union(a.found, b.found),
    felled: union(a.felled, b.felled),
    met: union(a.met, b.met),
    ...(playId === undefined ? {} : { playId }),
  };
}

function mergePlace(a: WorldPlaceProgress, b: WorldPlaceProgress): WorldPlaceProgress {
  const playId = a.playId ?? b.playId;
  return { cleared: a.cleared || b.cleared, ...(playId === undefined ? {} : { playId }) };
}

function capped<T>(record: Record<string, T>, limit: number): Record<string, T> {
  return Object.fromEntries(Object.entries(record).slice(0, limit));
}

/** `current` with everything `incoming` adds; nothing in `current` moves backwards. */
export function mergeProgress(current: WorldProgress, incoming: WorldProgress): WorldProgress {
  const errands = { ...current.errands };
  for (const [key, stage] of Object.entries(incoming.errands)) {
    const had = errands[key];
    if (had === undefined || STAGE_RANK[stage] > STAGE_RANK[had]) errands[key] = stage;
  }
  const episodes = { ...current.episodes };
  for (const [id, episode] of Object.entries(incoming.episodes)) {
    const had = episodes[id];
    episodes[id] = had === undefined ? episode : mergeEpisode(had, episode);
  }
  const places = { ...current.places };
  for (const [id, place] of Object.entries(incoming.places)) {
    const had = places[id];
    places[id] = had === undefined ? place : mergePlace(had, place);
  }
  return {
    v: 1,
    worldId: current.worldId,
    errands: capped(errands, WORLD_PROGRESS_LIMITS.errands),
    episodes: capped(episodes, WORLD_PROGRESS_LIMITS.episodes),
    places: capped(places, WORLD_PROGRESS_LIMITS.places),
  };
}

/**
 * The same progress in another world (D7 adoption, or a plan rebased onto the save's world):
 * witness ids in errand keys follow `idMap` (old event id → new), and a place keyed by its event
 * ("p" + 8 of the id) follows its place event. Legacy place ids ("p1"…) and episode ids stay. Keys
 * whose event did not survive are returned in `lost`, never silently dropped.
 */
export function remapProgress(
  progress: WorldProgress,
  worldId: string,
  idMap: ReadonlyMap<string, string>,
  placeEvents: readonly string[],
): { progress: WorldProgress; lost: string[] } {
  const out = emptyWorldProgress(worldId);
  const lost: string[] = [];
  for (const [key, stage] of Object.entries(progress.errands)) {
    const cut = key.indexOf(":");
    const mapped = idMap.get(key.slice(0, cut));
    if (mapped === undefined) lost.push(`errand ${key}`);
    else out.errands[`${mapped}${key.slice(cut)}`] = stage;
  }
  out.episodes = { ...progress.episodes };
  const placeIds = new Map<string, string>();
  for (const id of placeEvents) {
    const mapped = idMap.get(id);
    if (mapped !== undefined) placeIds.set(placeIdOf(id), placeIdOf(mapped));
  }
  for (const [id, place] of Object.entries(progress.places)) {
    const mapped = /^p[0-9]{1,3}$/.test(id) ? id : placeIds.get(id);
    if (mapped === undefined) lost.push(`place ${id}`);
    else out.places[mapped] = place;
  }
  return { progress: out, lost };
}
