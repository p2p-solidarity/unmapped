// Rev 6 §3.1: before it, Play never mounted the world harness, so every witnessing, chapter and
// place turn ran on a throwaway harness and the model never saw the world snapshot or the hot lore
// around the player — silently, since the turns still produced something. What this guards (the
// prompt itself is invisible from E2E; only the output is):
//   1. A witnessing turn, with a world mounted, does not carry the hot lore around its chunk.
//   2. A chapter or a place turn does not carry the world snapshot and the lore around the player.
//   3. Without a mounted world the same turns claim a world they do not have.
//   4. Two turns at once on the one shared harness (a chapter written in the background while the
//      player witnesses a chunk) collide on a section name, or read each other's sections — found
//      in the rev 6 E2E run, where the second turn threw and the chunk stayed "witnessing" forever.

import { disposeWorldHarness, mountWorldHarness } from "@renderer/harness/worldHarness";
import { generateChapter } from "@renderer/narrative/chapter";
import { generatePlace } from "@renderer/narrative/place";
import { generateChunk } from "@renderer/narrative/witness";
import { useEngineStore } from "@renderer/state/engineStore";
import { useLandStore } from "@renderer/state/landStore";
import { useWorldStore } from "@renderer/state/worldStore";
import { chunkTerrain } from "@shared/chunks";
import type { ChatRequest } from "@shared/llm";
import type { LoreNode } from "@shared/lore";
import { err, ready } from "@shared/result";
import type { SceneGraph, WorldMeta } from "@shared/world";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const asked: Omit<ChatRequest, "id">[] = [];
vi.mock("@renderer/llm/client", () => ({
  chat: async (request: Omit<ChatRequest, "id">) => {
    asked.push(request);
    // Stop right after the prompt is seen: only what was asked matters here.
    return err("test-stop", "stopped after the first request");
  },
}));

const bible = {
  core: "Premise: A coast where the survey ships stopped coming.",
  style: "Naming: Two-word names.\nVoice: Short sentences.\nLook: Whitewashed stone houses.",
};

const meta: WorldMeta = {
  id: "world-harness-test",
  name: "Harness test",
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedAt: "2026-09-25T00:00:00.000Z",
  floor: 1,
  mutation: null,
  flags: {},
  mods: [],
};

const origin: SceneGraph = {
  name: "Low Well",
  biome: "meadow",
  contract: null,
  floor: { width: 16, depth: 16, tile: "grass" },
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
} as unknown as SceneGraph;

const lore: LoreNode[] = [
  {
    id: "salt_pylon@1,0",
    kind: "place",
    label: "Salt Pylon",
    text: "A pylon the gulls sit on.",
    coord: { cx: 1, cz: 0 },
    links: [],
    tone: 0.2,
  },
  {
    id: "gull_rule@1,0",
    kind: "custom",
    label: "Feed the first gull",
    text: "Whoever passes first in the morning feeds a gull.",
    coord: { cx: 1, cz: 0 },
    links: ["salt_pylon@1,0"],
    tone: 0.4,
  },
];

function systemOf(request: Omit<ChatRequest, "id"> | undefined): string {
  const first = request?.messages[0];
  return first?.role === "system" ? first.content : "";
}

beforeEach(() => {
  asked.length = 0;
  vi.stubGlobal("window", {
    seed: { mods: { onChanged: () => () => undefined, read: async () => err("none", "none") } },
  });
  useWorldStore.setState({
    origin: { kind: "instance", instanceId: meta.id },
    meta,
    genesis: { language: "en", intent: "A quiet coast." },
    scene: ready(origin),
    karma: [],
    inventory: { items: [], materials: [] },
    floor: 1,
  });
  useLandStore.setState({ lore });
  useEngineStore.setState({ chunk: { cx: 1, cz: 0 } });
});

afterEach(async () => {
  await disposeWorldHarness();
  vi.unstubAllGlobals();
  useWorldStore.getState().unload();
  useLandStore.setState({ lore: [] });
  useEngineStore.setState({ chunk: null });
});

const coord = { cx: 1, cz: 0 };
const witness = () =>
  generateChunk({
    bible,
    coord,
    biome: "meadow",
    ground: "grass",
    hole: null,
    lore,
    language: "en",
    terrain: chunkTerrain({ seed: 7, coord, origin }),
    neighbours: [],
  });
const chapter = () =>
  generateChapter({
    title: "The first gull",
    place: "Salt Pylon",
    kind: "meet",
    brief: "Find who feeds the gulls.",
    logline: "A coast learns its names again.",
    carry: null,
    combat: false,
    language: "en",
    bible,
  });
const place = () =>
  generatePlace({ kind: "dungeon", wish: "", combat: false, language: "en", bible });

describe("the world harness in a model turn", () => {
  it("gives a witnessing turn the hot lore around its chunk (1)", async () => {
    mountWorldHarness(meta.id);
    await witness();
    const system = systemOf(asked[0]);
    expect(system).toContain("hot lore around chunk 1,0");
    expect(system).toContain("Feed the first gull");
  });

  it("gives chapter and place turns the world snapshot and the lore around the player (2)", async () => {
    mountWorldHarness(meta.id);
    await chapter();
    await place();
    for (const request of asked) {
      const system = systemOf(request);
      expect(system).toContain("<world>");
      expect(system).toContain('scene "Low Well"');
      expect(system).toContain("Salt Pylon");
    }
    expect(asked).toHaveLength(2);
  });

  it("keeps two turns at once apart on the shared harness (4)", async () => {
    mountWorldHarness(meta.id);
    const [chunk, next] = await Promise.all([witness(), chapter()]);
    expect(chunk.ok ? null : chunk.error.code).toBe("test-stop");
    expect(next.ok ? null : next.error.code).toBe("test-stop");
    expect(asked).toHaveLength(2);
    const prompts = asked.map(systemOf);
    const witnessing = prompts.find((text) => text.includes("root = Chunk("));
    const writing = prompts.find((text) => text.includes("one chapter of an open-world RPG"));
    expect(witnessing).toBeDefined();
    expect(writing).toBeDefined();
    expect(witnessing).not.toContain("one chapter of an open-world RPG");
    expect(writing).not.toContain("root = Chunk(");
  });

  it("claims no world when none is mounted (3)", async () => {
    await witness();
    await chapter();
    for (const request of asked) {
      expect(systemOf(request)).not.toContain("<lore>");
      expect(systemOf(request)).not.toContain("<world>");
    }
  });
});
