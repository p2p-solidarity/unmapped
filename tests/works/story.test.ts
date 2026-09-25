import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packCartridge, unpackCartridge } from "@main/cartridges/pack";
import { publishCartridgeInputSchema } from "@main/cartridges/schemas";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import { landProgressSchema } from "@main/instances/schemas";
import {
  continueStoryMessages,
  episodePlace,
  episodePlaces,
  episodeUnlocked,
  mergeCarry,
  nextEpisode,
  parseNextEpisode,
  parseStoryReply,
  parseStoryText,
  STORY_CAP,
  type StoryPlan,
  storyEpisodes,
  storyStep,
  storyText,
  trailPlace,
} from "@shared/story";
import { describe, expect, it } from "vitest";
import { v2CartridgeInput } from "../fixtures/v2";

const REPLY = `Here is the plan.
@@logline
一個失去記憶的郵差沿著鐵道找回每一封信。
@@episode
title: 月台的迷宮
place: 無人車站
kind: maze
brief: 在錯綜的月台間找到三封信，
找齊後出口才會打開。
@@episode
title: 澡堂的煙囪
place: 老澡堂
kind: platform climb
brief: 攀上煙囪取回被風吹走的信。
@@episode
title: 燈塔對決
place: 防波堤
kind: turn-based duel
brief: 與守燈人對決，贏了才能讀最後一封信。
@@end
trailing text`;

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("story plan", () => {
  it("parses the line protocol, keeps multi-line briefs and places gates on the map", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    expect(plan.logline).toContain("郵差");
    expect(plan.episodes.map((episode) => episode.id)).toEqual(["e1", "e2", "e3"]);
    expect(plan.episodes[0]?.brief).toContain("找齊後出口才會打開");
    const coords = plan.episodes.map((episode) => `${episode.cx},${episode.cz}`);
    expect(new Set(coords).size).toBe(coords.length);
    expect(coords).not.toContain("0,0");
    expect(unwrap(parseStoryText(storyText(plan)))).toEqual(plan);
  });

  it("rejects plans that are too short so the model is asked again", () => {
    const short = parseStoryReply(
      "@@logline\nx\n@@episode\ntitle: a\nplace: b\nkind: c\nbrief: d\n@@end",
    );
    expect(short.ok).toBe(false);
    expect(parseStoryReply("no sections at all").ok).toBe(false);
  });

  it("spreads every gate up to the cap over distinct chunks a few chunks from its neighbours", () => {
    const places = episodePlaces(STORY_CAP);
    const keys = places.map((p) => `${p.cx},${p.cz}`);
    expect(new Set(keys).size).toBe(STORY_CAP);
    expect(keys).not.toContain("0,0");
    for (const [index, place] of places.entries()) {
      expect(Math.abs(place.cx)).toBeLessThanOrEqual(64);
      expect(Math.abs(place.cz)).toBeLessThanOrEqual(64);
      const nearest = Math.min(
        ...places
          .filter((_, other) => other !== index)
          .map((other) => Math.hypot(other.cx - place.cx, other.cz - place.cz)),
      );
      expect(nearest).toBeLessThanOrEqual(4);
    }
    // Chapters added one at a time land on the same spiral…
    const grown: Array<{ cx: number; cz: number }> = [];
    for (let index = 0; index < STORY_CAP; index += 1) grown.push(episodePlace(index, grown));
    expect(grown).toEqual(places);
    // …and skip chunks an older cartridge's gates already stand in.
    const later = episodePlace(3, [places[3] ?? { cx: 0, cz: 0 }]);
    expect(`${later.cx},${later.cz}`).not.toBe(keys[3]);
  });

  it("opens episodes in order and keeps what earlier worlds handed on", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    expect(episodeUnlocked(plan.episodes, {}, "e1")).toBe(true);
    expect(episodeUnlocked(plan.episodes, {}, "e2")).toBe(false);
    const cleared = {
      e1: { draftId: null, work: null, playId: null, cleared: true, summary: "ok" },
    };
    expect(episodeUnlocked(plan.episodes, cleared, "e2")).toBe(true);
    expect(nextEpisode(plan.episodes, cleared)?.id).toBe("e2");
    // A world that returns only its own keys does not erase what came in.
    expect(mergeCarry({ coins: 3, letters: 1 }, { keys: 3 })).toEqual({
      coins: 3,
      letters: 1,
      keys: 3,
    });
    expect(mergeCarry({ coins: 3 }, null)).toEqual({ coins: 3 });
  });
});

describe("the land continues the story", () => {
  const done = (summary: string) => ({
    draftId: null,
    work: null,
    playId: null,
    cleared: true,
    summary,
  });
  const NEXT = `Sure.
@@episode
title: 渡船
place: 霧港
kind: stealth escape
brief: 趁霧躲過巡邏，
把信送上最後一班船。
@@end`;

  it("writes one more chapter after the authored ones, opened in order", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    const progress = { e1: done("letters"), e2: done("chimney"), e3: done("lighthouse") };
    expect(storyStep(plan.episodes, progress)).toEqual({ kind: "continue" });
    const messages = continueStoryMessages({
      logline: plan.logline,
      cleared: plan.episodes.map((episode) => ({ ...episode, summary: "won" })),
      carry: { letters: 3 },
      language: "zh-TW",
      core: "A quiet land.",
      style: "Short sentences.",
    });
    expect(messages[1]?.content).toContain('{"letters":3}');

    const next = unwrap(parseNextEpisode(NEXT, plan.episodes));
    expect(next.id).toBe("e4");
    expect(next.brief).toContain("最後一班船");
    expect(plan.episodes.map((e) => `${e.cx},${e.cz}`)).not.toContain(`${next.cx},${next.cz}`);

    const all = storyEpisodes(plan, [next]);
    expect(all.map((episode) => episode.id)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(episodeUnlocked(all, progress, "e4")).toBe(true);
    expect(nextEpisode(all, progress)?.id).toBe("e4");
    expect(storyStep(all, progress)).toEqual({ kind: "prepare", episode: next });

    // The chapter is save-owned: the save schema takes it like an authored episode.
    const land = {
      errands: {},
      home: { cx: 0, cz: 0, keepsakes: [] },
      door: [null, null, null, null],
    };
    expect(landProgressSchema.safeParse({ ...land, storyMore: [next] }).success).toBe(true);
    expect(
      landProgressSchema.safeParse({ ...land, storyMore: [{ ...next, cx: 999 }] }).success,
    ).toBe(false);
  });

  it("puts each chapter the land writes a short walk from the one before", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    const trail = [...plan.episodes];
    while (trail.length < STORY_CAP)
      trail.push({ ...trail[0], id: "x", ...trailPlace(trail) } as StoryPlan["episodes"][number]);
    const keys = trail.map((episode) => `${episode.cx},${episode.cz}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain("0,0");
    for (let index = plan.episodes.length; index < trail.length; index += 1) {
      const here = trail[index];
      const before = trail[index - 1];
      if (here === undefined || before === undefined) continue;
      expect(Math.hypot(here.cx - before.cx, here.cz - before.cz)).toBeLessThanOrEqual(6);
      expect(Math.abs(here.cx)).toBeLessThanOrEqual(64);
      expect(Math.abs(here.cz)).toBeLessThanOrEqual(64);
    }
  });

  it("rejects garbage so the model is asked again, and stops at the cap", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    const garbage = parseNextEpisode("I would love to help!", plan.episodes);
    expect(garbage.ok ? "ok" : garbage.error.code).toBe("story-next-invalid");
    const first = plan.episodes[0] as StoryPlan["episodes"][number];
    const full = Array.from({ length: STORY_CAP }, (_, index) => ({
      ...first,
      id: `e${index + 1}`,
    }));
    const ended = parseNextEpisode(NEXT, full);
    expect(ended.ok ? "ok" : ended.error.code).toBe("story-ended");
    const cleared = Object.fromEntries(full.map((episode) => [episode.id, done("x")]));
    expect(storyStep(full, cleared)).toEqual({ kind: "ended" });
  });
});

describe("story in a cartridge", () => {
  it("is hashed, stored, read back and survives export/import", async () => {
    const root = await mkdtemp(join(tmpdir(), "story-"));
    try {
      const story: StoryPlan = unwrap(parseStoryReply(REPLY));
      const input = {
        ...v2CartridgeInput(),
        bible: { core: "A quiet land.", style: "Language: zh-TW\nShort sentences." },
        story,
      };
      // The renderer sends this over IPC; the strict schema must let a good story through…
      expect(publishCartridgeInputSchema.safeParse(input).success).toBe(true);
      // …and reject a malformed one rather than hashing it into a cartridge.
      const tooFew = {
        ...input,
        story: { ...story, episodes: story.episodes.slice(0, 1) },
      };
      expect(publishCartridgeInputSchema.safeParse(tooFew).success).toBe(false);
      const offMap = {
        ...input,
        story: {
          ...story,
          episodes: story.episodes.map((episode) => ({ ...episode, cx: 9_999 })),
        },
      };
      expect(publishCartridgeInputSchema.safeParse(offMap).success).toBe(false);
      const published = unwrap(await publishCartridgeRevision(root, input));
      expect(published.files.some((file) => file.path === "bible/story.json")).toBe(true);
      const read = unwrap(
        await readCartridgeRevision(root, published.cartridgeId, published.version),
      );
      expect(read.story).toEqual(story);
      const packed = unwrap(packCartridge(read));
      expect(unwrap(unpackCartridge(packed)).story).toEqual(story);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
