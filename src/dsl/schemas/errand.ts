// Errands: the small, deterministic asks a witnessed resident may have (plan.md §3.3). One
// component per template so each signature says exactly what that template needs; the keepsake is
// an ordinary `Item`.

import { defineComponent } from "@openuidev/lang-core";
import { z } from "zod";
import { identifier, text, tile } from "./common";
import { Item } from "./item";

const ask = text("what the resident asks, one sentence, in the player's language");
const thanks = text("what they say when it is done, in the player's language");
const reward = identifier("id of the Item they hand over");

export const Find = defineComponent({
  name: "Find",
  description: "find something they lost at a tile of this chunk",
  props: z.object({
    id: identifier("errand id"),
    giver: identifier("id of the NPC who asks"),
    ask,
    x: tile("tile on the x axis where it lies"),
    z: tile("tile on the z axis where it lies"),
    reward,
    thanks,
  }),
  component: "Find",
});

export const Deliver = defineComponent({
  name: "Deliver",
  description: "take something to another place the world already remembers",
  props: z.object({
    id: identifier("errand id"),
    giver: identifier("id of the NPC who asks"),
    ask,
    place: z.string().describe('id of a known "place" Lore on another chunk'),
    reward,
    thanks,
  }),
  component: "Deliver",
});

export const Guide = defineComponent({
  name: "Guide",
  description:
    "go to another known place for them — to see it, to find the way, to bring back word",
  props: z.object({
    id: identifier("errand id"),
    giver: identifier("id of the NPC who asks"),
    ask,
    place: z.string().describe('id of a known "place" Lore on another chunk'),
    reward,
    thanks,
  }),
  component: "Guide",
});

export const Errands = defineComponent({
  name: "Errands",
  description: "root — the errands of one witnessed chunk and their keepsakes",
  props: z.object({
    children: z.array(z.union([Find.ref, Deliver.ref, Guide.ref, Item.ref])).describe("errands"),
  }),
  component: "Errands",
});

export const ERRAND_PROPS = {
  Find: Find.props,
  Deliver: Deliver.props,
  Guide: Guide.props,
} as const;
