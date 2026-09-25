import type { LoreNode } from "@shared/lore";
import { activate, loreId, regionalTone } from "@shared/lore";
import type { KarmaEntry } from "@shared/world";
import { describe, expect, it } from "vitest";

function node(slug: string, cx: number, cz: number, extra: Partial<LoreNode> = {}): LoreNode {
  return {
    id: loreId(slug, { cx, cz }),
    kind: "place",
    label: slug,
    text: "",
    coord: { cx, cz },
    links: [],
    tone: 0,
    ...extra,
  };
}

describe("lore activation", () => {
  it("heats nearby nodes first and drops the far ones", () => {
    const here = node("station", 2, 0);
    const near = node("well", 3, 0);
    const far = node("lighthouse", 20, 20);
    const hot = activate([far, near, here], { coord: { cx: 2, cz: 0 }, karma: [] });
    expect(hot.map((one) => one.node.id)).toEqual([here.id, near.id]);
  });

  it("spreads one step along links and boosts what the player just touched", () => {
    const origin = node("shrine", 9, 9);
    const custom = node("lantern_rite", 1, 0, { kind: "custom", links: [origin.id] });
    const touched = node("hana", 12, 12, { kind: "person" });
    const karma: KarmaEntry[] = [
      { at: "t", floor: 1, npcId: "hana", choice: "", action: "talk", effect: "", cx: 12, cz: 12 },
    ];
    const hot = activate([origin, custom, touched], { coord: { cx: 0, cz: 0 }, karma });
    const ids = hot.map((one) => one.node.id);
    expect(ids).toContain(origin.id);
    expect(ids).toContain(touched.id);
    expect(ids[0]).toBe(touched.id);
  });

  it("weights tone by heat and stays within -1..1", () => {
    const warm = node("festival", 0, 0, { tone: 1 });
    const cold = node("grave", 1, 0, { tone: -1 });
    const tone = regionalTone(activate([warm, cold], { coord: { cx: 0, cz: 0 }, karma: [] }));
    expect(tone).toBeGreaterThan(0);
    expect(tone).toBeLessThanOrEqual(1);
    expect(regionalTone([])).toBe(0);
  });
});
