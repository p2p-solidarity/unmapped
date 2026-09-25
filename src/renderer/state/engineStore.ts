// Low-frequency engine state. Positions and camera transforms live in refs inside the engine;
// only "what can the player interact with right now" and mode switches cross into React.

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

  setNearby(target: NearbyTarget | null): void;
  setCameraMode(mode: CameraMode): void;
  setInputLocked(locked: boolean): void;
  interact(target: NearbyTarget): void;
  markTreasureOpened(id: string): void;
  setFps(fps: number): void;
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

  setNearby: (target) =>
    set((state) => (sameTarget(state.nearby, target) ? state : { nearby: target })),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setInputLocked: (inputLocked) => set({ inputLocked }),
  interact: (target) =>
    set((state) => ({ interactSeq: state.interactSeq + 1, lastInteract: target })),
  markTreasureOpened: (id) => set((state) => ({ openedTreasures: [...state.openedTreasures, id] })),
  setFps: (fps) => set({ fps }),
  resetFloor: () => set({ nearby: null, lastInteract: null, openedTreasures: [] }),
}));

function sameTarget(a: NearbyTarget | null, b: NearbyTarget | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}
