// The only entries a `.spire-backup` may hold, and how big they may be. An archive is untrusted
// input: every entry name must match one of the shapes below exactly (no `..`, no absolute or
// drive paths, no aliases such as `01_0` for chunk `1_0`), and sizes are checked from the central
// directory before anything is inflated, so a small file cannot unpack into gigabytes.
//
//   instance.json
//   saves/<saveId>/{save.json, karma.jsonl, lore.jsonl, notes.jsonl}
//   saves/<saveId>/{world.json, progress.json}             (a save that plays in a world, D6)
//   saves/<saveId>/chunks/<cx>_<cz>/{scene.oui, errands.oui}
//   saves/<saveId>/chunks/<cx>_<cz>/dialogue/<npcId>.oui
//   history/{log.jsonl, outbox.jsonl}                     (that world's history, D6 "Backups")
//
// plus the directory entries for those paths, which some zip tools add.

import { err, ok, type Result, toError } from "@shared/result";
import { strFromU8, unzipSync } from "fflate";
import { validateArchiveEntryNames } from "../archive";

const KIB = 1024;
const MIB = 1024 * KIB;

/** Shared by export and import, so an exported backup is never one that import refuses. */
export const BACKUP_LIMITS = {
  archiveBytes: 256 * MIB,
  totalBytes: 256 * MIB,
  /** The ZIP end record counts entries in 16 bits; zip64 archives are refused. */
  entries: 65_535,
  chunks: 8_192,
  dialoguesPerChunk: 64,
  fileBytes: {
    instance: 64 * KIB,
    save: 16 * MIB,
    karma: 32 * MIB,
    lore: 32 * MIB,
    notes: 16 * MIB,
    scene: 256 * KIB,
    errands: 64 * KIB,
    dialogue: 64 * KIB,
    pin: 4 * MIB,
    progress: 4 * MIB,
    log: 128 * MIB,
    outbox: 16 * MIB,
  },
} as const;

type FileKind = keyof typeof BACKUP_LIMITS.fileBytes;

export const SHAPE_HINT =
  "A .spire-backup holds instance.json and one save: saves/<id>/save.json, karma.jsonl, and its " +
  "witnessed land (lore.jsonl, notes.jsonl, chunks/<cx>_<cz>/scene.oui, errands.oui, " +
  "dialogue/<npc>.oui). Export it again from UNMAPPED.";

const SAVE = "([a-z0-9][a-z0-9-]{0,63})";
const COORD = "(-?[0-9]{1,5})";
const SAVE_FILE = new RegExp(
  `^saves/${SAVE}/(save\\.json|karma\\.jsonl|lore\\.jsonl|notes\\.jsonl|world\\.json|progress\\.json)$`,
);
const HISTORY_FILE = /^history\/(log|outbox)\.jsonl$/;
const SAVE_FILE_KIND = {
  save: "save",
  karma: "karma",
  lore: "lore",
  notes: "notes",
  world: "pin",
  progress: "progress",
} as const;
const CHUNK_FILE = new RegExp(`^saves/${SAVE}/chunks/${COORD}_${COORD}/(scene|errands)\\.oui$`);
const DIALOGUE_FILE = new RegExp(
  `^saves/${SAVE}/chunks/${COORD}_${COORD}/dialogue/([a-z][a-z0-9_]{0,31})\\.oui$`,
);
const DIRECTORY = new RegExp(
  `^saves/(?:${SAVE}/(?:chunks/(?:${COORD}_${COORD}/(?:dialogue/)?)?)?)?$`,
);
/** The land store's own coordinate bound (land.ts `coordSchema`). */
const COORD_LIMIT = 40_000;

export interface ChunkFiles {
  cx: number;
  cz: number;
  scene?: string;
  errands?: string;
  dialogues: Record<string, string>;
}

export interface SaveFiles {
  save?: string;
  karma?: string;
  lore?: string;
  notes?: string;
  /** `world.json` and `progress.json` (rev 6 phase 3). */
  pin?: string;
  progress?: string;
  /** Keyed `${cx}_${cz}`, canonical integers only. */
  chunks: Map<string, ChunkFiles>;
}

export interface BackupFiles {
  instance: string | null;
  /** The save's world history (`history/log.jsonl`, `history/outbox.jsonl`), when it has one. */
  history: { log?: string; outbox?: string };
  /** Every save id an entry or a directory names; only the active one may appear. */
  saves: Map<string, SaveFiles>;
}

/** A canonical, in-range integer: `1` but never `01`, `-0` or `+1`, so no two names alias. */
function coord(text: string): number | null {
  const value = Number(text);
  return String(value) === text && Math.abs(value) <= COORD_LIMIT ? value : null;
}

type Entry =
  | { kind: "instance" }
  | { kind: "history"; file: "log" | "outbox" }
  | { kind: "directory"; saveId: string | null; chunk: [string, string] | null }
  | { kind: "save-file"; saveId: string; file: SaveFileKind }
  | { kind: "chunk-file"; saveId: string; cx: string; cz: string; file: "scene" | "errands" }
  | { kind: "dialogue"; saveId: string; cx: string; cz: string; npcId: string };

type SaveFileKind = (typeof SAVE_FILE_KIND)[keyof typeof SAVE_FILE_KIND];

function classify(name: string): Entry | null {
  if (name === "instance.json") return { kind: "instance" };
  if (name === "history/") return { kind: "directory", saveId: null, chunk: null };
  const history = HISTORY_FILE.exec(name);
  if (history?.[1] !== undefined) return { kind: "history", file: history[1] as "log" | "outbox" };
  const directory = DIRECTORY.exec(name);
  if (directory !== null) {
    const [, saveId, cx, cz] = directory;
    return {
      kind: "directory",
      saveId: saveId ?? null,
      chunk: cx === undefined || cz === undefined ? null : [cx, cz],
    };
  }
  const saveFile = SAVE_FILE.exec(name);
  if (saveFile?.[1] !== undefined && saveFile[2] !== undefined) {
    const stem = saveFile[2].split(".")[0] as keyof typeof SAVE_FILE_KIND;
    return { kind: "save-file", saveId: saveFile[1], file: SAVE_FILE_KIND[stem] };
  }
  const chunkFile = CHUNK_FILE.exec(name);
  if (chunkFile !== null) {
    const [, saveId = "", cx = "", cz = "", file = ""] = chunkFile;
    return { kind: "chunk-file", saveId, cx, cz, file: file as "scene" | "errands" };
  }
  const dialogue = DIALOGUE_FILE.exec(name);
  if (dialogue !== null) {
    const [, saveId = "", cx = "", cz = "", npcId = ""] = dialogue;
    return { kind: "dialogue", saveId, cx, cz, npcId };
  }
  return null;
}

function kindOf(entry: Entry): FileKind | null {
  switch (entry.kind) {
    case "instance":
      return "instance";
    case "history":
      return entry.file;
    case "directory":
      return null;
    case "save-file":
      return entry.file;
    case "chunk-file":
      return entry.file;
    case "dialogue":
      return "dialogue";
  }
}

function unsafe(name: string): boolean {
  return (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\\") ||
    name.split("/").some((segment) => segment === ".." || segment === ".")
  );
}

/** The end record's entry count; zip64 archives (which can claim billions) are refused. */
function entryCount(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 22 - 65_535); end -= 1) {
    if (view.getUint32(end, true) !== 0x06054b50) continue;
    if (end >= 20 && view.getUint32(end - 20, true) === 0x07064b50) return null;
    return view.getUint16(end + 10, true);
  }
  return null;
}

const tooLarge = (what: string): Result<never> =>
  err(
    "backup-too-large",
    `${what} is larger than a .spire-backup may be.`,
    "This backup was not made by UNMAPPED, or its save outgrew what one backup can hold.",
  );

/** Checks every name and size, then inflates only what passed. Nothing is written anywhere. */
export function readBackupFiles(bytes: Uint8Array): Result<BackupFiles> {
  if (bytes.length > BACKUP_LIMITS.archiveBytes) return tooLarge("The archive");
  const names = validateArchiveEntryNames(bytes, "backup-duplicate");
  if (!names.ok) return names;
  const count = entryCount(bytes);
  if (count === null) {
    return err("backup-unreadable", "The archive's end record is missing or zip64.", SHAPE_HINT);
  }
  if (count > BACKUP_LIMITS.entries) return tooLarge(`An archive of ${count} entries`);

  let refusal: Result<never> | null = null;
  let total = 0;
  const entries = new Map<string, Entry>();
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        if (refusal !== null) return false;
        if (unsafe(file.name)) {
          refusal = err("backup-unsafe", `Refusing archive entry ${file.name}.`, SHAPE_HINT);
          return false;
        }
        const entry = classify(file.name);
        if (entry === null) {
          refusal = err("backup-unknown-file", `Unexpected entry ${file.name}.`, SHAPE_HINT);
          return false;
        }
        const kind = kindOf(entry);
        const size = Math.max(file.size, file.originalSize);
        const cap = kind === null ? 0 : BACKUP_LIMITS.fileBytes[kind];
        total += size;
        if (size > cap) {
          refusal =
            kind === null
              ? err("backup-unknown-file", `Directory ${file.name} has content.`, SHAPE_HINT)
              : tooLarge(file.name);
          return false;
        }
        if (total > BACKUP_LIMITS.totalBytes) {
          refusal = tooLarge("The unpacked backup");
          return false;
        }
        entries.set(file.name, entry);
        return kind !== null;
      },
    });
  } catch (error) {
    return err(
      "backup-unreadable",
      "That file is not a readable .spire-backup archive.",
      `Export it again from UNMAPPED. (${toError(error).message})`,
    );
  }
  if (refusal !== null) return refusal;
  return collect(entries, unzipped);
}

function slotOf(saves: Map<string, SaveFiles>, saveId: string): SaveFiles {
  const existing = saves.get(saveId);
  if (existing !== undefined) return existing;
  const created: SaveFiles = { chunks: new Map() };
  saves.set(saveId, created);
  return created;
}

function chunkOf(slot: SaveFiles, cx: string, cz: string): Result<ChunkFiles> {
  const x = coord(cx);
  const z = coord(cz);
  if (x === null || z === null) {
    return err(
      "backup-unknown-file",
      `Chunk ${cx}_${cz} is not a canonical coordinate.`,
      SHAPE_HINT,
    );
  }
  const key = `${x}_${z}`;
  const existing = slot.chunks.get(key);
  if (existing !== undefined) return ok(existing);
  if (slot.chunks.size >= BACKUP_LIMITS.chunks)
    return tooLarge(`A land of over ${BACKUP_LIMITS.chunks} chunks`);
  const created: ChunkFiles = { cx: x, cz: z, dialogues: {} };
  slot.chunks.set(key, created);
  return ok(created);
}

function collect(
  entries: Map<string, Entry>,
  unzipped: Record<string, Uint8Array>,
): Result<BackupFiles> {
  const out: BackupFiles = { instance: null, history: {}, saves: new Map() };
  for (const [name, entry] of entries) {
    if (entry.kind === "directory") {
      if (entry.saveId === null) continue;
      const slot = slotOf(out.saves, entry.saveId);
      if (entry.chunk !== null) {
        const chunk = chunkOf(slot, entry.chunk[0], entry.chunk[1]);
        if (!chunk.ok) return chunk;
      }
      continue;
    }
    const raw = unzipped[name];
    if (raw === undefined)
      return err("backup-incomplete", `${name} could not be read.`, SHAPE_HINT);
    const text = strFromU8(raw);
    if (entry.kind === "instance") {
      out.instance = text;
      continue;
    }
    if (entry.kind === "history") {
      out.history[entry.file] = text;
      continue;
    }
    const slot = slotOf(out.saves, entry.saveId);
    if (entry.kind === "save-file") {
      slot[entry.file] = text;
      continue;
    }
    const chunk = chunkOf(slot, entry.cx, entry.cz);
    if (!chunk.ok) return chunk;
    if (entry.kind === "chunk-file") {
      chunk.value[entry.file] = text;
      continue;
    }
    if (Object.keys(chunk.value.dialogues).length >= BACKUP_LIMITS.dialoguesPerChunk) {
      return tooLarge(`Chunk ${entry.cx}_${entry.cz}'s dialogue list`);
    }
    chunk.value.dialogues[entry.npcId] = text;
  }
  return ok(out);
}
