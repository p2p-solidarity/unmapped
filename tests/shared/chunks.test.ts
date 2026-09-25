import {
  CHUNK_SIZE,
  chunkOf,
  chunksAround,
  chunkTerrain,
  groundAt,
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
});
