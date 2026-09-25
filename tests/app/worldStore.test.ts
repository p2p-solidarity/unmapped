import { applyWorldMutation, useWorldStore } from "@renderer/state/worldStore";
import { idle } from "@shared/result";
import type { Genesis, KarmaEntry, WorldMeta } from "@shared/world";
import { beforeEach, describe, expect, it } from "vitest";
import { makeScene } from "../engine/fixtures";

describe("applyWorldMutation", () => {
  it("replays the durable overlay onto a parsed scene", () => {
    const scene = makeScene({
      biome: "meadow",
      sky: { color: "#111111", fog: "#111111", fogDensity: 0.02 },
    });

    expect(
      applyWorldMutation(scene, { skyColor: "#d9b06a", fogDensity: 0.08, biome: "abyss" }),
    ).toMatchObject({
      biome: "abyss",
      sky: { color: "#d9b06a", fog: "#d9b06a", fogDensity: 0.08 },
    });
  });

  it("leaves a scene unchanged when there is no overlay", () => {
    const scene = makeScene();
    expect(applyWorldMutation(scene, null)).toBe(scene);
  });

  it("does not invent a sky colour when the source scene has no Sky", () => {
    const scene = makeScene();
    expect(applyWorldMutation(scene, { skyColor: null, fogDensity: 0.08, biome: "abyss" })).toEqual(
      {
        ...scene,
        biome: "abyss",
        sky: null,
      },
    );
  });
});

const meta: WorldMeta = {
  id: "w1",
  name: "Hollow Spire",
  archetype: "delve",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  floor: 4,
  mutation: null,
  flags: {},
  mods: [],
};

const genesis: Genesis = {
  archetype: "delve",
  physics: "gentle",
  language: "en",
  seed: 7,
  intent: "find the well",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function load(): void {
  useWorldStore.getState().loadWorld({
    meta,
    genesis,
    sceneSource: "Scene()",
    scene: idle(),
    karma: [],
    inventory: { items: [], materials: [] },
  });
}

describe("worldStore hydration", () => {
  beforeEach(() => {
    useWorldStore.getState().unload();
  });

  it("is not hydrating until a world is loaded", () => {
    expect(useWorldStore.getState().hydrating).toBe(false);
  });

  it("marks the store as hydrating for the whole of loadWorld", () => {
    load();
    expect(useWorldStore.getState().hydrating).toBe(true);
    expect(useWorldStore.getState().floor).toBe(4);
    useWorldStore.getState().finishHydration();
    expect(useWorldStore.getState().hydrating).toBe(false);
  });

  it("clears the flag again when the world is unloaded", () => {
    load();
    useWorldStore.getState().unload();
    expect(useWorldStore.getState().hydrating).toBe(false);
    expect(useWorldStore.getState().meta).toBeNull();
  });

  it("replaces karma, inventory and meta wholesale for a disk reload", () => {
    load();
    useWorldStore.getState().finishHydration();
    const entry: KarmaEntry = {
      at: "2026-01-01T00:00:00.000Z",
      floor: 4,
      npcId: null,
      choice: "hand-edited",
      action: "wish",
      effect: "",
    };
    useWorldStore.getState().setKarma([entry]);
    useWorldStore.getState().setInventory({ items: [], materials: ["ore"] });
    useWorldStore.getState().setMeta({ ...meta, name: "Renamed" });
    expect(useWorldStore.getState().karma).toEqual([entry]);
    expect(useWorldStore.getState().inventory.materials).toEqual(["ore"]);
    expect(useWorldStore.getState().meta?.name).toBe("Renamed");
  });
});
