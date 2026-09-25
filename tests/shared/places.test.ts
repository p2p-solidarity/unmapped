import { parseScene } from "@dsl";
import { landProgressSchema } from "@main/instances/schemas";
import { buildPlace, type LandPlace, placeSpot, wishedDirection } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";
import { isWallTile, spawnTile } from "../../src/renderer/engine/colliders";

// What a model writes for a place: residents, loot and monsters, coordinates it does not control.
const WRITTEN = `root = Scene("Test Mine", "abyss", [floor, sky, light, chest, coin, foe1, foe2, npc1, quest])
floor = Floor(20, 20, "stone")
sky = Sky("#101018", "#101018", 0.05)
light = Light("ambient", "#8899aa", 0.6)
chest = Treasure("chest", 1, 1, ["lamp oil"])
coin = Treasure("coin", 1, 1, ["old coin"])
foe1 = Monster("foe_a", "slime", 1, 1, 2, "salt")
foe2 = Monster("foe_b", "skeleton", 1, 1, 3, "light")
npc1 = NPC("miner", "Old Miner", 1, 1, "merchant", "calm", "#aa8844")
quest = Quest("q1", "Find the lamp oil.")`;

function written(): SceneGraph {
  const parsed = parseScene(WRITTEN);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function place(kind: LandPlace["kind"], seed: number): LandPlace {
  return {
    id: "p1",
    kind,
    title: "Test Mine",
    cx: 2,
    cz: -1,
    seed,
    source: WRITTEN,
    cleared: false,
  };
}

describe("places on the land", () => {
  it("lays a side-scroller along one row: clear spawn, two exits and everything on the row", () => {
    const { graph, goalExit } = buildPlace(place("side", 7), written());
    expect(graph.contract?.kit).toBe("platformer_2_5d@1");
    const row = Math.floor(graph.floor.depth / 2);
    const [sx, sz] = spawnTile(graph) ?? [-1, -1];
    expect(sz).toBe(row);
    expect(isWallTile(graph.walls, sx, sz)).toBe(false);
    expect(graph.exits).toHaveLength(2);
    expect(goalExit.x).toBeGreaterThan(sx);
    for (const one of [...graph.exits, ...graph.treasures, ...graph.monsters, ...graph.npcs]) {
      expect(one.z).toBe(row);
    }
    expect(graph.treasures).toHaveLength(2);
    expect(graph.monsters).toHaveLength(2);
  });

  it("carves a dungeon whose far end is reachable, with nothing buried in rock", () => {
    for (const seed of [1, 2, 3, 99]) {
      const { graph, goalExit } = buildPlace(place("dungeon", seed), written());
      expect(graph.contract?.kit).toBe("dungeon_grid@1");
      const { width, depth } = graph.floor;
      const start = { x: Math.floor(width / 2), z: Math.floor(depth / 2) };
      expect(isWallTile(graph.walls, start.x, start.z)).toBe(false);
      // The way back is behind the player as they arrive (facing north).
      expect(graph.exits[0]).toMatchObject({ x: start.x, z: start.z + 1 });
      const seen = new Set([`${start.x},${start.z}`]);
      const queue = [start];
      while (queue.length > 0) {
        const tile = queue.pop();
        if (tile === undefined) break;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const x = tile.x + dx;
          const z = tile.z + dz;
          if (x < 0 || z < 0 || x >= width || z >= depth || seen.has(`${x},${z}`)) continue;
          if (isWallTile(graph.walls, x, z)) continue;
          seen.add(`${x},${z}`);
          queue.push({ x, z });
        }
      }
      expect(seen.has(`${goalExit.x},${goalExit.z}`)).toBe(true);
      for (const one of [...graph.exits, ...graph.treasures, ...graph.monsters, ...graph.npcs]) {
        expect(isWallTile(graph.walls, one.x, one.z)).toBe(false);
      }
    }
  });

  it("puts the entrance near the player, where they asked, never on a taken spot", () => {
    const north = placeSpot({ cx: 0, cz: 0 }, [], wishedDirection("在北邊加一座地城"));
    expect(north?.cz).toBeLessThan(0);
    const near = placeSpot({ cx: 3, cz: 3 }, [{ cx: 3, cz: 4 }], null);
    expect(near).not.toEqual({ cx: 3, cz: 4 });
    expect(Math.max(Math.abs((near?.cx ?? 99) - 3), Math.abs((near?.cz ?? 99) - 3))).toBe(1);
    expect(placeSpot({ cx: 1, cz: 0 }, [], null)).not.toEqual({ cx: 0, cz: 0 });
  });

  it("is kept in the save", () => {
    const land = {
      errands: {},
      home: { cx: 0, cz: 0, keepsakes: [] },
      door: [null, null, null, null],
    };
    expect(landProgressSchema.safeParse({ ...land, places: [place("side", 5)] }).success).toBe(
      true,
    );
    expect(
      landProgressSchema.safeParse({ ...land, places: [{ ...place("side", 5), kind: "moon" }] })
        .success,
    ).toBe(false);
  });
});
