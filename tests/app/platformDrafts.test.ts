import {
  draftsFromSpecs,
  makeDraft,
  normalizeDraft,
  PLATFORM_RANGES,
  type Platform,
  toPlatformSpec,
} from "@renderer/state/platformDrafts";
import type { PlatformSpec } from "@shared/world";
import { describe, expect, it } from "vitest";

function draft(overrides: Partial<Platform> = {}): Platform {
  return {
    id: "d1",
    name: "Platform 1",
    x: 4,
    y: 1.5,
    z: 6,
    width: 3,
    depth: 2,
    height: 0.4,
    tile: "stone",
    isBounce: false,
    ...overrides,
  };
}

describe("toPlatformSpec", () => {
  it("maps a draft onto the DSL spec and drops the editor-only fields", () => {
    const spec = toPlatformSpec(draft({ tile: "wood", isBounce: true }));
    expect(spec).toEqual({
      x: 4,
      z: 6,
      width: 3,
      depth: 2,
      y: 1.5,
      height: 0.4,
      tile: "wood",
      bounce: true,
    });
    expect(Object.keys(spec)).not.toContain("id");
    expect(Object.keys(spec)).not.toContain("name");
    expect(Object.keys(spec)).not.toContain("isBounce");
  });

  it("clamps a hallucinated platform into the engine's ranges", () => {
    const spec = toPlatformSpec(
      draft({ x: 9000, z: -40, width: 999, depth: 0, y: 100, height: 50 }),
    );
    expect(spec.x).toBe(PLATFORM_RANGES.x.max);
    expect(spec.z).toBe(PLATFORM_RANGES.z.min);
    expect(spec.width).toBe(PLATFORM_RANGES.width.max);
    expect(spec.depth).toBe(PLATFORM_RANGES.depth.min);
    expect(spec.y).toBe(PLATFORM_RANGES.y.max);
    expect(spec.height).toBe(PLATFORM_RANGES.height.max);
  });

  it("collapses non-finite numbers to the range minimum instead of writing NaN", () => {
    const spec = toPlatformSpec(draft({ x: Number.NaN, y: Number.POSITIVE_INFINITY }));
    expect(spec.x).toBe(PLATFORM_RANGES.x.min);
    expect(spec.y).toBe(PLATFORM_RANGES.y.min);
    expect(Number.isNaN(spec.x)).toBe(false);
  });

  it("rounds tile coordinates and extents to integers", () => {
    const spec = toPlatformSpec(draft({ x: 4.6, z: 2.2, width: 3.7, depth: 1.4 }));
    expect(spec).toMatchObject({ x: 5, z: 2, width: 4, depth: 1 });
  });

  it("treats a missing bounce flag as false", () => {
    expect(toPlatformSpec(draft()).bounce).toBe(false);
  });
});

describe("draftsFromSpecs", () => {
  const specs: PlatformSpec[] = [
    { x: 2, z: 3, width: 4, depth: 4, y: 1, height: 0.4, tile: "stone", bounce: false },
    { x: 8, z: 9, width: 2, depth: 2, y: 3, height: 0.5, tile: "lava", bounce: true },
  ];

  it("names and numbers the drafts it generates", () => {
    const drafts = draftsFromSpecs(specs);
    expect(drafts.map((entry) => entry.name)).toEqual(["Platform 1", "Platform 2"]);
    expect(new Set(drafts.map((entry) => entry.id)).size).toBe(2);
  });

  it("round-trips through toPlatformSpec", () => {
    expect(draftsFromSpecs(specs).map(toPlatformSpec)).toEqual(specs);
  });

  it("produces nothing for a floor with no platforms", () => {
    expect(draftsFromSpecs([])).toEqual([]);
  });
});

describe("makeDraft / normalizeDraft", () => {
  it("numbers a custom draft after the ones already on screen", () => {
    expect(makeDraft(undefined, 2).name).toBe("Platform 3");
  });

  it("keeps a preset's own name and shape", () => {
    const made = makeDraft({ name: "Sky Bridge", width: 6, depth: 2, tile: "wood" }, 0);
    expect(made).toMatchObject({ name: "Sky Bridge", width: 6, depth: 2, tile: "wood" });
  });

  it("clamps while editing, so the preview matches what will be baked", () => {
    const normalized = normalizeDraft(draft({ y: -3, height: 99 }));
    expect(normalized.y).toBe(PLATFORM_RANGES.y.min);
    expect(normalized.height).toBe(PLATFORM_RANGES.height.max);
    expect(normalized.id).toBe("d1");
  });
});
