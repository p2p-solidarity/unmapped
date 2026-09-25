import {
  isWallTile,
  PLAYER_FOOT_OFFSET,
  propColliders,
  spawnPoint,
  spawnTile,
  TILE_TOP,
} from "@renderer/engine/colliders";
import { describe, expect, it } from "vitest";
import { makeScene, prop, wall } from "./fixtures";

describe("propCollider", () => {
  // Two props may stand on the same tile; a second identical collider adds nothing to the
  // simulation and gave the two of them the same React key.
  it("keeps one collider when two props on a tile produce the same shape", () => {
    expect(propColliders([prop("rock", 2, 2), prop("rock", 2, 2)])).toHaveLength(1);
    expect(propColliders([prop("rock", 2, 2), prop("rock", 2, 2, 2)])).toHaveLength(2);
  });
});

describe("spawn selection", () => {
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

  it("falls back to a safe point when no tile is free", () => {
    const walled = makeScene({
      floor: { width: 1, depth: 1, tile: "stone" },
      walls: [wall(0, 0, 1)],
    });
    expect(spawnPoint(walled)).toEqual([0.5, TILE_TOP + PLAYER_FOOT_OFFSET, 0.5]);
  });
});
