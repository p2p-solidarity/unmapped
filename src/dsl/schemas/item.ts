// The Item dialect: one artefact forged at the wish altar.

import { defineComponent } from "@openuidev/lang-core";
import { ITEM_KINDS } from "@shared/world";
import { z } from "zod";
import { LIMITS } from "../limits";
import { amount, identifier, list, text } from "./common";

export const Item = defineComponent({
  name: "Item",
  description: `root — power ${LIMITS.power.min}..${LIMITS.power.max} scales with the rarity of the materials; write null for curse when the wish is honest`,
  props: z.object({
    id: identifier("item id"),
    name: text("display name, in the player's language"),
    kind: z.enum(ITEM_KINDS).describe("what the item is"),
    power: amount("relative strength"),
    perk: text("what it does well, in the player's language"),
    curse: text("the price the wish exacts, or null").nullable().default(null),
    meshDna: list("part names from the mesh vocabulary, ascii"),
    archetype: list('semantic core in ascii english, e.g. ["water", "restoration"]'),
    flavor: text("one sentence of lore, in the player's language"),
  }),
  component: "Item",
});

export const ITEM_COMPONENTS = [Item] as const;

export const ITEM_PROPS = { Item: Item.props } as const;
