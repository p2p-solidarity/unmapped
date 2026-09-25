import { shuffleForRun } from "@shared/runShuffle";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";

function scene(overrides: Partial<SceneGraph> = {}): SceneGraph {
  return {
    name: "deck",
    biome: "cyber_workshop",
    contract: null,
    floor: { width: 20, depth: 20, tile: "stone" },
    patches: [],
    platforms: [],
    walls: [],
    props: [],
    npcs: [],
    monsters: [
      { id: "a", kind: "drone", x: 2, z: 2, level: 1, weakness: "", size: 1, color: null },
      { id: "b", kind: "drone", x: 3, z: 3, level: 2, weakness: "", size: 1, color: null },
      { id: "c", kind: "golem", x: 4, z: 4, level: 3, weakness: "", size: 1, color: null },
    ],
    treasures: [{ id: "chest", x: 5, z: 5, loot: ["scrap"] }],
    exits: [{ x: 10, z: 18, to: "out", targetSceneId: null }],
    lights: [],
    sky: null,
    triggers: [],
    quests: [],
    ...overrides,
  };
}

describe("shuffleForRun", () => {
  it("is deterministic: the same seed replays the same layout", () => {
    const a = shuffleForRun(scene(), 7);
    const b = shuffleForRun(scene(), 7);
    expect(a.monsters).toEqual(b.monsters);
    const other = shuffleForRun(scene(), 8);
    expect(other.monsters).not.toEqual(a.monsters);
  });

  it("never stacks two movers on one tile", () => {
    const run = shuffleForRun(scene(), 4242);
    const tiles = [...run.monsters, ...run.treasures].map((one) => `${one.x},${one.z}`);
    expect(new Set(tiles).size).toBe(tiles.length);
  });

  it("keeps the spawn tile clear so a run never starts inside a monster", () => {
    const run = shuffleForRun(scene(), 31337);
    for (const monster of run.monsters) {
      expect(Math.abs(monster.x - 10) + Math.abs(monster.z - 10)).toBeGreaterThanOrEqual(3);
    }
  });

  it("leaves a scene alone when there is nowhere to put anyone", () => {
    const cramped = scene({ floor: { width: 3, depth: 3, tile: "stone" } });
    expect(shuffleForRun(cramped, 1)).toEqual(cramped);
    const empty = scene({ monsters: [], treasures: [] });
    expect(shuffleForRun(empty, 1)).toEqual(empty);
  });
});
