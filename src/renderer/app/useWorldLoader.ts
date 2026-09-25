// Loading a world = reading the five dotfiles, parsing each one, and handing the result to the
// world store. Nothing is invented on the way: a broken file becomes an AppError, a broken
// world.oui becomes an `error` scene the console can show (Rule 2 / Rule 5).

import { parseScene } from "@dsl/index";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { errored, type Loadable, ok, type Result, ready } from "@shared/result";
import {
  type Inventory,
  type KarmaEntry,
  type SceneGraph,
  WORLD_FILES,
  type WorldFile,
  type WorldMeta,
} from "@shared/world";
import { useEffect } from "react";
import { createDebouncer } from "./debounce";
import { parseKarmaJsonl, serializeKarmaJsonl } from "./karmaFile";
import {
  isMissingFile,
  parseGenesis,
  parseInventory,
  parseMeta,
  serializeInventory,
} from "./worldFiles";

/** Disk events are coalesced: an editor save can fire add+change within a few ms. */
const WATCH_DEBOUNCE_MS = 150;

function read(worldId: string, file: WorldFile): Promise<Result<string>> {
  return window.seed.worlds.read(worldId, file);
}

function toast(tone: "info" | "success" | "danger", text: string): void {
  useSessionStore.getState().toast(tone, text);
}

async function readKarma(worldId: string): Promise<Result<{ entries: KarmaEntry[] }>> {
  const result = await read(worldId, WORLD_FILES.karma);
  if (!result.ok) {
    if (isMissingFile(result.error)) return ok({ entries: [] });
    return result;
  }
  const { entries, skipped } = parseKarmaJsonl(result.value);
  if (skipped > 0) {
    console.warn(`karma.jsonl: skipped ${skipped} unreadable line(s)`);
    toast("info", `karma.jsonl: skipped ${skipped} unreadable line(s)`);
  }
  return ok({ entries });
}

async function readInventory(worldId: string): Promise<Result<Inventory>> {
  const result = await read(worldId, WORLD_FILES.inventory);
  if (!result.ok) {
    if (isMissingFile(result.error)) return ok({ items: [], materials: [] });
    return result;
  }
  return parseInventory(result.value);
}

/**
 * Reads every dotfile of `worldId` and replaces the world store with it.
 * A world.oui that does not parse still loads — with `scene` in the error state.
 */
export async function loadWorld(worldId: string): Promise<Result<WorldMeta>> {
  const [metaRaw, genesisRaw, sceneRaw] = await Promise.all([
    read(worldId, WORLD_FILES.meta),
    read(worldId, WORLD_FILES.genesis),
    read(worldId, WORLD_FILES.scene),
  ]);
  if (!metaRaw.ok) return metaRaw;
  if (!genesisRaw.ok) return genesisRaw;
  if (!sceneRaw.ok) return sceneRaw;

  const meta = parseMeta(metaRaw.value);
  if (!meta.ok) return meta;
  const genesis = parseGenesis(genesisRaw.value);
  if (!genesis.ok) return genesis;

  const [karma, inventory] = await Promise.all([readKarma(worldId), readInventory(worldId)]);
  if (!karma.ok) return karma;
  if (!inventory.ok) return inventory;

  const sceneSource = sceneRaw.value;
  const scene = sceneFrom(sceneSource);
  const store = useWorldStore.getState();
  useLandStore.getState().reset();
  store.loadWorld({
    meta: meta.value,
    genesis: genesis.value,
    sceneSource,
    scene,
    karma: karma.value.entries,
    inventory: inventory.value,
  });
  // The store is now a copy of the dotfiles; from here on, changes are edits worth saving.
  store.finishHydration();
  if (scene.status === "error") {
    toast("danger", "world.oui did not parse — open the console (F12) to see the errors");
  }
  return ok(meta.value);
}

function sceneFrom(source: string): Loadable<SceneGraph> {
  const parsed = parseScene(source);
  return parsed.ok ? ready(parsed.value) : errored(parsed.error);
}

/** Load + route. Used by the worlds list and by Genesis when a new world is created. */
export async function openWorld(worldId: string): Promise<void> {
  const result = await loadWorld(worldId);
  if (!result.ok) {
    toast("danger", `${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ""}`);
    useSessionStore.getState().setScreen("worlds");
    return;
  }
  useSessionStore.getState().setScreen("play");
}

async function reloadScene(worldId: string): Promise<void> {
  const result = await read(worldId, WORLD_FILES.scene);
  if (!result.ok) {
    toast("danger", `world.oui could not be re-read: ${result.error.message}`);
    return;
  }
  const store = useWorldStore.getState();
  // Our own writes come back through the watcher — ignore them instead of toasting in a loop.
  if (result.value === store.sceneSource) return;
  const scene = sceneFrom(result.value);
  store.setScene(result.value, scene);
  toast(scene.status === "error" ? "danger" : "success", "world.oui reloaded");
}

async function reloadKarma(worldId: string): Promise<void> {
  const karma = await readKarma(worldId);
  if (!karma.ok) {
    toast("danger", `karma.jsonl could not be re-read: ${karma.error.message}`);
    return;
  }
  const store = useWorldStore.getState();
  if (serializeKarmaJsonl(karma.value.entries) === serializeKarmaJsonl(store.karma)) return;
  store.setKarma(karma.value.entries);
  toast("info", "karma.jsonl reloaded");
}

async function reloadInventory(worldId: string): Promise<void> {
  const inventory = await readInventory(worldId);
  if (!inventory.ok) {
    toast("danger", `inventory.json could not be re-read: ${inventory.error.message}`);
    return;
  }
  const store = useWorldStore.getState();
  if (serializeInventory(inventory.value) === serializeInventory(store.inventory)) return;
  store.setInventory(inventory.value);
  toast("info", "inventory.json reloaded");
}

async function reloadMeta(worldId: string): Promise<void> {
  const raw = await read(worldId, WORLD_FILES.meta);
  if (!raw.ok) return;
  const meta = parseMeta(raw.value);
  if (!meta.ok) {
    toast("danger", meta.error.message);
    return;
  }
  const store = useWorldStore.getState();
  const mutationChanged = meta.value.mutation !== store.meta?.mutation;
  store.setMeta(meta.value);
  if (mutationChanged) {
    store.setScene(store.sceneSource, sceneFrom(store.sceneSource));
    useWorldStore.getState().setMutationOverlay(meta.value.mutation);
  }
  if (meta.value.floor !== store.floor) store.setFloor(meta.value.floor);
}

function handleChange(worldId: string, file: WorldFile): void {
  switch (file) {
    case WORLD_FILES.scene:
      void reloadScene(worldId);
      return;
    case WORLD_FILES.karma:
      void reloadKarma(worldId);
      return;
    case WORLD_FILES.inventory:
      void reloadInventory(worldId);
      return;
    case WORLD_FILES.meta:
      void reloadMeta(worldId);
      return;
    case WORLD_FILES.genesis:
      // The covenant is creation-time immutable for the active session; reload to apply an edit.
      return;
  }
}

/**
 * Hot reload: while a world is being played, hand-editing mutable dotfiles updates the game.
 * genesis.json is the creation-time covenant and intentionally takes effect on the next load.
 * Unsubscribes when the world unloads or the player leaves the play screen.
 */
export function useWorldSync(): void {
  const worldId = useWorldStore((state) =>
    state.origin?.kind === "legacy" ? state.origin.worldId : null,
  );
  const screen = useSessionStore((state) => state.screen);

  useEffect(() => {
    if (worldId === null || screen !== "play") return;
    const debouncer = createDebouncer();
    const unsubscribe = window.seed.worlds.onChanged((event) => {
      if (event.worldId !== worldId) return;
      debouncer.schedule(event.file, WATCH_DEBOUNCE_MS, () => handleChange(worldId, event.file));
    });
    return () => {
      debouncer.cancelAll();
      unsubscribe();
    };
  }, [worldId, screen]);
}
