// Brings an instance's witnessed land into the land store: every stored chunk parsed back from its
// Scene program, and the lore graph. A chunk whose program no longer parses is shown as failed —
// its stored words are never replaced by anything.

import { parseErrands, parseScene } from "@dsl";
import { type ChunkStatus, useLandStore } from "@renderer/state";
import { chunkKey } from "@shared/chunks";

export async function loadLand(instanceId: string): Promise<void> {
  useLandStore.getState().beginLoad(instanceId);
  const record = await window.seed.instances.readLand(instanceId);
  if (!record.ok) {
    useLandStore.getState().loadFailed(instanceId, record.error);
    return;
  }
  const chunks: Record<string, ChunkStatus> = {};
  for (const chunk of record.value.chunks) {
    const scene = parseScene(chunk.scene);
    const errands = chunk.errands === undefined ? null : parseErrands(chunk.errands);
    chunks[chunkKey(chunk)] = scene.ok
      ? {
          status: "written",
          scene: scene.value,
          dialogues: chunk.dialogues,
          // A stored errands program that no longer parses leaves the chunk without errands;
          // the scene and words are still what was witnessed.
          errands: errands?.ok ? errands.value : null,
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
  useLandStore.getState().loaded(instanceId, chunks, record.value.lore, record.value.notes);
}
