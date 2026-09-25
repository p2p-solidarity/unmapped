// Low-frequency engine state. Positions and camera transforms live in refs inside the engine;
// only "what can the player interact with right now" and mode switches cross into React.

import type { ChunkCoord } from "@shared/chunks";
import type { CameraMode, NearbyTarget } from "@shared/events";
import { create } from "zustand";

export interface EngineState {
  nearby: NearbyTarget | null;
  cameraMode: CameraMode;
  /** True while a dialogue/console/overlay owns the keyboard. Engine ignores movement input. */
  inputLocked: boolean;
  /** Monotonic counter; the engine bumps it when the player presses the interact key. */
  interactSeq: number;
  lastInteract: NearbyTarget | null;
  /** Ids the player already opened this floor so the engine renders them as empty. */
  openedTreasures: string[];
  fps: number;
  /** Body the physics gun is carrying, or null. Changes only on grab and release. */
  heldBodyId: string | null;
  /** Chunk of open land the player stands on; null in a bounded scene. Changes on crossing only. */
  chunk: ChunkCoord | null;
  /** One-shot move request (the door); `seq` bumps so the same spot twice still travels. */
  teleport: { x: number; z: number; seq: number } | null;

  setNearby(target: NearbyTarget | null): void;
  setCameraMode(mode: CameraMode): void;
  setInputLocked(locked: boolean): void;
  interact(target: NearbyTarget): void;
  markTreasureOpened(id: string): void;
  setFps(fps: number): void;
  setHeldBody(id: string | null): void;
  setChunk(chunk: ChunkCoord | null): void;
  requestTeleport(x: number, z: number): void;
  resetFloor(): void;
}

export const useEngineStore = create<EngineState>()((set) => ({
  nearby: null,
  cameraMode: "orbit",
  inputLocked: false,
  interactSeq: 0,
  lastInteract: null,
  openedTreasures: [],
  fps: 0,
  heldBodyId: null,
  chunk: null,
  teleport: null,

  setNearby: (target) =>
    set((state) => (sameTarget(state.nearby, target) ? state : { nearby: target })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setInputLocked: (inputLocked) => set({ inputLocked }),
  interact: (target) =>
    set((state) => ({ interactSeq: state.interactSeq + 1, lastInteract: target })),
  markTreasureOpened: (id) => set((state) => ({ openedTreasures: [...state.openedTreasures, id] })),
  setFps: (fps) => set({ fps }),
  setHeldBody: (heldBodyId) => set({ heldBodyId }),
  setChunk: (chunk) => set({ chunk }),
  requestTeleport: (x, z) =>
    set((state) => ({ teleport: { x, z, seq: (state.teleport?.seq ?? 0) + 1 } })),
  resetFloor: () =>
    set({ nearby: null, lastInteract: null, openedTreasures: [], heldBodyId: null }),
}));

function sameTarget(a: NearbyTarget | null, b: NearbyTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}
