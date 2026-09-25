// Open land that has been witnessed (plan.md §4): each chunk's residents and buildings, and the
// lore graph they added. Loaded from the active save when an instance opens; written through
// `instances.witness` and then mirrored here. A chunk absent from `chunks` is unwritten (未記).

import { clearFords } from "@shared/chunks";
import {
  DOOR_SLOTS,
  type DoorSlot,
  type ErrandStage,
  type LandNote,
  type LandProgress,
  type WitnessedErrands,
} from "@shared/land";
import type { LoreNode } from "@shared/lore";
import type { AppError, Loadable } from "@shared/result";
import { idle } from "@shared/result";
import type { EpisodeProgress, StoryEpisode } from "@shared/story";
import type { Json } from "@shared/works";
import type { SceneGraph } from "@shared/world";
import { create } from "zustand";

export type ChunkStatus =
  | { status: "writing" }
  | {
      status: "written";
      scene: SceneGraph;
      dialogues: Record<string, string>;
      /** Errands written here, or null when nobody asked for anything. */
      errands: WitnessedErrands | null;
    }
  | { status: "failed"; error: AppError };

export interface LandState {
  instanceId: string | null;
  /** The stored land of `instanceId`; witnessing waits until this is ready. */
  load: Loadable<true>;
  /** Keyed by `chunkKey`. */
  chunks: Record<string, ChunkStatus>;
  lore: LoreNode[];
  /** The para-ledger: notes players left on this land, oldest first. */
  notes: LandNote[];
  /** Save-owned open-land progress; null until an instance with open land has hydrated. */
  progress: LandProgress | null;

  beginLoad(instanceId: string): void;
  loaded(
    instanceId: string,
    chunks: Record<string, ChunkStatus>,
    lore: LoreNode[],
    notes: LandNote[],
  ): void;
  loadFailed(instanceId: string, error: AppError): void;
  /** A visitor's view of the host's land, replaced whole from the room document. */
  mirror(
    instanceId: string,
    chunks: Record<string, ChunkStatus>,
    lore: LoreNode[],
    notes: LandNote[],
  ): void;
  setChunk(key: string, status: ChunkStatus): void;
  /** Clears a failure so the chunk can be witnessed again. */
  forget(key: string): void;
  addLore(nodes: LoreNode[]): void;
  /** Adds a note unless one with its id is already here. */
  addNote(note: LandNote): void;
  setProgress(progress: LandProgress | null): void;
  setErrand(key: string, stage: ErrandStage): void;
  setDoorSlot(index: number, slot: DoorSlot | null): void;
  /** Moves a carried keepsake onto the home shelf; the caller removes it from the inventory. */
  placeKeepsake(item: LandProgress["home"]["keepsakes"][number]): void;
  /** Updates one story episode's progress (created on first use). */
  setEpisode(id: string, patch: Partial<EpisodeProgress>): void;
  setStoryCarry(carry: Json | null): void;
  /** Appends a chapter the land wrote (save-owned); an id already present is left as it is. */
  addEpisode(episode: StoryEpisode): void;
  reset(): void;
}

/** How a written chunk stands on the land: the host keeps its fords clear (`clearFords`). */
function standing(key: string, status: ChunkStatus): ChunkStatus {
  if (status.status !== "written") return status;
  const [cx, cz] = key.split(",").map(Number);
  if (cx === undefined || cz === undefined || !Number.isFinite(cx) || !Number.isFinite(cz)) {
    return status;
  }
  const scene = clearFords(status.scene, { cx, cz });
  return scene === status.scene ? status : { ...status, scene };
}

function standingAll(chunks: Record<string, ChunkStatus>): Record<string, ChunkStatus> {
  return Object.fromEntries(
    Object.entries(chunks).map(([key, status]) => [key, standing(key, status)]),
  );
}

/** A save that has not done anything on open land yet: home is the origin, the door is blank. */
export function emptyProgress(): LandProgress {
  return {
    errands: {},
    home: { cx: 0, cz: 0, keepsakes: [] },
    door: Array.from({ length: DOOR_SLOTS }, () => null),
  };
}

export const useLandStore = create<LandState>()((set) => ({
  instanceId: null,
  load: idle(),
  chunks: {},
  lore: [],
  notes: [],
  progress: null,

  beginLoad: (instanceId) =>
    set({ instanceId, load: { status: "loading" }, chunks: {}, lore: [], notes: [] }),
  loaded: (instanceId, chunks, lore, notes) =>
    set((state) =>
      state.instanceId === instanceId
        ? { load: { status: "ready", value: true }, chunks: standingAll(chunks), lore, notes }
        : state,
    ),
  loadFailed: (instanceId, error) =>
    set((state) =>
      state.instanceId === instanceId ? { load: { status: "error", error } } : state,
    ),
  mirror: (instanceId, chunks, lore, notes) =>
    set({
      instanceId,
      load: { status: "ready", value: true },
      chunks: standingAll(chunks),
      lore,
      notes,
    }),
  setChunk: (key, status) =>
    set((state) => ({ chunks: { ...state.chunks, [key]: standing(key, status) } })),
  forget: (key) =>
    set((state) => {
      const { [key]: _gone, ...rest } = state.chunks;
      return { chunks: rest };
    }),
  addLore: (nodes) => set((state) => ({ lore: [...state.lore, ...nodes] })),
  addNote: (note) =>
    set((state) =>
      state.notes.some((one) => one.id === note.id) ? state : { notes: [...state.notes, note] },
    ),
  setProgress: (progress) => set({ progress }),
  setErrand: (key, stage) =>
    set((state) =>
      state.progress === null
        ? state
        : { progress: { ...state.progress, errands: { ...state.progress.errands, [key]: stage } } },
    ),
  setDoorSlot: (index, slot) =>
    set((state) => {
      if (state.progress === null || index < 0 || index >= DOOR_SLOTS) return state;
      const door = [...state.progress.door];
      door[index] = slot;
      return { progress: { ...state.progress, door } };
    }),
  placeKeepsake: (item) =>
    set((state) =>
      state.progress === null
        ? state
        : {
            progress: {
              ...state.progress,
              home: { ...state.progress.home, keepsakes: [...state.progress.home.keepsakes, item] },
            },
          },
    ),
  setEpisode: (id, patch) =>
    set((state) => {
      if (state.progress === null) return state;
      const before = state.progress.episodes?.[id] ?? {
        draftId: null,
        work: null,
        playId: null,
        cleared: false,
        summary: null,
      };
      const episodes = { ...state.progress.episodes, [id]: { ...before, ...patch } };
      return { progress: { ...state.progress, episodes } };
    }),
  setStoryCarry: (carry) =>
    set((state) =>
      state.progress === null ? state : { progress: { ...state.progress, storyCarry: carry } },
    ),
  addEpisode: (episode) =>
    set((state) => {
      if (state.progress === null) return state;
      const more = state.progress.storyMore ?? [];
      if (more.some((one) => one.id === episode.id)) return state;
      return { progress: { ...state.progress, storyMore: [...more, episode] } };
    }),
  reset: () =>
    set({ instanceId: null, load: idle(), chunks: {}, lore: [], notes: [], progress: null }),
}));
