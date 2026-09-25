// What two worlds say before they share any land (rev 6 §3.10). A continent room is open to anyone
// who dials its door number, so nothing of a world — its entry, its home, its chunks, lore and
// notes — crosses to a peer until that peer's hello has been checked here: same continent, same
// room protocol, and the same physics (two worlds on different physics would not see the same
// land). Pure, so the client and a future world service run exactly this check.

import {
  CONTINENT_PROTOCOL,
  readChunkEntry,
  readNoteEntry,
  readWorldEntry,
  splitWorldKey,
} from "./continent";
import { type AppError, err, ok, type Result } from "./result";

export interface ContinentHello {
  protocol: number;
  /** The continent's code (door number) this peer believes it is in. */
  code: string;
  worldId: string;
  physicsVersion: number;
}

export const CONTINENT_MAPS = ["worlds", "chunks", "notes"] as const;
export type ContinentMapName = (typeof CONTINENT_MAPS)[number];

/** One document entry; `value: null` removes it (only a world leaving removes anything). */
export interface ContinentEntry {
  map: ContinentMapName;
  key: string;
  value: unknown;
}

export type ContinentMessage =
  | { type: "hello"; hello: ContinentHello }
  | { type: "reject"; error: AppError }
  | { type: "entries"; entries: ContinentEntry[] };

const WORLD_ID = /^[A-Za-z0-9-]{1,96}$/;
const MAX_KEY = 256;
/** Entries per message; a large world's land goes in several. */
export const MAX_ENTRIES = 256;

export function continentHello(input: Omit<ContinentHello, "protocol">): ContinentHello {
  return { protocol: CONTINENT_PROTOCOL, ...input };
}

function reject(code: string, message: string): Result<void> {
  return err(code, message, "Both worlds need this build's continent protocol and physics.");
}

/** Whether `remote` may see this world's land and send its own. */
export function validateContinentHello(
  local: ContinentHello,
  remote: ContinentHello,
): Result<void> {
  if (remote.protocol !== local.protocol) {
    return reject("continent-protocol-mismatch", "That world speaks another continent protocol.");
  }
  if (remote.code !== local.code) {
    return reject("continent-code-mismatch", "That world is on another continent.");
  }
  if (remote.physicsVersion !== local.physicsVersion) {
    return reject(
      "continent-physics-mismatch",
      `That world was made on physics ${remote.physicsVersion}; this one on ${local.physicsVersion}.`,
    );
  }
  if (!WORLD_ID.test(remote.worldId)) {
    return reject("continent-hello-invalid", "That world did not say who it is.");
  }
  if (remote.worldId === local.worldId) {
    return reject("continent-same-world", "This world is already on the continent elsewhere.");
  }
  return ok(undefined);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHello(value: unknown): value is ContinentHello {
  return (
    record(value) &&
    Number.isSafeInteger(value.protocol) &&
    typeof value.code === "string" &&
    value.code.length <= 32 &&
    typeof value.worldId === "string" &&
    value.worldId.length <= 96 &&
    Number.isSafeInteger(value.physicsVersion)
  );
}

/** An entry this build can store: a known map, a bounded key, and a value its reader accepts. */
export function readContinentEntry(value: unknown): ContinentEntry | null {
  if (!record(value) || typeof value.key !== "string" || value.key.length > MAX_KEY) return null;
  const map = CONTINENT_MAPS.find((one) => one === value.map);
  if (map === undefined) return null;
  if (value.value === null) return map === "worlds" ? { map, key: value.key, value: null } : null;
  const read =
    map === "worlds"
      ? readWorldEntry(value.value)
      : map === "chunks"
        ? readChunkEntry(value.value)
        : readNoteEntry(value.value);
  if (read === null) return null;
  // A world's entry is filed under its own id; anything else is a forgery or a bug.
  if (map === "worlds" && (read as { worldId: string }).worldId !== value.key) return null;
  return { map, key: value.key, value: read };
}

/**
 * Whether a verified peer (`sender`, its hello's world) may write this entry. A world's entry and
 * the chunks it witnessed are its owner's alone; a note may be left on anyone's land (it is filed
 * under the land's owner). Chunks and notes are written once: history is never overwritten.
 */
export function mayWrite(entry: ContinentEntry, sender: string, exists: boolean): boolean {
  if (entry.map === "worlds") return entry.key === sender;
  if (exists || entry.value === null) return false;
  return entry.map === "notes" || splitWorldKey(entry.key)?.worldId === sender;
}

/** The shape of a message off the wire; entries are checked one by one by `readContinentEntry`. */
export function isContinentMessage(value: unknown): value is ContinentMessage {
  if (!record(value)) return false;
  if (value.type === "hello") return isHello(value.hello);
  if (value.type === "reject") {
    return (
      record(value.error) &&
      typeof value.error.code === "string" &&
      typeof value.error.message === "string"
    );
  }
  return (
    value.type === "entries" && Array.isArray(value.entries) && value.entries.length <= MAX_ENTRIES
  );
}
