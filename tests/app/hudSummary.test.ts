import {
  hudSummary,
  type InferenceSlice,
  inferenceSummary,
  type SessionSlice,
  type WorldSlice,
} from "@renderer/app/hud/summary";
import type { InferenceConfig, ProbeResult } from "@shared/llm";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import type { Inventory, ItemSpec, KarmaEntry, SceneGraph, WorldMeta } from "@shared/world";
import { describe, expect, it } from "vitest";

const meta: WorldMeta = {
  id: "w1",
  name: "Hollow Spire",
  archetype: "delve",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  floor: 3,
  mutation: null,
  flags: {},
  mods: [],
};

function scene(): SceneGraph {
  return {
    name: "Sunken Stair",
    biome: "abyss",
    contract: null,
    floor: { width: 8, depth: 8, tile: "stone" },
    patches: [],
    platforms: [],
    walls: [],
    props: [],
    npcs: [],
    monsters: [],
    treasures: [],
    exits: [],
    lights: [],
    sky: null,
    triggers: [],
    quests: [],
  };
}

function karma(choice: string): KarmaEntry {
  return {
    at: "2026-01-01T00:00:00.000Z",
    floor: 3,
    npcId: "aoi",
    choice,
    action: "talk",
    effect: "she nods",
  };
}

function item(id: string): ItemSpec {
  return {
    id,
    name: id,
    kind: "charm",
    power: 10,
    perk: "warm",
    curse: null,
    meshDna: [],
    archetype: [],
    flavor: "",
  };
}

const inventory: Inventory = { items: [item("a"), item("b")], materials: ["ore", "silk", "ash"] };

function world(overrides: Partial<WorldSlice> = {}): WorldSlice {
  return {
    meta,
    floor: 3,
    karma: [],
    inventory: { items: [], materials: [] },
    scene: idle(),
    ...overrides,
  };
}

const solo: SessionSlice = { roomCode: null, peerCount: 0 };

const config: InferenceConfig = {
  kind: "llamacpp",
  baseUrl: "http://127.0.0.1:8080/v1",
  model: "qwen3.5-4b",
  apiKeyEnv: null,
  sidecar: null,
};

function probe(value: Partial<ProbeResult> = {}): Loadable<ProbeResult> {
  return ready({ reachable: true, models: [], latencyMs: 42.4, serverName: null, ...value });
}

function inference(overrides: Partial<InferenceSlice> = {}): InferenceSlice {
  return { config, probe: idle(), inflight: 0, ...overrides };
}

describe("hudSummary", () => {
  it("reads the world counters straight off the store", () => {
    const summary = hudSummary(
      world({ karma: [karma("Ask about the well"), karma("Take the lantern")], inventory }),
      solo,
      inference(),
    );
    expect(summary).toMatchObject({
      worldName: "Hollow Spire",
      floor: 3,
      karmaCount: 2,
      lastChoice: "Take the lantern",
      items: 2,
      materials: 3,
    });
  });

  it("has no biome until the scene parses", () => {
    expect(hudSummary(world(), solo, inference()).biome).toBeNull();
    expect(hudSummary(world({ scene: loading() }), solo, inference()).biome).toBeNull();
    expect(hudSummary(world({ scene: ready(scene()) }), solo, inference()).biome).toBe("abyss");
  });

  it("reports no world name and no last choice rather than inventing them", () => {
    const summary = hudSummary(world({ meta: null, karma: [karma("   ")] }), solo, inference());
    expect(summary.worldName).toBeNull();
    expect(summary.lastChoice).toBeNull();
    expect(summary.karmaCount).toBe(1);
  });

  it("hides the peer count until a room is open", () => {
    expect(hudSummary(world(), solo, inference()).peers).toBeNull();
    expect(hudSummary(world(), { roomCode: "AB12CD", peerCount: 0 }, inference()).peers).toBe(0);
    expect(hudSummary(world(), { roomCode: "AB12CD", peerCount: 2 }, inference()).peers).toBe(2);
  });
});

describe("inferenceSummary", () => {
  it("says so when no provider is configured", () => {
    expect(inferenceSummary({ config: null, probe: idle(), inflight: 0 })).toEqual({
      provider: null,
      model: null,
      state: "unconfigured",
      detail: null,
      thinking: 0,
    });
  });

  it("names the provider and model from the config", () => {
    expect(inferenceSummary(inference())).toMatchObject({
      provider: "llamacpp",
      model: "qwen3.5-4b",
      state: "unprobed",
    });
  });

  it("follows the probe through loading, success and failure", () => {
    expect(inferenceSummary(inference({ probe: loading() })).state).toBe("probing");
    expect(inferenceSummary(inference({ probe: probe() }))).toMatchObject({
      state: "online",
      detail: "42 ms",
    });
    expect(
      inferenceSummary(inference({ probe: probe({ serverName: "llama.cpp" }) })),
    ).toMatchObject({ state: "online", detail: "llama.cpp" });
    expect(inferenceSummary(inference({ probe: probe({ reachable: false }) })).state).toBe(
      "offline",
    );
    expect(
      inferenceSummary(
        inference({ probe: errored({ code: "unreachable", message: "connect ECONNREFUSED" }) }),
      ),
    ).toMatchObject({ state: "error", detail: "connect ECONNREFUSED" });
  });

  it("counts in-flight requests for the thinking indicator", () => {
    expect(inferenceSummary(inference({ inflight: 2 })).thinking).toBe(2);
    expect(inferenceSummary(inference({ inflight: 0 })).thinking).toBe(0);
  });

  it("treats an empty model name as no model", () => {
    expect(inferenceSummary(inference({ config: { ...config, model: "" } })).model).toBeNull();
  });
});
