// Dotfile writes from the narrative layer (Rule 9). Always serialise from the LATEST store state,
// never from a value captured before the zustand updates ran.

import { checkpointCurrentInstance } from "@renderer/app/usePersistWorld";
import { serializeMeta } from "@renderer/app/worldFiles";
import { useWorldStore } from "@renderer/state/worldStore";
import type { Result } from "@shared/result";
import { ok } from "@shared/result";
import { type KarmaEntry, WORLD_FILES } from "@shared/world";

export function karmaToJsonl(karma: KarmaEntry[]): string {
  return karma.map((entry) => JSON.stringify(entry)).join("\n");
}

/** Writes karma.jsonl + inventory.json from current store state. No-op without a loaded world. */
export async function persistProgress(): Promise<Result<void>> {
  const world = useWorldStore.getState();
  const meta = world.meta;
  if (meta === null) return ok(undefined);
  if (world.origin?.kind === "instance") return checkpointCurrentInstance();

  const karma = await window.seed.worlds.write(
    meta.id,
    WORLD_FILES.karma,
    karmaToJsonl(world.karma),
  );
  if (!karma.ok) return karma;

  const inventory = await window.seed.worlds.write(
    meta.id,
    WORLD_FILES.inventory,
    `${JSON.stringify(world.inventory, null, 2)}\n`,
  );
  if (!inventory.ok) return inventory;
  const nextMeta = { ...meta, floor: world.floor, updatedAt: new Date().toISOString() };
  const metaWrite = await window.seed.worlds.write(
    meta.id,
    WORLD_FILES.meta,
    serializeMeta(nextMeta),
  );
  if (!metaWrite.ok) return metaWrite;
  return ok(undefined);
}
