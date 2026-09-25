// The Chapter dialect: one chapter of a world's story, played on the open land around its gate.
// The model writes who is there with what they say, what can be found and what stands in the way;
// the host sets every one of them on walkable ground near the gate and decides when it is done.
// So its NPC, Monster and Treasure carry no coordinates and no optional look: a figure on the land
// is drawn by its role or kind, and every argument the model need not write is one it cannot get
// wrong. Talk and Choice are the Chunk dialect's.

import { defineComponent } from "@openuidev/lang-core";
import { MONSTER_KINDS, MOODS, NPC_ROLES } from "@shared/world";
import { z } from "zod";
import { LIMITS } from "../limits";
import { Talk } from "./chunk";
import { hexColor, identifier, list, text } from "./common";
import { Choice } from "./dialogue";

export const ChapterNpc = defineComponent({
  name: "NPC",
  description: "someone of this chapter the player talks to; the host decides where they stand",
  props: z.object({
    id: identifier("npc id"),
    name: text("display name, in the player's language"),
    role: z.enum(NPC_ROLES).describe("what they do"),
    mood: z.enum(MOODS).describe("how they speak"),
    color: hexColor("clothing colour"),
  }),
  component: "NPC",
});

export const ChapterMonster = defineComponent({
  name: "Monster",
  description: `a foe of this chapter, level ${LIMITS.level.min}..${LIMITS.level.max}; the host decides where it stands`,
  props: z.object({
    id: identifier("monster id"),
    kind: z.enum(MONSTER_KINDS).describe("creature family"),
    level: z.int().describe("difficulty"),
    weakness: text("what defeats it, in the player's language"),
  }),
  component: "Monster",
});

export const ChapterTreasure = defineComponent({
  name: "Treasure",
  description: `something to find, up to ${LIMITS.maxLoot} things inside; the host decides where it lies`,
  props: z.object({
    id: identifier("treasure id"),
    loot: list("what is inside, in the player's language"),
  }),
  component: "Treasure",
});

export const Chapter = defineComponent({
  name: "Chapter",
  description: "root — one chapter of the story, played on the land around its gate",
  props: z.object({
    name: text("what the locals call the place, in the player's language"),
    goal: text("one sentence: what the player does here, in the player's language"),
    children: z
      .array(z.union([ChapterNpc.ref, Talk.ref, ChapterMonster.ref, ChapterTreasure.ref]))
      .describe("who and what is here"),
  }),
  component: "Chapter",
});

export const CHAPTER_COMPONENTS = [
  Chapter,
  ChapterNpc,
  Talk,
  Choice,
  ChapterMonster,
  ChapterTreasure,
] as const;

export const CHAPTER_PROPS = {
  Chapter: Chapter.props,
  NPC: ChapterNpc.props,
  Monster: ChapterMonster.props,
  Treasure: ChapterTreasure.props,
} as const;
