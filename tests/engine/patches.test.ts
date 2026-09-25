import { TILE_THICKNESS, TILE_TOP } from "@renderer/engine/colliders";
import {
  coveredKeys,
  groupPatchTiles,
  isLiquidTile,
  PATCH_DROP,
  PATCH_PULSE,
  patchCenterY,
  patchKey,
  patchTiles,
  pulseIntensity,
} from "@renderer/engine/patches";
import { TILES } from "@shared/world";
import { describe, expect, it } from "vitest";
import { patch } from "./fixtures";

const floor = { width: 6, depth: 5, tile: "grass" } as const;

describe("patchTiles", () => {
  it("expands a rectangle into one instance per tile, row-major", () => {
    const tiles = patchTiles(floor, [patch(1, 2, 3, 2, "stone")]);
    expect(tiles).toHaveLength(6);
    expect(tiles.map((t) => `${t.x},${t.z}`)).toEqual(["1,2", "2,2", "3,2", "1,3", "2,3", "3,3"]);
    expect(tiles.every((t) => t.tile === "stone")).toBe(true);
  });

  it("clips to the floor rectangle instead of spilling off the edge", () => {
    const tiles = patchTiles(floor, [patch(4, 3, 8, 8, "water")]);
    expect(tiles).toHaveLength(4);
    for (const tile of tiles) {
      expect(tile.x).toBeLessThan(floor.width);
      expect(tile.z).toBeLessThan(floor.depth);
    }
    expect(patchTiles(floor, [patch(-4, -4, 2, 2, "lava")])).toEqual([]);
  });

  it("lets the last patch win where two overlap", () => {
    const tiles = patchTiles(floor, [patch(0, 0, 3, 3, "sand"), patch(1, 1, 2, 2, "water")]);
    const byKey = new Map(tiles.map((t) => [patchKey(t.x, t.z), t.tile]));
    expect(byKey.get("0,0")).toBe("sand");
    expect(byKey.get("1,1")).toBe("water");
    expect(byKey.get("2,2")).toBe("water");
    expect(tiles).toHaveLength(9);
  });

  it("never emits a tile twice, so the base floor count stays exact", () => {
    const tiles = patchTiles(floor, [patch(0, 0, 3, 3, "sand"), patch(0, 0, 3, 3, "snow")]);
    expect(tiles).toHaveLength(9);
    expect(coveredKeys(tiles).size).toBe(9);
    expect(floor.width * floor.depth - coveredKeys(tiles).size).toBe(21);
  });

  it("rounds a fractional rectangle up to at least one tile", () => {
    expect(patchTiles(floor, [patch(1, 1, 0, 0, "wood")])).toHaveLength(1);
    expect(patchTiles(floor, [patch(1.6, 1.2, 1.4, 1.4, "wood")]).map((t) => [t.x, t.z])).toEqual([
      [1, 1],
    ]);
  });

  it("returns nothing for an empty patch list or an empty floor", () => {
    expect(patchTiles(floor, [])).toEqual([]);
    expect(patchTiles({ width: 0, depth: 0, tile: "void" }, [patch(0, 0, 2, 2, "lava")])).toEqual(
      [],
    );
  });
});

describe("groupPatchTiles", () => {
  it("buckets tiles per kind so each kind gets one instanced mesh", () => {
    const tiles = patchTiles(floor, [patch(0, 0, 2, 1, "sand"), patch(3, 0, 2, 1, "water")]);
    const groups = groupPatchTiles(tiles);
    expect([...groups.keys()]).toEqual(["sand", "water"]);
    expect(groups.get("sand")).toHaveLength(2);
    expect(groups.get("water")).toHaveLength(2);
  });
});

describe("patch surface", () => {
  it("sits exactly PATCH_DROP below the floor top", () => {
    expect(patchCenterY() + TILE_THICKNESS / 2).toBeCloseTo(TILE_TOP - PATCH_DROP);
    expect(PATCH_DROP).toBe(0.05);
  });
});

describe("liquid pulse", () => {
  it("oscillates water and lava and leaves every other tile matte", () => {
    for (const tile of TILES) {
      const liquid = tile === "water" || tile === "lava";
      expect(isLiquidTile(tile), tile).toBe(liquid);
      expect(pulseIntensity(tile, 0) === null, tile).toBe(!liquid);
    }
  });

  it("stays inside base ± amplitude and never goes negative", () => {
    for (const tile of ["water", "lava"] as const) {
      const pulse = PATCH_PULSE[tile];
      expect(pulse).toBeDefined();
      if (pulse === undefined) continue;
      expect(pulse.base - pulse.amplitude).toBeGreaterThanOrEqual(0);
      for (let t = 0; t < 12; t += 0.37) {
        const value = pulseIntensity(tile, t) ?? 0;
        expect(value).toBeGreaterThanOrEqual(pulse.base - pulse.amplitude - 1e-9);
        expect(value).toBeLessThanOrEqual(pulse.base + pulse.amplitude + 1e-9);
      }
    }
  });

  it("burns hotter than water", () => {
    expect(PATCH_PULSE.lava?.base ?? 0).toBeGreaterThan(PATCH_PULSE.water?.base ?? 0);
  });
});
