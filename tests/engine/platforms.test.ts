import { PLAYER_FOOT_OFFSET, TILE_TOP } from "@renderer/engine/colliders";
import {
  bouncePadAt,
  PAD_MARGIN,
  PAD_TOLERANCE,
  platformBodies,
  platformBottomY,
  platformBox,
  platformTopY,
} from "@renderer/engine/platformBoxes";
import { describe, expect, it } from "vitest";
import { platform } from "./fixtures";

describe("platformBox", () => {
  it("centres the block on its tile footprint with the underside at TILE_TOP + y", () => {
    const box = platformBox(2, 3, 4, 2, 1.5, 0.4);
    expect(box.center).toEqual([4, TILE_TOP + 1.5 + 0.2, 4]);
    expect(box.half).toEqual([2, 0.2, 1]);
    expect(box.center[1] - box.half[1]).toBeCloseTo(TILE_TOP + 1.5);
  });

  it("never collapses to a zero-size collider", () => {
    const box = platformBox(0, 0, 0, 0, 0, 0);
    expect(box.half[0]).toBeGreaterThan(0);
    expect(box.half[1]).toBeGreaterThan(0);
    expect(box.half[2]).toBeGreaterThan(0);
  });

  it("puts the walkable surface a thickness above the underside", () => {
    const body = platformBodies([platform(0, 0, { y: 2, height: 0.5 })])[0];
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(platformTopY(body)).toBeCloseTo(TILE_TOP + 2.5);
    expect(platformBottomY(body)).toBeCloseTo(TILE_TOP + 2);
  });
});

describe("platformBodies", () => {
  it("reads every platform straight off the scene graph", () => {
    const bodies = platformBodies([platform(1, 1), platform(5, 5, { bounce: true, tile: "lava" })]);
    expect(bodies.map((body) => body.bounce)).toEqual([false, true]);
    expect(bodies.map((body) => body.tile)).toEqual(["stone", "lava"]);
    expect(new Set(bodies.map((body) => body.id)).size).toBe(2);
  });
});

describe("bouncePadAt", () => {
  const pads = platformBodies([
    platform(2, 2, { width: 2, depth: 2, y: 1, height: 0.4, bounce: true }),
  ]);
  const padTop = TILE_TOP + 1.4;

  it("fires when the soles rest on a pad", () => {
    expect(bouncePadAt(pads, 3, 3, padTop)).not.toBeNull();
  });

  it("ignores a pad the player is only passing by", () => {
    expect(bouncePadAt(pads, 3, 3, padTop + PAD_TOLERANCE + 0.01)).toBeNull();
    expect(bouncePadAt(pads, 3, 3, TILE_TOP + PLAYER_FOOT_OFFSET)).toBeNull();
    expect(bouncePadAt(pads, 9, 9, padTop)).toBeNull();
  });

  it("still catches a landing on the very lip", () => {
    expect(bouncePadAt(pads, 4 + PAD_MARGIN - 0.01, 3, padTop)).not.toBeNull();
    expect(bouncePadAt(pads, 4 + PAD_MARGIN + 0.05, 3, padTop)).toBeNull();
  });

  it("never fires on a platform that is not a pad", () => {
    const plain = platformBodies([platform(2, 2, { y: 1, height: 0.4 })]);
    expect(bouncePadAt(plain, 3, 3, TILE_TOP + 1.4)).toBeNull();
  });
});
