// Dotfile writes made by tool effects. Every one goes through `window.seed.worlds.write`, which
// validates the content in main before it touches disk, and every Result is checked: an effect that
// could not be saved reports `ok: false` rather than looking like it worked until the next reload
// (Rule 5).

import { checkpointCurrentInstance } from "@renderer/app/usePersistWorld";
import { serializeInventory, serializeMeta } from "@renderer/app/worldFiles";
import { useWorldStore } from "@renderer/state/worldStore";
import type { AppError } from "@shared/result";
import { type Inventory, WORLD_FILES, type WorldFile, type WorldMeta } from "@shared/world";

const NO_WORLD: AppError = {
  code: "no-world",
  message: "No world is loaded, so there is nothing to change.",
  hint: "open a world first",
};

/** A published cartridge revision never changes during play (plan §一); scenes are remixed instead. */
export const CARTRIDGE_IMMUTABLE: AppError = {
  code: "cartridge-immutable",
  message: "This scene belongs to a published cartridge revision and cannot change during play.",
  hint: "Remix the world in Worlds → My worlds → More to edit its scenes.",
};

function playingInstance(): boolean {
  return useWorldStore.getState().origin?.kind === "instance";
}

/** Save-owned state of an instance goes through the checkpoint, never through world files. */
async function checkpoint(): Promise<AppError | null> {
  const result = await checkpointCurrentInstance();
  return result.ok ? null : result.error;
}

/** Writes one dotfile of the loaded world. Resolves to `null` on success, or the error. */
async function writeFile(file: WorldFile, content: string): Promise<AppError | null> {
  const meta = useWorldStore.getState().meta;
  if (meta === null) return NO_WORLD;
  try {
    const written = await window.seed.worlds.write(meta.id, file, content);
    return written.ok ? null : written.error;
  } catch (error) {
    return {
      code: "ipc-failed",
      message: error instanceof Error ? error.message : String(error),
      hint: `${file} could not be saved; the main process did not answer`,
    };
  }
}

export function persistInventory(inventory: Inventory): Promise<AppError | null> {
  if (playingInstance()) return checkpoint();
  return writeFile(WORLD_FILES.inventory, serializeInventory(inventory));
}

export function persistScene(source: string): Promise<AppError | null> {
  if (playingInstance()) return Promise.resolve(CARTRIDGE_IMMUTABLE);
  return writeFile(WORLD_FILES.scene, source.endsWith("\n") ? source : `${source}\n`);
}

/**
 * Writes meta.json and folds the metadata main hands back (it stamps `updatedAt`) into the store,
 * so the next effect does not write from a stale copy.
 */
export async function persistMeta(meta: WorldMeta): Promise<AppError | null> {
  const store = useWorldStore.getState();
  if (store.meta === null) return NO_WORLD;
  if (playingInstance()) return checkpoint();
  try {
    const written = await window.seed.worlds.write(meta.id, WORLD_FILES.meta, serializeMeta(meta));
    if (!written.ok) return written.error;
    useWorldStore.getState().setMeta(written.value);
    return null;
  } catch (error) {
    return {
      code: "ipc-failed",
      message: error instanceof Error ? error.message : String(error),
      hint: "meta.json could not be saved; the main process did not answer",
    };
  }
}
