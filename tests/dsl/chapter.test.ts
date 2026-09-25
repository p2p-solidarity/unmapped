import { CHAPTER_EXAMPLE, parseChapter } from "@dsl/index";
import { settleAround } from "@shared/chapter";
import { describe, expect, it } from "vitest";

const ctx = { combat: true, language: "en" };

describe("chapter dialect", () => {
  it("sends back monsters in a game without combat, and a chapter with nobody in it", () => {
    const peaceful = parseChapter(CHAPTER_EXAMPLE, { ...ctx, combat: false });
    expect(peaceful.ok).toBe(false);
    const empty = CHAPTER_EXAMPLE.replace("[mako, talk_mako, ", "[");
    expect(parseChapter(empty, ctx).ok).toBe(false);
  });
});

describe("chapters on the land", () => {
  it("sets everyone on free ground around the gate, never on it or on each other", () => {
    const water = (x: number) => x < 0;
    const spots = settleAround([0, 0], { npcs: 2, treasures: 1, monsters: 3 }, 7, (x) => !water(x));
    const all = [...spots.npcs, ...spots.treasures, ...spots.monsters];
    expect(all.every((spot) => spot !== null && spot[0] >= 0)).toBe(true);
    const keys = all.map((spot) => `${spot?.[0]},${spot?.[1]}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("0,0");
    expect(
      settleAround([0, 0], { npcs: 2, treasures: 1, monsters: 3 }, 7, (x) => !water(x)),
    ).toEqual(spots);
  });
});
