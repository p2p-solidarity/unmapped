import { CHAPTER_EXAMPLE, chapterPrompt, parseChapter } from "@dsl/index";
import {
  chapterKind,
  chapterLeft,
  chapterMonsterId,
  chapterTarget,
  parseChapterMonster,
  parseChapterTarget,
  settleAround,
} from "@shared/chapter";
import { describe, expect, it } from "vitest";

const ctx = { combat: true, language: "en" };

describe("chapter dialect", () => {
  it("reads the example's people, words, foes and finds", () => {
    const result = parseChapter(CHAPTER_EXAMPLE, ctx);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const chapter = result.value;
    expect(chapter.name).toBe("Tidewater Steps");
    expect(chapter.npcs.map((npc) => npc.id)).toEqual(["mako"]);
    expect(chapter.dialogues[0]?.choices).toHaveLength(2);
    expect(chapter.monsters.map((m) => m.id)).toEqual(["gull1", "gull2"]);
    expect(chapter.treasures[0]?.loot).toEqual(["lamp wick"]);
    expect(
      chapterPrompt({
        ...ctx,
        title: "t",
        place: "p",
        kind: "k",
        brief: "b",
        logline: "l",
        carry: null,
      }),
    ).toContain("Chapter(");
  });

  it("sends back monsters in a game without combat, and a chapter with nobody in it", () => {
    const peaceful = parseChapter(CHAPTER_EXAMPLE, { ...ctx, combat: false });
    expect(peaceful.ok).toBe(false);
    const empty = CHAPTER_EXAMPLE.replace("[mako, talk_mako, ", "[");
    expect(parseChapter(empty, ctx).ok).toBe(false);
  });
});

describe("chapters on the land", () => {
  it("plays climbs and mazes as places and everything else on the land", () => {
    expect(chapterKind("platform climb")).toBe("side");
    expect(chapterKind("迷宮")).toBe("dungeon");
    expect(chapterKind("choice-driven search")).toBe("land");
  });

  it("keeps ids apart from everything else on the land", () => {
    expect(parseChapterTarget(chapterTarget("e3", "mako"))).toEqual({
      episodeId: "e3",
      localId: "mako",
    });
    expect(parseChapterMonster(chapterMonsterId("e12", "gull_1"))).toEqual({
      episodeId: "e12",
      localId: "gull_1",
    });
    expect(parseChapterTarget("land:1,2:mako")).toBeNull();
  });

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

  it("is done once everyone is met, everything found and every foe defeated", () => {
    const parts = { npcs: ["mako"], treasures: ["crate"], monsters: ["gull1"] };
    expect(chapterLeft(parts, { met: [], found: [], felled: [] })).toEqual({
      talk: 1,
      find: 1,
      defeat: 1,
    });
    expect(chapterLeft(parts, { met: ["mako"], found: ["crate"], felled: ["gull1"] })).toEqual({
      talk: 0,
      find: 0,
      defeat: 0,
    });
  });
});
