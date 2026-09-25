import { describe, expect, it } from "vitest";
import { findPath, type Route, steer } from "../../src/renderer/engine2d/walkTo";

/** A 20×20 field with a wall across x = 10 from z = 0 to z = 15; the only way round is south. */
const stand = (x: number, z: number): boolean => {
  if (x < 0 || z < 0 || x >= 20 || z >= 20) return false;
  return !(Math.floor(x) === 10 && z < 15);
};

describe("click to walk", () => {
  it("walks round what is in the way and ends where the player clicked", () => {
    const path = findPath({ x: 5.5, z: 2.5 }, { x: 15.2, z: 2.7 }, stand);
    if (path === null) throw new Error("no path");
    expect(path.at(-1)).toEqual({ x: 15.2, z: 2.7 });
    // It had to go below the wall's end.
    expect(path.some((point) => point.z >= 15)).toBe(true);
    // Straightened: a handful of turns, not one point per tile.
    expect(path.length).toBeLessThan(6);
  });

  it("stops next to a spot that cannot be stood on, and gives up on the unreachable", () => {
    const path = findPath({ x: 5.5, z: 2.5 }, { x: 10.5, z: 5.5 }, stand);
    const end = path?.at(-1);
    expect(end === undefined ? false : stand(end.x, end.z)).toBe(true);
    const walled = (x: number, z: number) => stand(x, z) && Math.floor(x) !== 10;
    expect(findPath({ x: 5.5, z: 2.5 }, { x: 15.5, z: 2.5 }, walled)).toBeNull();
  });

  it("steers toward each point in turn and never past the end", () => {
    const route: Route = { points: [{ x: 3, z: 0 }], target: null, stopWithin: 0, stuck: 0 };
    const first = steer(route, { x: 0, z: 0 }, 0.1);
    expect(first).toEqual({ strafe: 1, forward: -0 });
    // 0.15 left and a 0.3 step: half a push lands on the end instead of past it.
    const near = steer(route, { x: 2.85, z: 0 }, 0.3);
    expect(near?.strafe).toBeCloseTo(0.5);
    expect(steer(route, { x: 3, z: 0 }, 0.1)).toBeNull();
    expect(route.points).toEqual([]);
  });
});
