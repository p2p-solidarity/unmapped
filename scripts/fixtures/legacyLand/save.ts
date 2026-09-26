// The instance and its active save exactly as a phase-2 build (commit 7cebb2f) leaves them after a
// few days of play: `instance.json`, `saves/default/{save.json,karma.jsonl,lore.jsonl,notes.jsonl}`
// and the witnessed `chunks/`. The JSON keys follow phase 2's zod schemas (`instanceMetaSchema`,
// `saveStateSchema`, `landProgressSchema`, `landNoteSchema`), which is the order its checkpoint
// writes them in; `land.json` is already in that order and only its `$…` tokens are filled in.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { formatSeedCode } from "@shared/seedCode";
import type { Writer } from "./files";
import type { Seeded } from "./seeded";
import type { InstalledWork } from "./works";

/** Phase 2's `INSTANCE_FORMAT_VERSION` and `SAVE_FORMAT_VERSION` (@shared/cartridge at 7cebb2f). */
const INSTANCE_FORMAT = 2;
const SAVE_FORMAT = 2;
const SAVE_ID = "default";
/** What phase 2's New Game names a run of the built-in world: `${manifest.name} · ${seed}`. */
const BUILT_IN_NAME = "無界之地";

export interface FixtureNote {
  key: string;
  author: string;
  at: string;
  coord: { cx: number; cz: number; x: number; z: number };
  anchors: string[];
  text: string;
  contests: string | null;
}

export interface LandFixture {
  player: string;
  language: string;
  cartridge: { cartridgeId: string; version: string };
  runtimePin: { cartridge: { cartridgeId: string; version: string; contentHash: string } };
  createdAt: string;
  updatedAt: string;
  save: Record<string, unknown>;
  notes: FixtureNote[];
}

export interface WrittenSave {
  instanceId: string;
  saveId: string;
  seedCode: string;
  name: string;
  noteIds: Record<string, string>;
  save: Record<string, unknown>;
}

/** Phase 2's `makeInstanceId`: the name's slug and the creation time in base 36. */
function instanceIdOf(name: string, createdAt: string): string {
  const slug =
    name
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "") || "instance";
  return `${slug}-${new Date(createdAt).getTime().toString(36)}`;
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** Fills `$file:`, `$uint32:`, `$note:`, `$work:`, `$draft:` and `$play:` tokens, keeping key order. */
async function fill(
  value: unknown,
  ctx: {
    dir: string;
    ids: Seeded;
    notes: Record<string, string>;
    works: Record<string, InstalledWork>;
  },
): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => fill(item, ctx)));
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = await fill(item, ctx);
    return out;
  }
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const match = /^\$(file|uint32|note|work|draft|play):(.+)$/.exec(value);
  const [, kind, name = ""] = match ?? [];
  const work = ctx.works[name];
  if (kind === "file") return readFile(join(ctx.dir, name), "utf8");
  if (kind === "uint32") return ctx.ids.uint32(name);
  if (kind === "note" && ctx.notes[name] !== undefined) return ctx.notes[name];
  if (kind === "work" && work !== undefined) return work.ref;
  if (kind === "draft" && work !== undefined) return work.draftId;
  if (kind === "play" && work !== undefined) return work.playId;
  throw new Error(`land.json: unknown token ${value}`);
}

async function copyTree(writer: Writer, from: string, to: string): Promise<void> {
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyTree(writer, join(from, entry.name), join(to, entry.name));
    else await writer.file(join(to, entry.name), await readFile(join(from, entry.name)));
  }
}

export async function writeSave(
  writer: Writer,
  dir: string,
  land: LandFixture,
  ids: Seeded,
  works: Record<string, InstalledWork>,
): Promise<WrittenSave> {
  const seedCode = ids.seedCode();
  const name = `${BUILT_IN_NAME} · ${formatSeedCode(seedCode)}`;
  const instanceId = instanceIdOf(name, land.createdAt);
  const noteIds = Object.fromEntries(
    land.notes.map((note) => [note.key, ids.uuid(`note:${note.key}`)]),
  );
  const ctx = { dir, ids, notes: noteIds, works };
  const { cartridge } = land.runtimePin;

  const meta = {
    formatVersion: INSTANCE_FORMAT,
    instanceId,
    name,
    cartridge,
    runtimePin: land.runtimePin,
    activeSaveId: SAVE_ID,
    saveSchemaVersion: 1,
    createdAt: land.createdAt,
    updatedAt: land.updatedAt,
  };
  const save = {
    formatVersion: SAVE_FORMAT,
    instanceId,
    cartridge,
    runtimePin: land.runtimePin,
    saveSchemaVersion: 1,
    ...((await fill(land.save, ctx)) as Record<string, unknown>),
    seed: seedCode,
    language: land.language,
    updatedAt: land.updatedAt,
  };
  const notes = land.notes.map((note) => ({
    id: noteIds[note.key],
    author: note.author,
    at: note.at,
    coord: note.coord,
    anchors: note.anchors,
    text: note.text,
    contests: note.contests === null ? null : noteIds[note.contests.replace(/^\$note:/, "")],
  }));

  const root = join("instances", instanceId);
  const saveDir = join(root, "saves", SAVE_ID);
  await writer.claim(root);
  await writer.file(join(root, "instance.json"), json(meta));
  await writer.file(join(saveDir, "save.json"), json(save));
  await writer.file(join(saveDir, "karma.jsonl"), await readFile(join(dir, "save", "karma.jsonl")));
  await writer.file(join(saveDir, "lore.jsonl"), await readFile(join(dir, "save", "lore.jsonl")));
  await writer.file(
    join(saveDir, "notes.jsonl"),
    `${notes.map((note) => JSON.stringify(note)).join("\n")}\n`,
  );
  await copyTree(writer, join(dir, "save", "chunks"), join(saveDir, "chunks"));
  return { instanceId, saveId: SAVE_ID, seedCode, name, noteIds, save };
}
