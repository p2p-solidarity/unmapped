// What two worlds say before they share any land (rev 6 §3.10). A continent room is open to anyone
// who dials its join code, so nothing of a world — its entry, its home, its chunks, lore and
// notes — crosses to a peer until that peer's hello has been checked here: same continent, same
// room protocol, and the same physics (two worlds on different physics would not see the same
// land). Pure, so the client and a future world service run exactly this check.
//
// Chat (simplify-together): a `chat` message is one line a friend typed. It is read here
// (`readChatText`), accepted only from a verified peer and rate-limited by the gate, and its sender
// is named from that world's awareness state (`chatSenderName`), never from the message. A build
// from before chat drops the frame: its `isContinentMessage` knows no `chat` type.

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
  /** The continent's code (its opener's join code) this peer believes it is in. */
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
  | { type: "entries"; entries: ContinentEntry[] }
  /** One line a friend typed. Never stored: not in the document, a save or a history. */
  | { type: "chat"; text: string };

const WORLD_ID = /^[A-Za-z0-9-]{1,96}$/;
const MAX_KEY = 256;
/** Entries per message; a large world's land goes in several. */
export const MAX_ENTRIES = 256;
/** The longest chat line, in characters, once cleaned. */
export const CHAT_MAX_CHARS = 200;
/** A chat frame longer than this (UTF-16 units) is refused before it is even cleaned. */
const CHAT_MAX_RAW = CHAT_MAX_CHARS * 4;
/** The longest name shown for a chat line's sender. */
const CHAT_NAME_CHARS = 40;

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

/**
 * Control and invisible formatting characters: C0, DEL and C1 controls, zero-width marks, line and
 * paragraph separators, bidi embeddings / overrides / isolates, the BOM, and a lone surrogate half.
 */
function hidden(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x2028 && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x206f) ||
    code === 0xfeff ||
    (code >= 0xd800 && code <= 0xdfff)
  );
}

/** One line of text as it may be shown: hidden characters become spaces, runs of space one. */
function oneLine(text: string): string {
  let out = "";
  for (const char of text) out += hidden(char.codePointAt(0) ?? 0) ? " " : char;
  return out.replace(/\s+/g, " ").trim();
}

/**
 * A chat line as this build shows it, or null to drop it: a string, cleaned to one line, not blank
 * and at most CHAT_MAX_CHARS characters. Used on both ends (what is sent, what is received).
 */
export function readChatText(value: unknown): string | null {
  if (typeof value !== "string" || value.length > CHAT_MAX_RAW) return null;
  const text = oneLine(value);
  if (text === "" || [...text].length > CHAT_MAX_CHARS) return null;
  return text;
}

/**
 * Who said a chat line from the verified world `worldId`: the name its awareness state carries.
 * Awareness is the room's, so anyone in it could claim that world under another name; when the
 * states claiming it disagree, the world's own entry (`entryOwner`, written only by that world)
 * decides. Null when neither says: the screen shows "a friend". Never a name from the message.
 */
export function chatSenderName(
  states: Iterable<unknown>,
  worldId: string,
  entryOwner: string | null,
): string | null {
  const names = new Set<string>();
  for (const state of states) {
    if (!record(state) || state.worldId !== worldId || typeof state.name !== "string") continue;
    const name = shortName(state.name);
    if (name !== "") names.add(name);
  }
  if (names.size === 1) return [...names][0] ?? null;
  const owner = entryOwner === null ? "" : shortName(entryOwner);
  return owner === "" ? null : owner;
}

/** A name as a chat line shows it: one line, at most CHAT_NAME_CHARS characters. */
function shortName(text: string): string {
  return [...oneLine(text.slice(0, CHAT_MAX_RAW))].slice(0, CHAT_NAME_CHARS).join("").trim();
}

/** The shape of a message off the wire; entries are checked one by one by `readContinentEntry`. */
export function isContinentMessage(value: unknown): value is ContinentMessage {
  if (!record(value)) return false;
  if (value.type === "hello") return isHello(value.hello);
  if (value.type === "chat") {
    return typeof value.text === "string" && value.text.length <= CHAT_MAX_RAW;
  }
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
