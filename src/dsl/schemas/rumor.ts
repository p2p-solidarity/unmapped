// The Rumors dialect (rev 6 phase 3, D14): the beat picks which facts are retold and who tells
// them; a member's model writes how, as one program for the whole batch. One `Rumor` per slot the
// beat opened, at most — a slot left out stays silent, never filled in by the host.

import { createLibrary, defineComponent, type Library } from "@openuidev/lang-core";
import { z } from "zod";
import { amount, text } from "./common";

export const Rumor = defineComponent({
  name: "Rumor",
  description: "what one resident passes on about one fact: the fact's slot number and one line",
  props: z.object({
    slot: amount("the slot number of the fact, exactly as listed"),
    text: text("one line of talk in the world's language, naming the fact's name exactly"),
  }),
  component: "Rumor",
});

export const Rumors = defineComponent({
  name: "Rumors",
  description: "root — this beat's rumors, at most one per listed slot",
  props: z.object({
    children: z.array(Rumor.ref).describe("rumors"),
  }),
  component: "Rumors",
});

export const RUMOR_COMPONENTS = [Rumors, Rumor] as const;

export const RUMOR_PROPS = { Rumor: Rumor.props } as const;

export const rumorLibrary: Library = createLibrary({
  id: "unwritten-land/rumors",
  root: "Rumors",
  components: [...RUMOR_COMPONENTS],
});
