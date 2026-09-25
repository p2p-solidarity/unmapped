import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packCartridge, unpackCartridge } from "@main/cartridges/pack";
import { publishCartridgeInputSchema } from "@main/cartridges/schemas";
import { publishCartridgeRevision, readCartridgeRevision } from "@main/cartridges/store";
import {
  episodePlace,
  episodeUnlocked,
  mergeCarry,
  nextEpisode,
  parseStoryReply,
  parseStoryText,
  type StoryPlan,
  storyText,
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

  it("spreads the first eight gates over distinct chunks, further out as the story goes on", () => {
    const places = Array.from({ length: 8 }, (_, index) => episodePlace(index));
    expect(new Set(places.map((p) => `${p.cx},${p.cz}`)).size).toBe(8);
    const distance = (index: number) => Math.hypot(places[index]?.cx ?? 0, places[index]?.cz ?? 0);
    expect(distance(7)).toBeGreaterThan(distance(0));
  });

  it("opens episodes in order and keeps what earlier worlds handed on", () => {
    const plan = unwrap(parseStoryReply(REPLY));
    expect(episodeUnlocked(plan, {}, "e1")).toBe(true);
    expect(episodeUnlocked(plan, {}, "e2")).toBe(false);
    const cleared = {
      e1: { draftId: null, work: null, playId: null, cleared: true, summary: "ok" },
    };
    expect(episodeUnlocked(plan, cleared, "e2")).toBe(true);
    expect(nextEpisode(plan, cleared)?.id).toBe("e2");
    // A world that returns only its own keys does not erase what came in.
    expect(mergeCarry({ coins: 3, letters: 1 }, { keys: 3 })).toEqual({
      coins: 3,
      letters: 1,
      keys: 3,
    });
    expect(mergeCarry({ coins: 3 }, null)).toEqual({ coins: 3 });
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
      // The renderer sends this over IPC; the strict schema must let the story through.
      expect(publishCartridgeInputSchema.safeParse(input).success).toBe(true);
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
