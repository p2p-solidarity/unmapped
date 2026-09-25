import { CHUNK_SIZE } from "@shared/chunks";
import {
  anchorSlot,
  CONTINENT_SPACING,
  ownerOf,
  pickAnchor,
  resolveAnchors,
  shiftChunk,
  territoryMap,
} from "@shared/continent";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";

const origin = { floor: { width: 12, depth: 12, tile: "grass" } } as unknown as SceneGraph;

describe("continent anchors", () => {
  it("spirals out from (0, 0), one spacing apart, with no repeats", () => {
    expect(anchorSlot(0)).toEqual({ cx: 0, cz: 0 });
    expect(anchorSlot(1)).toEqual({ cx: CONTINENT_SPACING, cz: 0 });
    const seen = new Set<string>();
    for (let index = 0; index < 25; index += 1) {
      const slot = anchorSlot(index);
      seen.add(`${slot.cx},${slot.cz}`);
    }
    expect(seen.size).toBe(25);
  });

  it("picks the first free slot", () => {
    expect(pickAnchor([])).toEqual({ cx: 0, cz: 0 });
    expect(pickAnchor([{ cx: 0, cz: 0 }])).toEqual(anchorSlot(1));
  });

  it("settles a clash the same way on every peer: the earlier claim keeps the slot", () => {
    const claims = [
      { worldId: "late", anchor: { cx: 0, cz: 0 }, joinedAt: 20 },
      { worldId: "early", anchor: { cx: 0, cz: 0 }, joinedAt: 10 },
    ];
    const one = resolveAnchors(claims);
    const other = resolveAnchors([...claims].reverse());
    expect(one).toEqual(other);
    expect(one.find((c) => c.worldId === "early")?.anchor).toEqual({ cx: 0, cz: 0 });
    expect(one.find((c) => c.worldId === "late")?.anchor).toEqual(anchorSlot(1));
  });
});

describe("territory", () => {
  const anchors = resolveAnchors([
    { worldId: "a", anchor: { cx: 0, cz: 0 }, joinedAt: 1 },
    { worldId: "b", anchor: { cx: 6, cz: 0 }, joinedAt: 2 },
  ]);

  it("gives each continent chunk to the nearest anchor", () => {
    expect(ownerOf(anchors, { cx: 2, cz: 0 })).toBe("a");
    expect(ownerOf(anchors, { cx: 4, cz: 5 })).toBe("b");
    // Halfway belongs to whoever claimed first.
    expect(ownerOf(anchors, { cx: 3, cz: 0 })).toBe("a");
  });

  it("maps another world's chunks into the viewer's coordinates and back", () => {
    const fromB = shiftChunk({ cx: 0, cz: 0 }, { cx: 6, cz: 0 }, { cx: 0, cz: 0 });
    expect(fromB).toEqual({ cx: 6, cz: 0 });
    const viewA = territoryMap("a", anchors, [{ worldId: "b", seed: 42, origin }]);
    expect(viewA.at({ cx: 1, cz: 0 })).toBeNull();
    const there = viewA.at({ cx: 6, cz: 0 });
    expect(there?.worldId).toBe("b");
    expect(there?.seed).toBe(42);
    // A's tile (6·32, 0) is B's own (0, 0).
    expect((there?.dx ?? 0) + 6 * CHUNK_SIZE).toBe(0);

    const viewB = territoryMap("b", anchors, [{ worldId: "a", seed: 7, origin }]);
    expect(viewB.at({ cx: 0, cz: 0 })).toBeNull();
    expect(viewB.at({ cx: -6, cz: 0 })?.worldId).toBe("a");
    expect(viewB.at({ cx: -6, cz: 0 })?.dx).toBe(6 * CHUNK_SIZE);
  });

  it("keeps a chunk the viewer's own until the other world's ground has arrived", () => {
    const view = territoryMap("a", anchors, []);
    expect(view.at({ cx: 6, cz: 0 })).toBeNull();
  });
});
