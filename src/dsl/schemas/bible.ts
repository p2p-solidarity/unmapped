// The Bible dialect: the fixed anchors of a new world (plan.md §5), written once by the model when
// the world is made. Structured so every part is bounded and the rendered core.md / style.md are
// deterministic.

import { defineComponent } from "@openuidev/lang-core";
import { z } from "zod";
import { list, text } from "./common";

export const Bible = defineComponent({
  name: "Bible",
  description: "root — the premise, rules and voice every later place in this world must follow",
  props: z.object({
    premise: text(
      "two or three sentences: what this land is and why maps stopped, in the player's language",
    ),
    tone: text("one sentence on how it feels, in the player's language"),
    rules: list("3 to 6 plain rules of how this world works, in the player's language"),
    taboos: list("2 to 5 things that never appear here, in the player's language"),
    naming: text(
      "how places and people are named here, with two examples, in the player's language",
    ),
    voice: text("how people speak: sentence length, register, habits, in the player's language"),
    look: text(
      "what this world looks like — buildings, materials, colours, era — concrete enough to draw, in the player's language",
    ),
  }),
  component: "Bible",
});

export const BIBLE_COMPONENTS = [Bible] as const;
export const BIBLE_PROPS = { Bible: Bible.props } as const;
