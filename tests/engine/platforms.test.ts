import { PLAYER_FOOT_OFFSET, TILE_TOP } from "@renderer/engine/colliders";
import {
  allPlatformBodies,
  bakedPlatformBodies,
  bouncePadAt,
  DRAFT_OPACITY,
  draftPlatformBodies,
  PAD_MARGIN,
  PAD_TOLERANCE,
  platformBottomY,
  platformBox,
  platformTopY,
} from "@renderer/engine/platformBoxes";
import type { Platform } from "@renderer/state";
import { describe, expect, it } from "vitest";
import { platform } from "./fixtures";

function draft(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "draft-1",
    name: "Draft",
    x: 2,
    z: 3,
    y: 1.5,
    width: 3,
    depth: 2,
    height: 0.4,
    tile: "stone",
    isBounce: false,
    ...overrides,
  };
}

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
    const body = bakedPlatformBodies([platform(0, 0, { y: 2, height: 0.5 })])[0];
    expect(body).toBeDefined();
    if (body === undefined) return;
    expect(platformTopY(body)).toBeCloseTo(TILE_TOP + 2.5);
    expect(platformBottomY(body)).toBeCloseTo(TILE_TOP + 2);
  });
});

describe("baked vs draft", () => {
  it("reads baked platforms straight off the scene graph", () => {
    const bodies = bakedPlatformBodies([
      platform(1, 1),
      platform(5, 5, { bounce: true, tile: "lava" }),
    ]);
    expect(bodies.map((b) => b.draft)).toEqual([false, false]);
    expect(bodies.map((b) => b.bounce)).toEqual([false, true]);
    expect(bodies.map((b) => b.name)).toEqual([null, null]);
    expect(new Set(bodies.map((b) => b.id)).size).toBe(2);
  });

  it("keeps the editor's own id and name on a draft so selection can match it", () => {
    const bodies = draftPlatformBodies([draft(), draft({ id: "draft-2", isBounce: true })]);
    expect(bodies.map((b) => b.id)).toEqual(["draft-1", "draft-2"]);
    expect(bodies.map((b) => b.draft)).toEqual([true, true]);
    expect(bodies.map((b) => b.bounce)).toEqual([false, true]);
    expect(bodies[0]?.name).toBe("Draft");
  });

  it("places a draft exactly where the same numbers would bake it", () => {
    const d = draft();
    const drafted = draftPlatformBodies([d])[0];
    const baked = bakedPlatformBodies([
      platform(d.x, d.z, {
        width: d.width,
        depth: d.depth,
        y: d.y,
        height: d.height,
        tile: d.tile,
      }),
    ])[0];
    expect(drafted?.box).toEqual(baked?.box);
  });

  it("lists baked blocks before drafts so the preview always draws on top", () => {
    const bodies = allPlatformBodies([platform(0, 0)], [draft()]);
    expect(bodies.map((b) => b.draft)).toEqual([false, true]);
  });

  it("drops an untouched draft that still matches its baked original", () => {
    const spec = platform(3, 4, { width: 2, depth: 2, y: 1, height: 0.4 });
    const mirrored = draft({
      x: spec.x,
      z: spec.z,
      width: spec.width,
      depth: spec.depth,
      y: spec.y,
      height: spec.height,
      tile: spec.tile,
    });
    expect(allPlatformBodies([spec], [mirrored])).toHaveLength(1);
    // Nudge it and both appear: the block the world still holds, and the unsaved edit.
    const moved = allPlatformBodies([spec], [{ ...mirrored, y: spec.y + 0.5 }]);
    expect(moved.map((b) => b.draft)).toEqual([false, true]);
  });

  it("keeps drafts see-through", () => {
    expect(DRAFT_OPACITY).toBeGreaterThan(0);
    expect(DRAFT_OPACITY).toBeLessThan(1);
  });
});

describe("bouncePadAt", () => {
  const pads = allPlatformBodies(
    [platform(2, 2, { width: 2, depth: 2, y: 1, height: 0.4, bounce: true })],
    [draft({ id: "pad", x: 6, z: 6, width: 2, depth: 2, y: 0, height: 0.4, isBounce: true })],
  );
  const bakedTop = TILE_TOP + 1.4;
  const draftTop = TILE_TOP + 0.4;

  it("fires when the soles rest on a baked pad", () => {
    expect(bouncePadAt(pads, 3, 3, bakedTop)?.draft).toBe(false);
  });

  it("fires on an unsaved draft pad too, so it can be test-jumped", () => {
    expect(bouncePadAt(pads, 7, 7, draftTop)?.id).toBe("pad");
  });

  it("ignores a pad the player is only passing by", () => {
    expect(bouncePadAt(pads, 3, 3, bakedTop + PAD_TOLERANCE + 0.01)).toBeNull();
    expect(bouncePadAt(pads, 3, 3, TILE_TOP + PLAYER_FOOT_OFFSET)).toBeNull();
    expect(bouncePadAt(pads, 9, 9, draftTop)).toBeNull();
  });

  it("still catches a landing on the very lip", () => {
    expect(bouncePadAt(pads, 4 + PAD_MARGIN - 0.01, 3, bakedTop)).not.toBeNull();
    expect(bouncePadAt(pads, 4 + PAD_MARGIN + 0.05, 3, bakedTop)).toBeNull();
  });

  it("never fires on a platform that is not a pad", () => {
    const plain = allPlatformBodies([platform(2, 2, { y: 1, height: 0.4 })], []);
    expect(bouncePadAt(plain, 3, 3, TILE_TOP + 1.4)).toBeNull();
  });
});
