// A save's land as its legacy files keep it (`instances.readLand`: chunks/, lore.jsonl,
// notes.jsonl). Read in two cases only: a save whose world cannot be made yet (no device key: it
// plays from these files and writes nothing new), and the chunks a migration kept out of the
// history (`legacyOnly`), which are still drawn on this device. A chunk whose program no longer
// parses is shown as failed; its stored words are never replaced by anything.

import { parseErrands, parseScene } from "@dsl";
import { type ChunkStatus, useLandStore } from "@renderer/state";
import { chunkKey } from "@shared/chunks";
import type { LandRecord } from "@shared/land";

/** The record's chunks as the land draws them; `only` (chunk keys) limits which are read. */
export function legacyChunks(
  record: LandRecord,
  only: ReadonlySet<string> | null = null,
): Record<string, ChunkStatus> {
  const chunks: Record<string, ChunkStatus> = {};
  for (const chunk of record.chunks) {
    const key = chunkKey(chunk);
    if (only !== null && !only.has(key)) continue;
    const scene = parseScene(chunk.scene);
    const errands = chunk.errands === undefined ? null : parseErrands(chunk.errands);
    chunks[key] = scene.ok
      ? {
          status: "written",
          scene: scene.value,
          dialogues: chunk.dialogues,
          // A stored errands program that no longer parses leaves the chunk without errands; the
          // scene and words are still what was witnessed. A legacy-only chunk offers none (its
          // progress has no place in the world's progress.json).
          errands: only === null && errands?.ok ? errands.value : null,
        }
      : {
          status: "failed",
          error: {
            code: "witnessed-chunk-invalid",
            message: `The stored program of chunk (${chunk.cx}, ${chunk.cz}) no longer parses: ${scene.error.message}`,
            hint: "Restore this save's chunks folder from a backup.",
          },
        };
  }
  return chunks;
}

/** The whole land from the legacy files, as before worlds had histories. */
export async function loadLegacyLand(instanceId: string): Promise<void> {
  const record = await window.seed.instances.readLand(instanceId);
  if (useLandStore.getState().instanceId !== instanceId) return;
  if (!record.ok) {
    useLandStore.getState().loadFailed(instanceId, record.error);
    return;
  }
  useLandStore
    .getState()
    .loaded(instanceId, legacyChunks(record.value), record.value.lore, record.value.notes);
}
