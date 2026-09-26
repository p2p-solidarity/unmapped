// A mirror (rev 6 phase 4, D5): a world this service holds but does not write. `bun run service --
// import <file>` stores a `.world`'s log verbatim, receipts under the old service's key (or none, for
// a world never attached), with `imported.json` beside it; loading accepts that foreign key only for
// a world so marked (every other foreign log stays `world-key-foreign`, unserved).
//
// A mirror serves reads under the world's door, as any world does, and writes nothing: submits get
// `world-mirror-only`, claims are refused at once (so no client spends a model call on a place it
// could never write), and beats are not computed. The one thing it sequences is a rehost (P3 D2's
// schedule, unchanged): an owner's or a co-owner's `sequencer` naming this service's key, at
// head + 1, signed with this key — from that entry on the world is this service's and is served
// like any other. A world that was never attached has no receipts to continue; its owner attaches
// it here instead (./attach), which re-receipts the whole log.

import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Head, HistoryEvent, WorldNow } from "@shared/history/types";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { ToService } from "@shared/worldProtocol";
import type { Hub, Session } from "./hub";
import type { FileStore } from "./store";

export const IMPORTED_FILE = "imported.json";

export interface ImportedMarker {
  v: 1;
  at: string;
  /** sha256 of the `.world` it came from. */
  file: string;
  head: Head;
}

function markerPath(store: FileStore, world: string): string {
  return join(store.root, "worlds", world, IMPORTED_FILE);
}

/** Whether `world` came from a `.world` file (so its receipts may be another service's). */
export function isImported(store: FileStore, world: string): boolean {
  return existsSync(markerPath(store, world));
}

export function writeImported(store: FileStore, world: string, marker: ImportedMarker): void {
  const path = markerPath(store, world);
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  const fd = openSync(temp, "wx", 0o644);
  try {
    writeFileSync(fd, `${JSON.stringify(marker)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

/**
 * A never-attached mirror's log, re-receipted by its owner's attach (./attach): the same entries
 * with their receipts, written aside, fsynced, and renamed over the old copy.
 */
export function replaceMirrorLog(
  store: FileStore,
  world: string,
  lines: readonly string[],
): Result<void> {
  const dir = join(store.root, "worlds", world);
  const path = join(dir, "log.jsonl");
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  try {
    const fd = openSync(temp, "wx", 0o644);
    try {
      writeFileSync(fd, `${lines.join("\n")}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, path);
    return ok(undefined);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return err("service-storage", `Could not write ${path}: ${detail}`, "Check the data disk.");
  }
}

/** A mirror here: the world's current receipt key is not this service's (or it has none). */
export function isMirror(now: Pick<WorldNow, "sequencer">, serviceKey: string): boolean {
  return now.sequencer?.key !== serviceKey;
}

export function mirrorOnly(now: Pick<WorldNow, "sequencer">): AppError {
  return now.sequencer === null
    ? {
        code: "world-mirror-only",
        message: "This service holds a copy of this world but does not write it.",
        hint: "Its owner can attach it here from the device that made it.",
      }
    : {
        code: "world-mirror-only",
        message: "This service holds a copy of this world but does not write it.",
        hint: "An owner moves the world here by sending a sequencer for this service.",
      };
}

/**
 * Why `event` may not be sequenced into the fold `now`, a mirror, or null when it may: only a
 * rehost — a `sequencer` naming this service's key on a world some service already receipted
 * (`admit` then checks that its author owns the world).
 */
export function mirrorRefusal(
  now: WorldNow,
  event: HistoryEvent,
  serviceKey: string,
): AppError | null {
  if (!isMirror(now, serviceKey)) return null;
  if (now.sequencer !== null && event.kind === "sequencer" && event.body.key === serviceKey) {
    return null;
  }
  return mirrorOnly(now);
}

/** A claim on a mirror: refused at once, with `claimed: refused` so no client waits on it. */
export function refuseMirrorClaim(
  hub: Hub,
  session: Session,
  frame: Extract<ToService, { t: "claim" }>,
): boolean {
  const world = hub.worlds.get(frame.world);
  if (world === undefined || !isMirror(world.now, hub.key.key)) return false;
  hub.refuse(session, frame.world, mirrorOnly(world.now));
  hub.send(session, { t: "claimed", world: frame.world, target: frame.target, status: "refused" });
  return true;
}
