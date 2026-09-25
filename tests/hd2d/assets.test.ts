import { TILES } from "@shared/world";
import { describe, expect, it } from "vitest";
import { ATLAS_DIMENSIONS } from "../../src/renderer/engine2d/assetCatalog";
import {
  GROUND_LOOK,
  PROP_BOARDS,
  type SheetRect,
  TILE_HEIGHT,
} from "../../src/renderer/hd2d/assets";

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
});
