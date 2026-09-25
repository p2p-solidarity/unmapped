// The Chunk dialect: what the model writes, once, when someone first walks onto a chunk of open
// land (plan.md §4–§6). The ground is not in here — terrain is deterministic and never the model's
// — only who lives there, what they built, what they say, and the lore the place adds to the graph.
//
// Prop, Wall, NPC and Choice are the very same components the Scene and Dialogue dialects use, so
// a witnessed chunk is stored as ordinary Scene and Dialogue programs.

import { defineComponent } from "@openuidev/lang-core";
import { LORE_KINDS } from "@shared/lore";
import { z } from "zod";
import { LIMITS } from "../limits";
import { amount, identifier, text } from "./common";
import { Choice } from "./dialogue";
import { Deliver, Find, Guide } from "./errand";
import { Item } from "./item";
import { NPC, Prop, Wall } from "./scene";

export const Lore = defineComponent({
  name: "Lore",
  description:
    "one thing this place adds to the world's memory — a place, person, custom, event or object; links name the ids of existing lore it grew out of",
  props: z.object({
    id: identifier("lore id"),
    kind: z.enum(LORE_KINDS).describe("what the node is"),
    label: text("short name, in the player's language"),
    text: text("one or two sentences, in the player's language"),
    links: z.array(z.string()).describe("ids of existing Lore nodes, or of Lore in this program"),
    tone: amount("-1 grief … 0 plain … 1 warmth"),
  }),
  component: "Lore",
});

export const Talk = defineComponent({
  name: "Talk",
  description: `what one resident says when approached, written now and never again — up to ${LIMITS.maxChoices} answers`,
  props: z.object({
    npcId: identifier("id of an NPC in this program"),
    line: text("what they say, in the player's language"),
    choices: z.array(Choice.ref).describe("1..3 answers"),
  }),
  component: "Talk",
});

export const Chunk = defineComponent({
  name: "Chunk",
  description: "root — one 32×32 stretch of land and the people who were there when it was seen",
  props: z.object({
    name: text("what the locals call this place, in the player's language"),
    children: z
      .array(
        z.union([
          Prop.ref,
          Wall.ref,
          NPC.ref,
          Talk.ref,
          Lore.ref,
          Find.ref,
          Deliver.ref,
          Guide.ref,
          Item.ref,
        ]),
      )
      .describe("everything written here"),
  }),
  component: "Chunk",
});

export const CHUNK_COMPONENTS = [
  Chunk,
  Prop,
  Wall,
  NPC,
  Talk,
  Choice,
  Lore,
  Find,
  Deliver,
  Guide,
  Item,
] as const;

export const CHUNK_PROPS = {
  Chunk: Chunk.props,
  Talk: Talk.props,
  Lore: Lore.props,
} as const;
