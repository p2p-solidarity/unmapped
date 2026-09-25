import {
  CHUNK_SIZE,
  chunkOf,
  chunksAround,
  chunkTerrain,
  clearFords,
  groundAt,
  isFord,
  MAX_CHUNK_PROPS,
} from "@shared/chunks";
import { describe, expect, it } from "vitest";

const origin = { floor: { width: 20, depth: 16, tile: "grass" as const } };

describe("chunks", () => {
  it("maps world positions to chunk coordinates on both sides of zero", () => {
    expect(chunkOf(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(chunkOf(31.9, 32)).toEqual({ cx: 0, cz: 1 });
    expect(chunkOf(-0.1, -32.1)).toEqual({ cx: -1, cz: -2 });
    expect(chunksAround({ cx: 3, cz: -1 }, 2)).toHaveLength(25);
  });

  it("regenerates the same chunk from the same seed, and a different one from another", () => {
    const coord = { cx: -4, cz: 7 };
    const a = chunkTerrain({ seed: 1234, coord, origin });
    expect(chunkTerrain({ seed: 1234, coord, origin })).toEqual(a);
    expect(chunkTerrain({ seed: 99, coord, origin })).not.toEqual(a);
  });

  it("keeps ground continuous across a chunk border", () => {
    // The tile just inside chunk (1, 0) is whatever the land says world tile (32, 5) is.
    const east = chunkTerrain({ seed: 7, coord: { cx: 1, cz: 0 }, origin });
    const painted = east.patches.find((patch) => patch.z === 5 && patch.x === 0)?.tile ?? "grass";
    expect(painted).toBe(groundAt(7, CHUNK_SIZE, 5, "grass"));
  });

  it("stays inside the chunk and under the prop budget", () => {
    for (const coord of chunksAround({ cx: 0, cz: 0 }, 3)) {
      const terrain = chunkTerrain({ seed: 42, coord, origin });
      expect(terrain.props.length).toBeLessThanOrEqual(MAX_CHUNK_PROPS);
      for (const item of [...terrain.props, ...terrain.patches]) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.z).toBeGreaterThanOrEqual(0);
        expect(item.x).toBeLessThan(CHUNK_SIZE);
        expect(item.z).toBeLessThan(CHUNK_SIZE);
      }
    }
  });

  it("leaves the authored scene's own tiles empty in the origin chunk", () => {
    const home = chunkTerrain({ seed: 42, coord: { cx: 0, cz: 0 }, origin });
    expect(home.hole).toEqual({ width: 20, depth: 16 });
    const inside = (x: number, z: number): boolean => x < 20 && z < 16;
    expect(home.props.some((prop) => inside(prop.x, prop.z))).toBe(false);
    expect(home.patches.some((patch) => inside(patch.x, patch.z))).toBe(false);
  });

  it("joins the spawn to every chunk centre by land on any seed", () => {
    const blocked = (seed: number, x: number, z: number): boolean => {
      const tile = groundAt(seed, x, z, "grass");
      return tile === "water" || tile === "lava" || tile === "void";
    };
    for (const seed of [1, 7, 42, 1234, 0xdeadbeef]) {
      const reach = 70;
      const seen = new Set<string>(["4,4"]);
      const queue: Array<[number, number]> = [[4, 4]];
      while (queue.length > 0) {
        const [x, z] = queue.pop() ?? [0, 0];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const nz = z + dz;
          const key = `${nx},${nz}`;
          if (Math.abs(nx) > reach || Math.abs(nz) > reach || seen.has(key)) continue;
          if (blocked(seed, nx, nz)) continue;
          seen.add(key);
          queue.push([nx, nz]);
        }
      }
      for (const cx of [-1, 0, 1]) {
        for (const cz of [-1, 0, 1]) expect(seen.has(`${cx * 32 + 16},${cz * 32 + 16}`)).toBe(true);
      }
    }
    expect(isFord(16, 3)).toBe(true);
    expect(isFord(-16, 3)).toBe(true);
    expect(isFord(3, 3)).toBe(false);
  });

  it("keeps whatever a witnessed chunk wrote off its fords", () => {
    const scene = {
      name: "place",
      biome: "countryside",
      contract: null,
      floor: { width: 32, depth: 32, tile: "grass" },
      patches: [],
      platforms: [],
      walls: [{ x: 10, z: 3, width: 12, height: 2, material: "stone" }],
      props: [
        { kind: "tree", x: 16, z: 4, scale: 1, tint: null, dynamic: false },
        { kind: "tree", x: 4, z: 4, scale: 1, tint: null, dynamic: false },
      ],
      npcs: [],
      monsters: [],
      treasures: [],
      exits: [],
      lights: [],
      sky: null,
      triggers: [],
      quests: [],
    } as unknown as Parameters<typeof clearFords>[0];
    const cleared = clearFords(scene, { cx: 2, cz: -1 });
    expect(cleared.props.map((prop) => prop.x)).toEqual([4]);
    // Columns 15–17 are the ford: the wall from 10 to 21 splits around it.
    expect(cleared.walls.map((wall) => [wall.x, wall.width])).toEqual([
      [10, 5],
      [18, 4],
    ]);
    const untouched = { ...scene, walls: [], props: [scene.props[1]] } as typeof scene;
    expect(clearFords(untouched, { cx: 0, cz: 0 })).toBe(untouched);
  });
});
