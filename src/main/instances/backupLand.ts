// The witnessed land inside a backup: chunks, lore.jsonl and notes.jsonl of the active save. On
// import every piece is checked by the rules the live writers use (land.ts): each chunk passes
// `witnessChunkSchema` + `validateWitness` against the lore graph as it stood when the chunk was
// witnessed (replayed in lore.jsonl order), and notes are replayed through appendNote's rules —
// unique ids, and a note only answers one written before it. Export runs the same check, so a
// backup that import would refuse is never produced.

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LandNote, LandRecord, WitnessedChunk } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import { err, ok, type Result } from "@shared/result";
import type { z } from "zod";
import type { SaveFiles } from "./backupShape";
import {
  LORE_FILE,
  landNoteSchema,
  loreNodeSchema,
  NOTES_FILE,
  validateWitness,
  witnessChunkSchema,
} from "./land";

const LAND_HINT =
  "The witnessed land in this save is damaged or was edited by hand; export the backup again from the save it came from.";

const invalid = (message: string): Result<never> => err("backup-land-invalid", message, LAND_HINT);

function parseJsonl<T>(text: string, file: string, schema: z.ZodType<T>): Result<T[]> {
  const values: T[] = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim().length === 0) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return invalid(`${file} line ${index + 1} is not JSON.`);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return invalid(
        `${file} line ${index + 1}: ${parsed.error.issues[0]?.message ?? "invalid entry"}`,
      );
    }
    values.push(parsed.data);
  }
  return ok(values);
}

const chunkKey = (cx: number, cz: number): string => `${cx}_${cz}`;

/** Lore in file order, cut into the runs each witness appended (one run per chunk). */
function loreRuns(lore: readonly LoreNode[]): Result<Array<{ key: string; nodes: LoreNode[] }>> {
  const runs: Array<{ key: string; nodes: LoreNode[] }> = [];
  const closed = new Set<string>();
  for (const node of lore) {
    const key = chunkKey(node.coord.cx, node.coord.cz);
    const last = runs.at(-1);
    if (last?.key === key) {
      last.nodes.push(node);
      continue;
    }
    if (closed.has(key)) return invalid(`Lore for chunk ${key} was written twice.`);
    if (last !== undefined) closed.add(last.key);
    runs.push({ key, nodes: [node] });
  }
  return ok(runs);
}

function checkChunk(
  instanceId: string,
  chunk: WitnessedChunk,
  lore: LoreNode[],
  graph: readonly LoreNode[],
): Result<void> {
  const where = `chunks/${chunkKey(chunk.cx, chunk.cz)}`;
  const input = {
    instanceId,
    cx: chunk.cx,
    cz: chunk.cz,
    scene: chunk.scene,
    dialogues: chunk.dialogues,
    ...(chunk.errands === undefined ? {} : { errands: chunk.errands }),
    lore,
  };
  const shaped = witnessChunkSchema.safeParse(input);
  if (!shaped.success) {
    const issue = shaped.error.issues[0];
    return invalid(
      `${where}: ${issue?.path.join(".") || "chunk"} — ${issue?.message ?? "invalid"}`,
    );
  }
  const valid = validateWitness(input, graph);
  return valid.ok ? valid : invalid(`${where}: ${valid.error.message}`);
}

function checkNotes(notes: readonly LandNote[]): Result<void> {
  const seen = new Set<string>();
  for (const note of notes) {
    if (seen.has(note.id)) return invalid(`Note ${note.id} appears twice in ${NOTES_FILE}.`);
    if (note.contests !== null && !seen.has(note.contests)) {
      return invalid(`Note ${note.id} answers ${note.contests}, which is not written before it.`);
    }
    seen.add(note.id);
  }
  return ok(undefined);
}

/** Every rule the live writers enforce, over a whole land at once. `instanceId` only fills the schema. */
export function validateLand(instanceId: string, land: LandRecord): Result<void> {
  const byKey = new Map<string, WitnessedChunk>();
  for (const chunk of land.chunks) {
    const key = chunkKey(chunk.cx, chunk.cz);
    if (byKey.has(key)) return invalid(`Chunk ${key} appears twice.`);
    byKey.set(key, chunk);
  }
  const runs = loreRuns(land.lore);
  if (!runs.ok) return runs;
  const graph: LoreNode[] = [];
  const replayed = new Set<string>();
  for (const run of runs.value) {
    const chunk = byKey.get(run.key);
    if (chunk === undefined)
      return invalid(`Lore names chunk ${run.key}, which is not in the save.`);
    const checked = checkChunk(instanceId, chunk, run.nodes, graph);
    if (!checked.ok) return checked;
    graph.push(...run.nodes);
    replayed.add(run.key);
  }
  // A chunk that added no lore could have been witnessed at any point; it may only name what exists.
  for (const [key, chunk] of byKey) {
    if (replayed.has(key)) continue;
    const checked = checkChunk(instanceId, chunk, [], graph);
    if (!checked.ok) return checked;
  }
  return checkNotes(land.notes);
}

/** The land of an unpacked save slot, parsed and validated. Absent files mean an empty land. */
export function landFromFiles(instanceId: string, slot: SaveFiles): Result<LandRecord> {
  const chunks: WitnessedChunk[] = [];
  for (const [key, files] of slot.chunks) {
    if (files.scene === undefined) {
      return err("backup-incomplete", `chunks/${key} has no scene.oui.`, LAND_HINT);
    }
    chunks.push({
      cx: files.cx,
      cz: files.cz,
      scene: files.scene,
      dialogues: files.dialogues,
      ...(files.errands === undefined ? {} : { errands: files.errands }),
    });
  }
  const lore = parseJsonl(slot.lore ?? "", LORE_FILE, loreNodeSchema);
  if (!lore.ok) return lore;
  const notes = parseJsonl(slot.notes ?? "", NOTES_FILE, landNoteSchema);
  if (!notes.ok) return notes;
  const land = { chunks, lore: lore.value, notes: notes.value };
  const valid = validateLand(instanceId, land);
  return valid.ok ? ok(land) : valid;
}

const jsonl = (values: readonly unknown[]): string =>
  values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;

/** Archive entries for a land, relative to `saves/<saveId>/`. Empty files are left out. */
export function landEntries(land: LandRecord): Record<string, string> {
  const out: Record<string, string> = {};
  if (land.lore.length > 0) out[LORE_FILE] = jsonl(land.lore);
  if (land.notes.length > 0) out[NOTES_FILE] = jsonl(land.notes);
  for (const chunk of land.chunks) {
    const base = `chunks/${chunkKey(chunk.cx, chunk.cz)}`;
    out[`${base}/scene.oui`] = chunk.scene;
    if (chunk.errands !== undefined) out[`${base}/errands.oui`] = chunk.errands;
    for (const [npcId, source] of Object.entries(chunk.dialogues)) {
      out[`${base}/dialogue/${npcId}.oui`] = source;
    }
  }
  return out;
}

/** Writes a validated land into a save directory the way witnessChunk/appendNote lay it out. */
export async function writeLand(saveDir: string, land: LandRecord): Promise<void> {
  for (const [path, text] of Object.entries(landEntries(land))) {
    const target = join(saveDir, ...path.split("/"));
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, text, "utf8");
  }
  // witnessChunk always creates dialogue/, even for a chunk nobody lives in.
  for (const chunk of land.chunks) {
    await mkdir(join(saveDir, "chunks", chunkKey(chunk.cx, chunk.cz), "dialogue"), {
      recursive: true,
    });
  }
}
