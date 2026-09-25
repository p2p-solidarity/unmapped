import { describe, expect, it } from "vitest";
import { landTileAt, walkableAt } from "../../src/renderer/engine2d/landModel";
import { makeScene, wall } from "../engine/fixtures";

describe("2D land model", () => {
  it("keeps authored floor patches at the origin and uses seeded land outside it", () => {
    const scene = makeScene({
      floor: { width: 8, depth: 8, tile: "grass" },
      patches: [{ x: 2, z: 3, width: 2, depth: 1, tile: "water" }],
    });

    expect(landTileAt(scene, 42, 0, 0)).toBe("grass");
    expect(landTileAt(scene, 42, 2, 3)).toBe("water");
    expect(landTileAt(scene, 42, 3, 3)).toBe("water");
    expect(landTileAt(scene, 42, 4, 3)).toBe("grass");
    expect(landTileAt(scene, 42, 40, -7)).toBe(landTileAt(scene, 42, 40, -7));
  });

  it("blocks hazardous ground and authored walls while leaving ordinary ground walkable", () => {
    const scene = makeScene({
      floor: { width: 8, depth: 8, tile: "grass" },
      patches: [
        { x: 1, z: 1, width: 1, depth: 1, tile: "water" },
        { x: 2, z: 1, width: 1, depth: 1, tile: "lava" },
      ],
      walls: [wall(3, 1, 2)],
    });

    expect(walkableAt(scene, 7, 0, 0)).toBe(true);
    expect(walkableAt(scene, 7, 1, 1)).toBe(false);
    expect(walkableAt(scene, 7, 2, 1)).toBe(false);
    expect(walkableAt(scene, 7, 3, 1)).toBe(false);
    expect(walkableAt(scene, 7, 4, 1)).toBe(false);
  });
});

describe("2D land props", () => {
  it("blocks the collider of a solid prop but not open ground next to it", async () => {
    const { blockedByProps } = await import("../../src/renderer/engine2d/landModel");
    const tree = { kind: "tree", x: 4, z: 4, scale: 1 } as Parameters<
      typeof blockedByProps
    >[0][number];
    expect(blockedByProps([tree], 0, 0, 4.5, 4.5)).toBe(true);
    expect(blockedByProps([tree], 0, 0, 6.5, 4.5)).toBe(false);
    expect(blockedByProps([tree], 32, 0, 36.5, 4.5)).toBe(true);
  });
});
