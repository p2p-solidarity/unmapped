// Witnessed land inside an instance's active save (plan.md §4, Rule 9):
//
//   saves/<saveId>/chunks/<cx>_<cz>/scene.oui + dialogue/<npcId>.oui   written once, then read-only
//   saves/<saveId>/lore.jsonl                                           append-only lore graph
//
// Everything is validated here before it touches disk: the programs must parse, every resident
// must have exactly its own dialogue, and every lore link must resolve. A chunk that already exists
// is never overwritten — whoever witnessed it first wrote what it is.

import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { validateWitness } from "@dsl/index";
import {
  type AppendNoteInput,
  type LandNote,
  type LandRecord,
  NOTE_MAX_CHARS,
  type WitnessChunkInput,
  type WitnessedChunk,
} from "@shared/land";
import { LORE_KINDS, type LoreNode } from "@shared/lore";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { z } from "zod";
import { saveDir } from "./paths";
import { readInstance } from "./store";

const CHUNK_DIR = /^(-?\d{1,5})_(-?\d{1,5})$/;
const NPC_FILE = /^([a-z][a-z0-9_]{0,31})\.oui$/;
export const LORE_FILE = "lore.jsonl";
export const NOTES_FILE = "notes.jsonl";
const ERRANDS_FILE = "errands.oui";

const coordSchema = z.number().int().min(-40_000).max(40_000);

export const loreNodeSchema: z.ZodType<LoreNode> = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{0,31}@-?\d{1,5},-?\d{1,5}$/),
    kind: z.enum(LORE_KINDS),
    label: z.string().min(1).max(60),
    text: z.string().max(400),
    coord: z.object({ cx: coordSchema, cz: coordSchema }).strict(),
    links: z.array(z.string().max(48)).max(16),
    tone: z.number().min(-1).max(1),
  })
  .strict();

export const landNoteSchema: z.ZodType<LandNote> = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{8,64}$/),
    author: z.string().trim().min(1).max(60),
    at: z.string().min(1).max(40),
    coord: z
      .object({
        cx: coordSchema,
        cz: coordSchema,
        x: z.number().int().min(0).max(31),
        z: z.number().int().min(0).max(31),
      })
      .strict(),
    anchors: z.array(z.string().max(48)).max(8),
    text: z.string().trim().min(1).max(NOTE_MAX_CHARS),
    contests: z.string().max(64).nullable(),
  })
  .strict();

export const appendNoteSchema = z
  .object({ instanceId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/), note: landNoteSchema })
  .strict();

export const witnessChunkSchema = z
  .object({
    instanceId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/),
    cx: coordSchema,
    cz: coordSchema,
    scene: z.string().min(1).max(64_000),
    dialogues: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), z.string().max(16_000)),
    errands: z.string().max(16_000).optional(),
    lore: z.array(loreNodeSchema).max(8),
  })
  .strict();

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function activeSave(
  instancesDir: string,
  instanceId: string,
  cartridgesDir: string | undefined,
): Promise<Result<string>> {
  const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
  if (!instance.ok) return instance;
  return ok(saveDir(instancesDir, instanceId, instance.value.meta.activeSaveId));
}

/** One validated JSON value per non-empty line of an append-only ledger file. */
async function readJsonl<T>(dir: string, file: string, schema: z.ZodType<T>): Promise<Result<T[]>> {
  const path = join(dir, file);
  if (!(await exists(path))) return ok([]);
  const values: T[] = [];
  const lines = (await readFile(path, "utf8")).split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return err(
        "ledger-invalid",
        `${file} line ${index + 1} is not JSON.`,
        `Restore ${file} from a backup.`,
      );
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return err(
        "ledger-invalid",
        `${file} line ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid entry"}`,
        `Restore ${file} from a backup.`,
      );
    }
    values.push(parsed.data);
  }
  return ok(values);
}

const readLore = (dir: string): Promise<Result<LoreNode[]>> =>
  readJsonl(dir, LORE_FILE, loreNodeSchema);

async function readChunk(dir: string, cx: number, cz: number): Promise<WitnessedChunk> {
  const scene = await readFile(join(dir, "scene.oui"), "utf8");
  const errandsPath = join(dir, ERRANDS_FILE);
  const errands = (await exists(errandsPath)) ? await readFile(errandsPath, "utf8") : undefined;
  const dialogues: Record<string, string> = {};
  const dialogueDir = join(dir, "dialogue");
  if (await exists(dialogueDir)) {
    for (const entry of await readdir(dialogueDir)) {
      const match = NPC_FILE.exec(entry);
      if (match?.[1] !== undefined)
        dialogues[match[1]] = await readFile(join(dialogueDir, entry), "utf8");
    }
  }
  return { cx, cz, scene, dialogues, ...(errands === undefined ? {} : { errands }) };
}

export async function readLand(
  instancesDir: string,
  instanceId: string,
  cartridgesDir?: string,
): Promise<Result<LandRecord>> {
  const save = await activeSave(instancesDir, instanceId, cartridgesDir);
  if (!save.ok) return save;
  try {
    const lore = await readLore(save.value);
    if (!lore.ok) return lore;
    const notes = await readJsonl(save.value, NOTES_FILE, landNoteSchema);
    if (!notes.ok) return notes;
    const chunks: WitnessedChunk[] = [];
    const chunksDir = join(save.value, "chunks");
    if (await exists(chunksDir)) {
      for (const entry of await readdir(chunksDir, { withFileTypes: true })) {
        const match = CHUNK_DIR.exec(entry.name);
        if (!entry.isDirectory() || match === null) continue;
        chunks.push(
          await readChunk(join(chunksDir, entry.name), Number(match[1]), Number(match[2])),
        );
      }
    }
    return ok({ chunks, lore: lore.value, notes: notes.value });
  } catch (error) {
    return fail(toError(error, "land-read-failed"));
  }
}

export async function witnessChunk(
  instancesDir: string,
  input: WitnessChunkInput,
  cartridgesDir?: string,
): Promise<Result<WitnessedChunk>> {
  const save = await activeSave(instancesDir, input.instanceId, cartridgesDir);
  if (!save.ok) return save;
  const chunksDir = join(save.value, "chunks");
  const destination = join(chunksDir, `${input.cx}_${input.cz}`);
  const staging = join(chunksDir, `.staging-${input.cx}_${input.cz}-${process.pid}-${Date.now()}`);
  try {
    if (await exists(destination)) {
      return err(
        "chunk-already-witnessed",
        `Chunk (${input.cx}, ${input.cz}) was already witnessed.`,
        "Reload the land; the first witness is what this place is.",
      );
    }
    const graph = await readLore(save.value);
    if (!graph.ok) return graph;
    const valid = validateWitness(input, graph.value);
    if (!valid.ok) return valid;
    await mkdir(join(staging, "dialogue"), { recursive: true });
    await writeFile(join(staging, "scene.oui"), input.scene, "utf8");
    for (const [npcId, source] of Object.entries(input.dialogues)) {
      await writeFile(join(staging, "dialogue", `${npcId}.oui`), source, "utf8");
    }
    if (input.errands !== undefined) {
      await writeFile(join(staging, ERRANDS_FILE), input.errands, "utf8");
    }
    await rename(staging, destination);
    if (input.lore.length > 0) {
      await appendFile(
        join(save.value, LORE_FILE),
        `${input.lore.map((node) => JSON.stringify(node)).join("\n")}\n`,
        "utf8",
      );
    }
    return ok({
      cx: input.cx,
      cz: input.cz,
      scene: input.scene,
      dialogues: input.dialogues,
      ...(input.errands === undefined ? {} : { errands: input.errands }),
    });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "witness-write-failed"));
  }
}

/** Appends one note to the para-ledger. A note is never edited; a disagreement is a new note. */
export async function appendNote(
  instancesDir: string,
  input: AppendNoteInput,
  cartridgesDir?: string,
): Promise<Result<LandNote>> {
  const save = await activeSave(instancesDir, input.instanceId, cartridgesDir);
  if (!save.ok) return save;
  try {
    const notes = await readJsonl(save.value, NOTES_FILE, landNoteSchema);
    if (!notes.ok) return notes;
    if (notes.value.some((note) => note.id === input.note.id)) {
      return err("note-exists", "That note was already written.", "Reload the land.");
    }
    const { contests } = input.note;
    if (contests !== null && !notes.value.some((note) => note.id === contests)) {
      return err(
        "note-contests-missing",
        "The note it answers is not in this world.",
        "Reload the land.",
      );
    }
    await appendFile(join(save.value, NOTES_FILE), `${JSON.stringify(input.note)}\n`, "utf8");
    return ok(input.note);
  } catch (error) {
    return fail(toError(error, "note-write-failed"));
  }
}
