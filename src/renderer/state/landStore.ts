// Open land that has been witnessed (plan.md §4): each chunk's residents and buildings, the lore
// graph they added, notes, and the save's land progress. A chunk absent from `chunks` is unwritten
// (未記) — or fogged, which `marks` says.
//
// Two ways in (rev 6 phase 3, WP5):
// - `history`: the save plays in a world. Everything here is a view of its history's fold
//   (`applyWorld`, from renderer/history), and `progress` is composed from save.json's live fields,
//   the player's own progress (`personal`, progress.json) and the history (renderer/history/
//   progress.ts). Content is written to the history, never here: `addPlace` / `addEpisode` do
//   nothing in this mode, and the setters for errands, episodes and places change `personal`.
// - `legacy`: a save whose world could not be made yet (no device key); read from its legacy files
//   (`loaded`) exactly as before, and nothing new is witnessed.

import { clearFords } from "@shared/chunks";
import type { Folded, GiftNow, SignpostBody } from "@shared/history/types";
import {
  DOOR_SLOTS,
  type DoorSlot,
  type ErrandStage,
  type LandNote,
  type LandProgress,
  type WitnessedErrands,
} from "@shared/land";
import type { LoreNode } from "@shared/lore";
import type { LandPlace } from "@shared/places";
import type { AppError, Loadable } from "@shared/result";
import { idle } from "@shared/result";
import type { EpisodeProgress, StoryEpisode } from "@shared/story";
import type { Json } from "@shared/works";
import type { SceneGraph } from "@shared/world";
import type { WorldProgress } from "@shared/worldProgress";
import { create } from "zustand";
import type {
  ChunkMarks,
  LandFromHistory,
  LandWorld,
  NoteMark,
  RumorView,
} from "../history/landView";
import {
  composeProgress,
  type LandLive,
  liveOf,
  withEpisode,
  withErrand,
  withPlace,
} from "../history/progress";

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

/**
 * Something being written right now (rev 6 phase 3, D16), keyed by its claim target
 * (`chunk:cx,cz`, `chapter:eN`, …): the claimant's stream so far, the same text on every screen.
 */
export interface Developing {
  sid: string;
  /** The writer's author key. */
  by: string;
  text: string;
  /** True when this device holds the claim and runs the model. */
  mine: boolean;
}

export type LandMode = "legacy" | "history";

export interface LandState {
  instanceId: string | null;
  /** The stored land of `instanceId`; witnessing waits until this is ready. */
  load: Loadable<true>;
  mode: LandMode;
  /** Keyed by `chunkKey`. */
  chunks: Record<string, ChunkStatus>;
  lore: LoreNode[];
  /** The para-ledger: notes players left on this land, oldest first. */
  notes: LandNote[];
  /** Save-owned open-land progress; null until an instance with open land has hydrated. */
  progress: LandProgress | null;
  /** Keyed by claim target; written by `app/land/together.ts` (WP6), read by the land (WP5). */
  developing: Record<string, Developing>;

  // ── From the world's history (mode "history"; empty otherwise) ──────────────────────────────
  /** Per chunk key: its live witness, provisional / fogged / fading, variants and legends. */
  marks: Record<string, ChunkMarks>;
  /** Per note id: its writer's key, and whether it is provisional or a variant. */
  noteMarks: Record<string, NoteMark>;
  signposts: Folded<SignpostBody>[];
  gifts: GiftNow[];
  rumors: RumorView[];
  /** What `progress` is composed from, besides `personal` and `live`. */
  world: LandWorld | null;
  /** The player's own progress in the world (progress.json). */
  personal: WorldProgress | null;
  /** The land fields save.json keeps (home, door, felled, carry). */
  live: LandLive | null;
  /** Notes shown here that the history does not hold yet (a continent visitor's, D12). */
  extraNotes: LandNote[];

  beginLoad(instanceId: string): void;
  loaded(
    instanceId: string,
    chunks: Record<string, ChunkStatus>,
    lore: LoreNode[],
    notes: LandNote[],
  ): void;
  loadFailed(instanceId: string, error: AppError): void;
  /** The history's view of the land (every fold change); switches to mode "history". */
  applyWorld(instanceId: string, view: LandFromHistory): void;
  setPersonal(instanceId: string, personal: WorldProgress): void;
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
  /** Appends a chapter the land wrote (legacy mode only; the history holds them otherwise). */
  addEpisode(episode: StoryEpisode): void;
  /** Adds a place (legacy mode only; the history holds them otherwise). */
  addPlace(place: LandPlace): void;
  setPlaceCleared(id: string): void;
  /** An otherworld's pinned journey (`work-plays/`), first set when the player walks in. */
  setPlacePlay(id: string, playId: string): void;
  /** `null` clears it (the stream ended or was aborted). */
  setDeveloping(target: string, value: Developing | null): void;
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

type FromHistory = Pick<
  LandState,
  | "marks"
  | "noteMarks"
  | "signposts"
  | "gifts"
  | "rumors"
  | "world"
  | "personal"
  | "live"
  | "extraNotes"
>;

function fromHistory(): FromHistory {
  return {
    marks: {},
    noteMarks: {},
    signposts: [],
    gifts: [],
    rumors: [],
    world: null,
    personal: null,
    live: null,
    extraNotes: [],
  };
}

type Patch = Partial<LandState>;

/** `next` as the save's progress: kept as is (legacy), or re-composed around its live fields. */
function progressed(state: LandState, next: LandProgress): Patch {
  if (state.mode !== "history" || state.world === null || state.personal === null) {
    return { progress: next, live: liveOf(next) };
  }
  const live = liveOf(next);
  return { live, progress: composeProgress(live, state.personal, state.world) };
}

/** A new `personal` (history mode), with `progress` re-composed. */
function personally(state: LandState, personal: WorldProgress): Patch {
  if (state.world === null || state.live === null) return { personal };
  return { personal, progress: composeProgress(state.live, personal, state.world) };
}

const inHistory = (state: LandState): boolean =>
  state.mode === "history" && state.world !== null && state.personal !== null;

export const useLandStore = create<LandState>()((set) => ({
  instanceId: null,
  load: idle(),
  mode: "legacy",
  chunks: {},
  lore: [],
  notes: [],
  progress: null,
  developing: {},
  ...fromHistory(),

  beginLoad: (instanceId) =>
    set({
      instanceId,
      load: { status: "loading" },
      mode: "legacy",
      chunks: {},
      lore: [],
      notes: [],
      ...fromHistory(),
    }),
  loaded: (instanceId, chunks, lore, notes) =>
    set((state) =>
      state.instanceId === instanceId
        ? {
            load: { status: "ready", value: true },
            mode: "legacy",
            chunks: standingAll(chunks),
            lore,
            notes,
          }
        : state,
    ),
  loadFailed: (instanceId, error) =>
    set((state) =>
      state.instanceId === instanceId ? { load: { status: "error", error } } : state,
    ),
  applyWorld: (instanceId, view) =>
    set((state) => {
      if (state.instanceId !== instanceId) return state;
      // What this device is doing right now (writing, a failure waiting for Retry) stays until the
      // history has the chunk.
      const local = Object.fromEntries(
        Object.entries(state.chunks).filter(
          ([key, status]) => status.status !== "written" && view.chunks[key] === undefined,
        ),
      );
      const known = new Set(view.notes.map((note) => note.id));
      const extraNotes = state.extraNotes.filter((note) => !known.has(note.id));
      const live = state.live ?? liveOf(state.progress ?? emptyProgress());
      return {
        load: { status: "ready", value: true },
        mode: "history",
        chunks: { ...local, ...view.chunks },
        lore: view.lore,
        notes: [...view.notes, ...extraNotes],
        marks: view.marks,
        noteMarks: view.noteMarks,
        signposts: view.signposts,
        gifts: view.gifts,
        rumors: view.rumors,
        world: view.world,
        live,
        extraNotes,
        ...(state.personal === null
          ? {}
          : { progress: composeProgress(live, state.personal, view.world) }),
      };
    }),
  setPersonal: (instanceId, personal) =>
    set((state) => {
      if (state.instanceId !== instanceId) return state;
      const live = state.live ?? liveOf(state.progress ?? emptyProgress());
      return {
        personal,
        live,
        ...(state.world === null ? {} : { progress: composeProgress(live, personal, state.world) }),
      };
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
    set((state) => {
      if (state.notes.some((one) => one.id === note.id)) return state;
      return state.mode === "history"
        ? { notes: [...state.notes, note], extraNotes: [...state.extraNotes, note] }
        : { notes: [...state.notes, note] };
    }),
  setProgress: (progress) =>
    set((state) => (progress === null ? { progress: null } : progressed(state, progress))),
  setErrand: (key, stage) =>
    set((state) => {
      if (state.progress === null) return state;
      if (inHistory(state) && state.world !== null && state.personal !== null) {
        return personally(state, withErrand(state.personal, state.world, key, stage));
      }
      return {
        progress: { ...state.progress, errands: { ...state.progress.errands, [key]: stage } },
      };
    }),
  setDoorSlot: (index, slot) =>
    set((state) => {
      if (state.progress === null || index < 0 || index >= DOOR_SLOTS) return state;
      const door = [...state.progress.door];
      door[index] = slot;
      return progressed(state, { ...state.progress, door });
    }),
  placeKeepsake: (item) =>
    set((state) =>
      state.progress === null
        ? state
        : progressed(state, {
            ...state.progress,
            home: { ...state.progress.home, keepsakes: [...state.progress.home.keepsakes, item] },
          }),
    ),
  setEpisode: (id, patch) =>
    set((state) => {
      if (state.progress === null) return state;
      if (inHistory(state) && state.personal !== null) {
        return personally(state, withEpisode(state.personal, id, patch));
      }
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
      state.progress === null ? state : progressed(state, { ...state.progress, storyCarry: carry }),
    ),
  addEpisode: (episode) =>
    set((state) => {
      if (state.progress === null || state.mode === "history") return state;
      const more = state.progress.storyMore ?? [];
      if (more.some((one) => one.id === episode.id)) return state;
      return { progress: { ...state.progress, storyMore: [...more, episode] } };
    }),
  addPlace: (place) =>
    set((state) => {
      if (state.progress === null || state.mode === "history") return state;
      const places = state.progress.places ?? [];
      if (places.some((one) => one.id === place.id)) return state;
      return { progress: { ...state.progress, places: [...places, place] } };
    }),
  setPlaceCleared: (id) =>
    set((state) => {
      if (inHistory(state) && state.personal !== null) {
        return personally(state, withPlace(state.personal, id, { cleared: true }));
      }
      const places = state.progress?.places;
      if (state.progress === null || places === undefined) return state;
      const next = places.map((one) => (one.id === id ? { ...one, cleared: true } : one));
      return { progress: { ...state.progress, places: next } };
    }),
  setPlacePlay: (id, playId) =>
    set((state) => {
      if (inHistory(state) && state.personal !== null) {
        return personally(state, withPlace(state.personal, id, { playId }));
      }
      const places = state.progress?.places;
      if (state.progress === null || places === undefined) return state;
      const next = places.map((one) =>
        one.id === id && one.kind === "otherworld" && one.playId !== playId
          ? { ...one, playId }
          : one,
      );
      return next.some((one, index) => one !== places[index])
        ? { progress: { ...state.progress, places: next } }
        : state;
    }),
  setDeveloping: (target, value) =>
    set((state) => {
      if (value !== null) return { developing: { ...state.developing, [target]: value } };
      if (!(target in state.developing)) return state;
      const { [target]: _gone, ...rest } = state.developing;
      return { developing: rest };
    }),
  reset: () =>
    set({
      instanceId: null,
      load: idle(),
      mode: "legacy",
      chunks: {},
      lore: [],
      notes: [],
      progress: null,
      developing: {},
      ...fromHistory(),
    }),
}));
