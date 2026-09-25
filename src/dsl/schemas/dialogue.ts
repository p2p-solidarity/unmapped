// The Dialogue dialect: one NPC turn, its choices, and the optional world mutation a choice
// triggers. `Mutation` is a reserved call name inside openui-lang, so the parser sees it under
// an alias (see parse/alias.ts) — the model and the engine always use "Mutation".

import { defineComponent } from "@openuidev/lang-core";
import { BIOMES, DIALOGUE_ACTIONS } from "@shared/world";
import { z } from "zod";
import { LIMITS } from "../limits";
import { amount, hexColor, identifier, list, text } from "./common";

export const Choice = defineComponent({
  name: "Choice",
  description: `one thing the player can answer — up to ${LIMITS.maxGives} material names in gives, [] when the choice gives nothing`,
  props: z.object({
    label: text("what the player says, in the player's language"),
    action: z.enum(DIALOGUE_ACTIONS).describe("what the engine does"),
    effect: text("what changes in the world, in the player's language"),
    gives: list("material names handed to the player"),
  }),
  component: "Choice",
});

export const Mutation = defineComponent({
  name: "Mutation",
  description: `visible change to the floor when the choice is taken — omit or null each field that stays; fogDensity ${LIMITS.fogDensity.min}..${LIMITS.fogDensity.max}`,
  props: z.object({
    skyColor: hexColor("new sky colour").nullable().optional(),
    fogDensity: amount("new fog thickness").nullable().optional(),
    biome: z.enum(BIOMES).describe("new biome").nullable().optional(),
  }),
  component: "Mutation",
});

export const Dialogue = defineComponent({
  name: "Dialogue",
  description: `root — what one NPC says and the ${LIMITS.maxChoices} or fewer answers the player may give`,
  props: z.object({
    npcId: identifier("id of the speaking NPC, copied from the Scene"),
    line: text("what the NPC says, in the player's language"),
    choices: z.array(Choice.ref).describe("1..3 answers"),
    mutation: z.optional(z.nullable(Mutation.ref)),
  }),
  component: "Dialogue",
});

export const DIALOGUE_COMPONENTS = [Dialogue, Choice, Mutation] as const;

export const DIALOGUE_PROPS = {
  Dialogue: Dialogue.props,
  Choice: Choice.props,
  Mutation: Mutation.props,
} as const;
