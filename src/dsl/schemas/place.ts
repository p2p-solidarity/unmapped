// The Place dialect: what lives in a side-scrolling course or a grid dungeon (@shared/places). It
// is the Scene dialect's life and atmosphere — no Exit, Wall, Platform, Patch or Trigger, because
// the host builds the ground and the ways out — plus one Talk per resident, the Chunk dialect's,
// so everyone in a place already has their words when the player walks in (plan.md §1.4).

import { defineComponent } from "@openuidev/lang-core";
import { BIOMES } from "@shared/world";
import { z } from "zod";
import { Talk } from "./chunk";
import { text } from "./common";
import { Choice } from "./dialogue";
import { Floor, Light, Monster, NPC, Prop, Quest, Sky, Treasure } from "./scene";

export const Place = defineComponent({
  name: "Place",
  description: "root — one course or dungeon on the land and everything living in it",
  props: z.object({
    name: text("what the place is called, in the player's language"),
    biome: z.enum(BIOMES).describe("palette and mood of the place"),
    children: z
      .array(
        z.union([
          Floor.ref,
          Prop.ref,
          NPC.ref,
          Talk.ref,
          Monster.ref,
          Treasure.ref,
          Light.ref,
          Sky.ref,
          Quest.ref,
        ]),
      )
      .describe("everything in this place"),
  }),
  component: "Place",
});

export const PLACE_COMPONENTS = [
  Place,
  Floor,
  Prop,
  NPC,
  Talk,
  Choice,
  Monster,
  Treasure,
  Light,
  Sky,
  Quest,
] as const;
