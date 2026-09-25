// The continent this world is merged into (plan.md §8), as the room document last said. Everything
// here is other players' land, already shifted into this world's own coordinates, so the land view,
// the HUD, notes and the door read it the same way they read `landStore`. This world's own land
// never goes in here. Positions of other players are per-frame data and live in
// engine/remoteRoster.ts instead (Rule 4).

import type { ChunkCoord } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import type { DoorSlot, LandNote } from "@shared/land";
import type { AppError } from "@shared/result";
import { create } from "zustand";
import type { ChunkStatus } from "./landStore";

/** Another world on the continent, in this world's coordinates. */
export interface ForeignWorld {
  worldId: string;
  owner: string;
  title: string;
  /** Its offset on the continent, in chunks (what its marker says). */
  anchor: ChunkCoord;
  /** Add to one of its own chunk coordinates to get this world's coordinate of that chunk. */
  shift: ChunkCoord;
  /** Whether its owner is in the room right now (else it is what they left behind). */
  online: boolean;
  /** Its (0, 0) tile, in this world's tiles: where its offset marker stands. */
  originTile: { x: number; z: number };
  /** Its home door, in this world's tiles. */
  door: { x: number; z: number };
  /** Its door dials, still in its own coordinates (the door card shifts them). */
  slots: (DoorSlot | null)[];
  keepsakes: string[];
}

export type ContinentStatus =
  | { kind: "off" }
  | { kind: "connecting"; code: string }
  | { kind: "live"; code: string; peers: number }
  | { kind: "error"; code: string; error: AppError };

export interface ContinentState {
  status: ContinentStatus;
  /** This world's own offset on the continent; null when not merged. */
  anchor: ChunkCoord | null;
  worlds: ForeignWorld[];
  /** Chunks in other worlds' territory, keyed by this world's `chunkKey`. */
  chunks: Record<string, ChunkStatus>;
  /** Notes left in other worlds' territory, in this world's coordinates. */
  notes: LandNote[];
  /** Whose land each chunk is; null when not merged. */
  territory: TerritoryMap | null;
  /** The foreign door whose card is open (a world id), or null. */
  doorCard: string | null;

  setStatus(status: ContinentStatus): void;
  setView(view: {
    anchor: ChunkCoord;
    worlds: ForeignWorld[];
    chunks: Record<string, ChunkStatus>;
    notes: LandNote[];
    territory: TerritoryMap;
  }): void;
  openDoorCard(worldId: string | null): void;
  reset(): void;
}

const EMPTY = {
  status: { kind: "off" } as ContinentStatus,
  anchor: null,
  worlds: [],
  chunks: {},
  notes: [],
  territory: null,
  doorCard: null,
};

export const useContinentStore = create<ContinentState>()((set) => ({
  ...EMPTY,
  setStatus: (status) => set({ status }),
  setView: (view) => set(view),
  openDoorCard: (doorCard) => set({ doorCard }),
  reset: () => set(EMPTY),
}));

/** The foreign world whose territory chunk `coord` is, or null on this world's own land. */
export function foreignAt(coord: ChunkCoord): ForeignWorld | null {
  const { territory, worlds } = useContinentStore.getState();
  const owner = territory?.at(coord)?.worldId;
  return owner === undefined ? null : (worlds.find((world) => world.worldId === owner) ?? null);
}
