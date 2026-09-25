import {
  FACING_YAW,
  type Facing,
  shortestTurn,
  startTile,
  stepTarget,
  turn,
} from "@renderer/engine/gridStep";
import type { FloorSpec, WallSpec } from "@shared/world";
import { describe, expect, it } from "vitest";

const floor: FloorSpec = { width: 10, depth: 10, tile: "stone" };
const noWalls: WallSpec[] = [];

describe("turn", () => {
  it("wraps in both directions", () => {
    expect(turn(0, 1)).toBe(1);
    expect(turn(3, 1)).toBe(0);
    expect(turn(0, -1)).toBe(3);
    expect(turn(2, -3)).toBe(3);
  });

  it("maps each quarter to a camera yaw a quarter apart", () => {
    const yaws = ([0, 1, 2, 3] as Facing[]).map((facing) => FACING_YAW[facing]);
    expect(new Set(yaws).size).toBe(4);
    expect(Math.abs(yaws[1] ?? 0) - Math.abs(yaws[3] ?? 0)).toBeCloseTo(0);
  });
});

describe("stepTarget", () => {
  it("moves exactly one tile in the direction faced", () => {
    expect(stepTarget({ x: 5, z: 5 }, 0, 1, floor, noWalls)).toEqual({ x: 5, z: 4 });
    expect(stepTarget({ x: 5, z: 5 }, 1, 1, floor, noWalls)).toEqual({ x: 6, z: 5 });
    expect(stepTarget({ x: 5, z: 5 }, 2, 1, floor, noWalls)).toEqual({ x: 5, z: 6 });
    expect(stepTarget({ x: 5, z: 5 }, 3, 1, floor, noWalls)).toEqual({ x: 4, z: 5 });
  });

  it("backs up without turning round", () => {
    expect(stepTarget({ x: 5, z: 5 }, 0, -1, floor, noWalls)).toEqual({ x: 5, z: 6 });
  });

  it("refuses to leave the floor rather than sliding along the edge", () => {
    expect(stepTarget({ x: 0, z: 0 }, 3, 1, floor, noWalls)).toEqual({ x: 0, z: 0 });
    expect(stepTarget({ x: 9, z: 9 }, 2, 1, floor, noWalls)).toEqual({ x: 9, z: 9 });
  });

  it("stops dead at a wall", () => {
    const walls: WallSpec[] = [{ x: 4, z: 4, width: 3, height: 2, material: "stone" }];
    // The wall spans x=4..6 at z=4, so stepping north out of (5,5) is blocked.
    expect(stepTarget({ x: 5, z: 5 }, 0, 1, floor, walls)).toEqual({ x: 5, z: 5 });
    // One tile east of the wall's end is clear.
    expect(stepTarget({ x: 7, z: 5 }, 0, 1, floor, walls)).toEqual({ x: 7, z: 4 });
  });
});

describe("startTile", () => {
  it("starts in the middle, which scenes are required to keep clear", () => {
    expect(startTile(floor)).toEqual({ x: 5, z: 5 });
  });
});

describe("shortestTurn", () => {
  it("never takes the long way round", () => {
    expect(shortestTurn(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(shortestTurn(0, -Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    // From just under a full turn to just over zero is a small step forward, not a full unwind.
    expect(shortestTurn(Math.PI * 1.9, 0.1)).toBeCloseTo(0.1 - (Math.PI * 1.9 - Math.PI * 2), 5);
    expect(Math.abs(shortestTurn(Math.PI * 1.9, 0.1))).toBeLessThan(Math.PI);
  });
});
