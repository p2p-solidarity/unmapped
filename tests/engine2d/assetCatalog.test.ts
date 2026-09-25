import { MONSTER_KINDS, NPC_ROLES, TILES } from "@shared/world";
import { describe, expect, it } from "vitest";
import { MONSTER_SPRITES, ROLE_SPRITES } from "../../src/renderer/engine2d/actorSprites";
import {
  ACTOR_ASSETS,
  ATLAS_DIMENSIONS,
  GROUND_ASSETS,
  PROP_ASSETS,
} from "../../src/renderer/engine2d/assetCatalog";

describe("2D land asset catalog", () => {
  it("maps every ground semantic to a bounded CC0 atlas region", () => {
    expect(Object.keys(GROUND_ASSETS).sort()).toEqual([...TILES].sort());
    for (const tile of TILES) {
      const asset = GROUND_ASSETS[tile];
      expect(asset.id).toBe(`ground.${tile}`);
      expectRegionInsideAtlas(asset);
    }
  });

  it("keeps prop and actor coordinates behind semantic ids", () => {
    expect(PROP_ASSETS.tree?.id).toBe("prop.tree");
    expect(PROP_ASSETS.rock?.id).toBe("prop.rock");
    expect(ACTOR_ASSETS.player.id).toBe("actor.player");
    for (const asset of [...Object.values(PROP_ASSETS), ...Object.values(ACTOR_ASSETS)]) {
      if (asset !== undefined) expectRegionInsideAtlas(asset);
    }
  });

  it("gives every NPC role and monster kind its own cell of the generated sheet", () => {
    const cells = [...Object.values(ROLE_SPRITES), ...Object.values(MONSTER_SPRITES)];
    expect(Object.keys(ROLE_SPRITES)).toEqual([...NPC_ROLES]);
    expect(Object.keys(MONSTER_SPRITES)).toEqual([...MONSTER_KINDS]);
    expect(new Set(cells.map((cell) => `${cell.sx},${cell.sy}`)).size).toBe(cells.length);
    for (const cell of cells) expectRegionInsideAtlas(cell);
  });
});

function expectRegionInsideAtlas(asset: {
  atlas: keyof typeof ATLAS_DIMENSIONS;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}): void {
  const size = ATLAS_DIMENSIONS[asset.atlas];
  expect(asset.sx).toBeGreaterThanOrEqual(0);
  expect(asset.sy).toBeGreaterThanOrEqual(0);
  expect(asset.sw).toBeGreaterThan(0);
  expect(asset.sh).toBeGreaterThan(0);
  expect(asset.sx + asset.sw).toBeLessThanOrEqual(size.width);
  expect(asset.sy + asset.sh).toBeLessThanOrEqual(size.height);
}
