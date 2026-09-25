import { TILES } from "@shared/world";
import { describe, expect, it } from "vitest";
import { ATLAS_DIMENSIONS } from "../../src/renderer/engine2d/assetCatalog";
import {
  GROUND_LOOK,
  PROP_BOARDS,
  type SheetRect,
  TILE_HEIGHT,
  tileHash,
} from "../../src/renderer/hd2d/assets";
import { chunksAround } from "../../src/renderer/hd2d/content";

function inside(rect: SheetRect): boolean {
  const atlas = ATLAS_DIMENSIONS[rect.atlas];
  return (
    rect.sx >= 0 &&
    rect.sy >= 0 &&
    rect.sx + rect.sw <= atlas.width &&
    rect.sy + rect.sh <= atlas.height
  );
}

describe("HD-2D land", () => {
  it("cuts every sprite and ground face from inside its sheet", () => {
    for (const boards of Object.values(PROP_BOARDS)) {
      for (const board of boards ?? []) expect(inside(board), board.id).toBe(true);
    }
    for (const tile of TILES) {
      const look = GROUND_LOOK[tile];
      for (const rect of [look.plain, ...look.worn]) expect(inside(rect), tile).toBe(true);
      expect(Number.isFinite(TILE_HEIGHT[tile])).toBe(true);
    }
  });

  it("hashes tiles deterministically into [0, 1)", () => {
    expect(tileHash(3, -7, 2)).toBe(tileHash(3, -7, 2));
    for (let i = 0; i < 200; i += 1) {
      const value = tileHash(i, -i * 3, 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("streams the chunks around the focus, deeper to the north", () => {
    const coords = chunksAround(16, 16, { side: 34, north: 34, south: 16 });
    expect(coords).toContainEqual({ cx: 0, cz: 0 });
    expect(coords).toContainEqual({ cx: 0, cz: -1 });
    expect(coords.every((c) => c.cz <= 1)).toBe(true);
  });
});
