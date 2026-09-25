import type { LoreNode } from "@shared/lore";
import { activate, loreId, regionalTone } from "@shared/lore";
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
  it("weights tone by heat and stays within -1..1", () => {
    const warm = node("festival", 0, 0, { tone: 1 });
    const cold = node("grave", 1, 0, { tone: -1 });
    const tone = regionalTone(activate([warm, cold], { coord: { cx: 0, cz: 0 }, karma: [] }));
    expect(tone).toBeGreaterThan(0);
    expect(tone).toBeLessThanOrEqual(1);
    expect(regionalTone([])).toBe(0);
  });
});
