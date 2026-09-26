// The world an open save plays in (rev 6 phase 3, D1, D4, D11): its id, the fold of its history as
// this renderer holds it, the link state main reports, and what opening it did (the migration or
// catch-up notice). One world at a time — the one the land store shows. Written only by
// renderer/history/session.ts (one subscription per open world); every view reads it.
//
// `sequenced` folds the log's entries only; `now` is `sequenced` with this device's outbox folded
// on top (`withPending`), which is what the land draws. `seen` for a new draft is always
// `sequenced.head.n` at the moment its generation started.

import type { PendingEvent, WorldNow } from "@shared/history/types";
import type { AppError, Loadable } from "@shared/result";
import { idle } from "@shared/result";
import type { RefusedEvent, WorldEnsured, WorldStatus } from "@shared/worldApi";
import { create } from "zustand";

export interface OpenWorld {
  worldId: string;
  sequenced: WorldNow;
  now: WorldNow;
  pending: PendingEvent[];
  status: WorldStatus;
  refused: RefusedEvent[];
  /** What `world.ensure` did when this save was opened. */
  ensured: WorldEnsured;
}

export interface HistoryState {
  instanceId: string | null;
  /**
   * idle: no save with open land is open. loading: ensure + read are running. ready: the world.
   * error: the world could not be opened (the land says why; a keyless save plays from its
   * legacy files and `blocked` says why nothing new is written).
   */
  world: Loadable<OpenWorld>;
  /** Why this device writes nothing to the world right now (a key error, read-only), or null. */
  blocked: AppError | null;

  begin(instanceId: string): void;
  opened(instanceId: string, world: OpenWorld): void;
  failed(instanceId: string, error: AppError, blocked: AppError | null): void;
  /** A new fold (entries arrived, the outbox changed). */
  folded(worldId: string, fold: Pick<OpenWorld, "sequenced" | "now" | "pending">): void;
  setStatus(status: WorldStatus): void;
  setRefused(worldId: string, refused: RefusedEvent[]): void;
  reset(): void;
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  instanceId: null,
  world: idle(),
  blocked: null,

  begin: (instanceId) => set({ instanceId, world: { status: "loading" }, blocked: null }),
  opened: (instanceId, world) =>
    set((state) =>
      state.instanceId === instanceId
        ? { world: { status: "ready", value: world }, blocked: null }
        : state,
    ),
  failed: (instanceId, error, blocked) =>
    set((state) =>
      state.instanceId === instanceId ? { world: { status: "error", error }, blocked } : state,
    ),
  folded: (worldId, fold) =>
    set((state) =>
      state.world.status === "ready" && state.world.value.worldId === worldId
        ? { world: { status: "ready", value: { ...state.world.value, ...fold } } }
        : state,
    ),
  setStatus: (status) =>
    set((state) =>
      state.world.status === "ready" && state.world.value.worldId === status.world
        ? { world: { status: "ready", value: { ...state.world.value, status } } }
        : state,
    ),
  setRefused: (worldId, refused) =>
    set((state) =>
      state.world.status === "ready" && state.world.value.worldId === worldId
        ? { world: { status: "ready", value: { ...state.world.value, refused } } }
        : state,
    ),
  reset: () => set({ instanceId: null, world: idle(), blocked: null }),
}));

/** The open world, or null while none is ready. */
export function openWorld(): OpenWorld | null {
  const { world } = useHistoryStore.getState();
  return world.status === "ready" ? world.value : null;
}
