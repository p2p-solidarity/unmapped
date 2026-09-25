// The world store is the live copy; the dotfiles are the save. Every karma/inventory/floor change
// is written back through IPC, debounced so a burst of choices costs one write.

import { useSessionStore, useWorldStore, type WorldState } from "@renderer/state";
import { ok, type Result } from "@shared/result";
import type { Inventory, KarmaEntry, WorldMeta } from "@shared/world";
import { WORLD_FILES } from "@shared/world";
import { useEffect } from "react";
import { createDebouncer } from "./debounce";
import { serializeKarmaJsonl } from "./karmaFile";
import { serializeInventory, serializeMeta } from "./worldFiles";

const WRITE_DEBOUNCE_MS = 300;

export type PersistSlice = Pick<WorldState, "meta" | "karma" | "inventory" | "floor" | "hydrating">;

export interface PersistPlan {
  karma: boolean;
  inventory: boolean;
  meta: boolean;
}

const NOTHING: PersistPlan = { karma: false, inventory: false, meta: false };
let checkpointTail: Promise<void> = Promise.resolve();

/**
 * What this store transition must write. Pure so the "never write during a load" rule is tested.
 * Nothing is written while the store is hydrating from disk, when there is no world, or when the
 * world changed identity (that is a load, not an edit).
 */
export function persistPlan(state: PersistSlice, previous: PersistSlice): PersistPlan {
  if (state.hydrating || previous.hydrating) return NOTHING;
  const meta = state.meta;
  if (meta === null || previous.meta === null || previous.meta.id !== meta.id) return NOTHING;
  return {
    karma: state.karma !== previous.karma,
    inventory: state.inventory !== previous.inventory,
    meta: state.floor !== previous.floor,
  };
}

function toastError(file: string, message: string): void {
  useSessionStore.getState().toast("danger", `${file} could not be saved: ${message}`);
}

async function writeKarma(worldId: string, karma: KarmaEntry[]): Promise<void> {
  const result = await window.seed.worlds.write(
    worldId,
    WORLD_FILES.karma,
    serializeKarmaJsonl(karma),
  );
  if (!result.ok) toastError("karma.jsonl", result.error.message);
}

async function writeInventory(worldId: string, inventory: Inventory): Promise<void> {
  const result = await window.seed.worlds.write(
    worldId,
    WORLD_FILES.inventory,
    serializeInventory(inventory),
  );
  if (!result.ok) toastError("inventory.json", result.error.message);
}

async function writeMeta(meta: WorldMeta, floor: number): Promise<void> {
  const next: WorldMeta = { ...meta, floor, updatedAt: new Date().toISOString() };
  const result = await window.seed.worlds.write(meta.id, WORLD_FILES.meta, serializeMeta(next));
  if (!result.ok) toastError("meta.json", result.error.message);
}

async function performInstanceCheckpoint(): Promise<Result<void>> {
  const world = useWorldStore.getState();
  const origin = world.origin;
  const meta = world.meta;
  if (origin?.kind !== "instance" || meta === null) return ok(undefined);
  const expectedUpdatedAt = meta.updatedAt;
  const result = await window.seed.instances.checkpoint({
    instanceId: origin.instanceId,
    expectedUpdatedAt,
    flags: meta.flags,
    inventory: world.inventory,
    mutation: meta.mutation,
    karma: world.karma,
  });
  if (!result.ok) return result;
  const latest = useWorldStore.getState();
  if (
    latest.origin?.kind === "instance" &&
    latest.origin.instanceId === origin.instanceId &&
    latest.meta?.updatedAt === expectedUpdatedAt
  ) {
    latest.setMeta({ ...latest.meta, updatedAt: result.value.updatedAt });
  }
  return ok(undefined);
}

/** Serialises checkpoints so optimistic timestamps cannot race within one renderer session. */
export function checkpointCurrentInstance(): Promise<Result<void>> {
  const task = checkpointTail.then(performInstanceCheckpoint);
  checkpointTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/**
 * Mounted once by App. Writes only on a *change* to an already-loaded world: the transition from
 * "no world" to "world" is the initial load, which must never write the files back.
 */
export function usePersistWorld(): void {
  useEffect(() => {
    const debouncer = createDebouncer();
    const unsubscribe = useWorldStore.subscribe((state, previous) => {
      if (state.origin?.kind === "instance" && previous.origin?.kind === "instance") {
        const sameInstance = state.origin.instanceId === previous.origin.instanceId;
        const progressChanged =
          state.karma !== previous.karma ||
          state.inventory !== previous.inventory ||
          state.meta?.flags !== previous.meta?.flags ||
          state.meta?.mutation !== previous.meta?.mutation;
        if (sameInstance && progressChanged && !state.hydrating) {
          debouncer.schedule("instance", WRITE_DEBOUNCE_MS, () => {
            void checkpointCurrentInstance().then((result) => {
              if (!result.ok) toastError("save.json", result.error.message);
            });
          });
        }
        return;
      }
      if (state.origin?.kind !== "legacy" || previous.origin?.kind !== "legacy") {
        debouncer.cancelAll();
        return;
      }
      const meta = state.meta;
      // No world, or a different world than the previous snapshot => this is a load, not an edit.
      if (meta === null || previous.meta === null || previous.meta.id !== meta.id) {
        debouncer.cancelAll();
        return;
      }
      const plan = persistPlan(state, previous);
      if (plan.karma) {
        const karma = state.karma;
        debouncer.schedule("karma", WRITE_DEBOUNCE_MS, () => void writeKarma(meta.id, karma));
      }
      if (plan.inventory) {
        const inventory = state.inventory;
        debouncer.schedule("inventory", WRITE_DEBOUNCE_MS, () => {
          void writeInventory(meta.id, inventory);
        });
      }
      if (plan.meta) {
        const floor = state.floor;
        debouncer.schedule("meta", WRITE_DEBOUNCE_MS, () => void writeMeta(meta, floor));
      }
    });
    return () => {
      // Flush rather than cancel: the last choice of a session must still reach disk.
      debouncer.flushAll();
      unsubscribe();
    };
  }, []);
}
