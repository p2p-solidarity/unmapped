// The loaded world: meta, dotfiles, parsed scene. Owned by the app layer; the engine reads
// `scene`, the narrative layer reads genesis/karma/inventory and writes through the actions.

import type { GameplayRules } from "@shared/gameplay";
import { idle, type Loadable } from "@shared/result";
import {
  EMPTY_INVENTORY,
  type Genesis,
  type Inventory,
  type ItemSpec,
  type KarmaEntry,
  type SceneGraph,
  type WorldMeta,
  type WorldMutation,
} from "@shared/world";
import { create } from "zustand";

export interface WorldState {
  origin: { kind: "legacy"; worldId: string } | { kind: "instance"; instanceId: string } | null;
  meta: WorldMeta | null;
  genesis: Genesis | null;
  /** Raw `world.oui` source currently on disk / in the editor. */
  sceneSource: string;
  scene: Loadable<SceneGraph>;
  karma: KarmaEntry[];
  inventory: Inventory;
  floor: number;
  gameplayRules: GameplayRules | null;
  /** Bumps whenever the palette/sky changes so the engine can run its dissolve transition. */
  mutationSeq: number;
  /**
   * True from `loadWorld` until `finishHydration`: the store is being filled *from* the dotfiles,
   * so nothing may be written back to them (usePersistWorld skips while this is set).
   */
  hydrating: boolean;

  loadWorld(input: {
    meta: WorldMeta;
    genesis: Genesis;
    sceneSource: string;
    scene: Loadable<SceneGraph>;
    karma: KarmaEntry[];
    inventory: Inventory;
  }): void;
  loadInstance(input: {
    instanceId: string;
    meta: WorldMeta;
    genesis: Genesis;
    sceneSource: string;
    scene: Loadable<SceneGraph>;
    karma: KarmaEntry[];
    inventory: Inventory;
    gameplayRules: GameplayRules;
  }): void;
  /** Clears `hydrating`; call it once the loader has finished filling the store from disk. */
  finishHydration(): void;
  setScene(sceneSource: string, scene: Loadable<SceneGraph>): void;
  setMutationOverlay(mutation: WorldMutation | null): void;
  applyMutation(mutation: WorldMutation): void;
  appendKarma(entry: KarmaEntry): void;
  /** Replaces the whole ledger — used when karma.jsonl changed on disk. */
  setKarma(karma: KarmaEntry[]): void;
  addItem(item: ItemSpec): void;
  addMaterials(materials: string[]): void;
  consumeMaterials(materials: string[]): void;
  /** Replaces the whole inventory — used when inventory.json changed on disk. */
  setInventory(inventory: Inventory): void;
  /** Replaces the metadata — used when meta.json changed on disk. */
  setMeta(meta: WorldMeta): void;
  setFloor(floor: number): void;
  unload(): void;
}

export const useWorldStore = create<WorldState>()((set) => ({
  origin: null,
  meta: null,
  genesis: null,
  sceneSource: "",
  scene: idle(),
  karma: [],
  inventory: EMPTY_INVENTORY,
  floor: 1,
  gameplayRules: null,
  mutationSeq: 0,
  hydrating: false,

  loadWorld: ({ meta, genesis, sceneSource, scene, karma, inventory }) =>
    set({
      origin: { kind: "legacy", worldId: meta.id },
      meta: { ...meta, mutation: meta.mutation ?? null },
      genesis,
      sceneSource,
      scene: applyOverlay(scene, meta.mutation ?? null),
      karma,
      inventory,
      floor: meta.floor,
      gameplayRules: null,
      hydrating: true,
    }),

  loadInstance: ({
    instanceId,
    meta,
    genesis,
    sceneSource,
    scene,
    karma,
    inventory,
    gameplayRules,
  }) =>
    set({
      origin: { kind: "instance", instanceId },
      meta,
      genesis,
      sceneSource,
      scene: applyOverlay(scene, meta.mutation),
      karma,
      inventory,
      floor: meta.floor,
      gameplayRules,
      hydrating: false,
    }),

  finishHydration: () => set({ hydrating: false }),

  setScene: (sceneSource, scene) =>
    set((state) => ({ sceneSource, scene: applyOverlay(scene, state.meta?.mutation ?? null) })),

  setMutationOverlay: (mutation) =>
    set((state) => {
      if (state.meta === null) return state;
      return {
        meta: { ...state.meta, mutation },
        scene: applyOverlay(state.scene, mutation),
        mutationSeq: state.mutationSeq + 1,
      };
    }),

  applyMutation: (mutation) =>
    set((state) => {
      if (state.meta === null || state.scene.status !== "ready") return state;
      const previous = state.meta.mutation;
      const nextMutation: WorldMutation = {
        skyColor: mutation.skyColor ?? previous?.skyColor ?? null,
        fogDensity: mutation.fogDensity ?? previous?.fogDensity ?? null,
        biome: mutation.biome ?? previous?.biome ?? null,
      };
      return {
        meta: { ...state.meta, mutation: nextMutation },
        scene: applyOverlay(state.scene, nextMutation),
        mutationSeq: state.mutationSeq + 1,
      };
    }),

  appendKarma: (entry) => set((state) => ({ karma: [...state.karma, entry] })),

  setKarma: (karma) => set({ karma }),

  setInventory: (inventory) => set({ inventory }),

  setMeta: (meta) => set({ meta }),

  addItem: (item) =>
    set((state) => ({
      inventory: { ...state.inventory, items: [...state.inventory.items, item] },
    })),

  addMaterials: (materials) =>
    set((state) => ({
      inventory: { ...state.inventory, materials: [...state.inventory.materials, ...materials] },
    })),

  consumeMaterials: (materials) =>
    set((state) => {
      const remaining = [...state.inventory.materials];
      for (const m of materials) {
        const i = remaining.indexOf(m);
        if (i >= 0) remaining.splice(i, 1);
      }
      return { inventory: { ...state.inventory, materials: remaining } };
    }),

  setFloor: (floor) => set({ floor }),

  unload: () =>
    set({
      origin: null,
      meta: null,
      genesis: null,
      sceneSource: "",
      scene: idle(),
      karma: [],
      inventory: EMPTY_INVENTORY,
      floor: 1,
      gameplayRules: null,
      mutationSeq: 0,
      hydrating: false,
    }),
}));

/** Applies the one persisted atmosphere overlay without changing the source DSL. */
export function applyWorldMutation(graph: SceneGraph, mutation: WorldMutation | null): SceneGraph {
  if (mutation === null) return graph;
  if (graph.sky === null) return { ...graph, biome: mutation.biome ?? graph.biome };
  const sky = graph.sky;
  return {
    ...graph,
    biome: mutation.biome ?? graph.biome,
    sky: {
      color: mutation.skyColor ?? sky.color,
      fog: mutation.skyColor ?? sky.fog,
      fogDensity: mutation.fogDensity ?? sky.fogDensity,
    },
  };
}

function applyOverlay(
  scene: Loadable<SceneGraph>,
  mutation: WorldMutation | null,
): Loadable<SceneGraph> {
  return scene.status === "ready"
    ? { status: "ready", value: applyWorldMutation(scene.value, mutation) }
    : scene;
}
