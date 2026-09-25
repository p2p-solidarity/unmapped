import { describe, expect, it } from "vitest";
import { makeScene } from "../engine/fixtures";

describe("walking around trees", () => {
  it("slides along a trunk it is pressed against instead of wedging", async () => {
    const { canStandAt, PLAYER_RADIUS } = await import("../../src/renderer/engine2d/landModel");
    const tree = { kind: "tree", x: 4, z: 4, scale: 1.52, tint: null, dynamic: false } as const;
    const origin = makeScene({ floor: { width: 8, depth: 8, tile: "grass" }, props: [tree] });
    // The trunk is centred on tile (4, 4) at (4.5, 4.5); its collider is 0.35 × 1.52.
    const touching = 4.5 - (0.35 * 1.52 + PLAYER_RADIUS) - 0.01;
    expect(canStandAt(origin, 7, {}, touching, 4.5)).toBe(true);
    expect(canStandAt(origin, 7, {}, touching + 0.05, 4.5)).toBe(false);
    // Along the trunk, either way, is open: this is what the square-corner test refused.
    expect(canStandAt(origin, 7, {}, touching, 4.56)).toBe(true);
    expect(canStandAt(origin, 7, {}, touching, 4.44)).toBe(true);
  });
});
