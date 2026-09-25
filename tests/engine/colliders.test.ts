import {
  clampToFloor,
  floorBox,
  isWallTile,
  PLAYER_FOOT_OFFSET,
  propCollider,
  propColliders,
  spawnPoint,
  spawnTile,
  TILE_THICKNESS,
  TILE_TOP,
  tileCenter,
  tileToWorld,
  wallBox,
  wallTiles,
  worldToTile,
} from "@renderer/engine/colliders";
import { describe, expect, it } from "vitest";
import { makeScene, prop, wall } from "./fixtures";

describe("tile ↔ world", () => {
  it("centres tile (x, z) at (x + 0.5, z + 0.5)", () => {
    expect(tileToWorld(0, 0)).toEqual([0.5, 0.5]);
    expect(tileToWorld(3, 7)).toEqual([3.5, 7.5]);
    expect(tileToWorld(-2, 5)).toEqual([-1.5, 5.5]);
  });

  it("places tile centres on the walkable surface", () => {
    expect(tileCenter(2, 4)).toEqual([2.5, TILE_TOP, 4.5]);
    expect(tileCenter(2, 4, 1.5)).toEqual([2.5, TILE_TOP + 1.5, 4.5]);
    expect(TILE_TOP).toBeCloseTo(TILE_THICKNESS / 2);
  });

  it("round-trips through worldToTile", () => {
    const [wx, wz] = tileToWorld(6, 2);
    expect(worldToTile(wx, wz)).toEqual([6, 2]);
  });
});

describe("floorBox", () => {
  it("covers the whole rectangle with its top face at TILE_TOP", () => {
    const box = floorBox({ width: 10, depth: 6, tile: "stone" });
    expect(box.center).toEqual([5, 0, 3]);
    expect(box.half).toEqual([5, TILE_TOP, 3]);
    expect(box.center[1] + box.half[1]).toBeCloseTo(TILE_TOP);
  });
});

describe("wallBox", () => {
  it("runs `width` tiles along +X, one tile deep, standing on the floor", () => {
    const box = wallBox(wall(2, 3, 4, 2.5));
    expect(box.center).toEqual([4, TILE_TOP + 1.25, 3.5]);
    expect(box.half).toEqual([2, 1.25, 0.5]);
  });

  it("never collapses to a zero-size box", () => {
    const box = wallBox({ x: 0, z: 0, width: 0, height: 0, material: "stone" });
    expect(box.half[0]).toBeGreaterThan(0);
    expect(box.half[1]).toBeGreaterThan(0);
  });

  it("lists every tile it occupies", () => {
    expect(wallTiles(wall(2, 3, 3))).toEqual([
      [2, 3],
      [3, 3],
      [4, 3],
    ]);
  });
});

describe("isWallTile", () => {
  const walls = [wall(2, 3, 3), wall(0, 0, 1)];

  it("matches every tile of a run and nothing past its end", () => {
    expect(isWallTile(walls, 2, 3)).toBe(true);
    expect(isWallTile(walls, 4, 3)).toBe(true);
    expect(isWallTile(walls, 5, 3)).toBe(false);
    expect(isWallTile(walls, 3, 4)).toBe(false);
    expect(isWallTile(walls, 0, 0)).toBe(true);
  });
});

describe("propCollider", () => {
  it("returns a cylinder standing on the floor, scaled by the prop scale", () => {
    const collider = propCollider(prop("tree", 4, 5, 2));
    expect(collider).not.toBeNull();
    if (collider === null) return;
    expect(collider.radius).toBeCloseTo(0.7);
    expect(collider.halfHeight).toBeCloseTo(1.2);
    expect(collider.center[0]).toBeCloseTo(4.5);
    expect(collider.center[2]).toBeCloseTo(5.5);
    expect(collider.center[1]).toBeCloseTo(TILE_TOP + 1.2);
  });

  it("skips flowers and mushrooms so the player can walk through them", () => {
    expect(propCollider(prop("flower", 1, 1))).toBeNull();
    expect(propCollider(prop("mushroom", 1, 1))).toBeNull();
    expect(propColliders([prop("flower", 1, 1), prop("rock", 2, 2)])).toHaveLength(1);
  });

  // Two props may stand on the same tile; a second identical collider adds nothing to the
  // simulation and gave the two of them the same React key.
  it("keeps one collider when two props on a tile produce the same shape", () => {
    expect(propColliders([prop("rock", 2, 2), prop("rock", 2, 2)])).toHaveLength(1);
    expect(propColliders([prop("rock", 2, 2), prop("rock", 2, 2, 2)])).toHaveLength(2);
  });

  it("treats a non-positive scale as 1", () => {
    const collider = propCollider(prop("rock", 0, 0, 0));
    expect(collider?.radius).toBeCloseTo(0.4);
  });
});

describe("clampToFloor", () => {
  const floor = { width: 8, depth: 6, tile: "grass" } as const;

  it("keeps the player inside the rectangle with a margin", () => {
    expect(clampToFloor(floor, -5, -5, 0.3)).toEqual([0.3, 0.3]);
    expect(clampToFloor(floor, 99, 99, 0.3)).toEqual([7.7, 5.7]);
    expect(clampToFloor(floor, 4, 3, 0.3)).toEqual([4, 3]);
  });
});

describe("spawn selection", () => {
  it("uses the floor centre when it is free", () => {
    expect(spawnTile(makeScene())).toEqual([4, 4]);
  });

  it("avoids a wall standing on the centre tile", () => {
    const scene = makeScene({ walls: [wall(4, 4, 1)] });
    const tile = spawnTile(scene);
    expect(tile).not.toBeNull();
    if (tile === null) return;
    expect(isWallTile(scene.walls, tile[0], tile[1])).toBe(false);
    expect(Math.max(Math.abs(tile[0] - 4), Math.abs(tile[1] - 4))).toBe(1);
  });

  it("walks outwards until it clears a wall that covers the middle band", () => {
    const scene = makeScene({
      walls: [wall(0, 3, 8), wall(0, 4, 8), wall(0, 5, 8)],
    });
    const tile = spawnTile(scene);
    expect(tile).not.toBeNull();
    if (tile === null) return;
    expect(isWallTile(scene.walls, tile[0], tile[1])).toBe(false);
  });

  it("returns null when every tile is walled and for an empty floor", () => {
    const walled = makeScene({
      floor: { width: 2, depth: 2, tile: "stone" },
      walls: [wall(0, 0, 2), wall(0, 1, 2)],
    });
    expect(spawnTile(walled)).toBeNull();
    expect(spawnTile(makeScene({ floor: { width: 0, depth: 0, tile: "void" } }))).toBeNull();
  });

  it("spawns the capsule with its feet on the floor surface", () => {
    const [x, y, z] = spawnPoint(makeScene());
    expect(x).toBeCloseTo(4.5);
    expect(z).toBeCloseTo(4.5);
    expect(y).toBeCloseTo(TILE_TOP + PLAYER_FOOT_OFFSET);
  });

  it("falls back to a safe point when no tile is free", () => {
    const walled = makeScene({
      floor: { width: 1, depth: 1, tile: "stone" },
      walls: [wall(0, 0, 1)],
    });
    expect(spawnPoint(walled)).toEqual([0.5, TILE_TOP + PLAYER_FOOT_OFFSET, 0.5]);
  });
});
