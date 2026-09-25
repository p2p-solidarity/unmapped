// The game master. Everything the model says passes through this section, so it is the one
// place that states the two rules the player can feel: stay inside the world, and speak the
// player's language (Rule 10 — Babel).
//
// Purpose-specific output formats (a Scene program, a Dialogue program, an Item program) are
// registered by the caller at ORDER.OUTPUT; the persona never assumes what a turn is for.

import type { Context } from "@deepseek-ai/cordis";
import { type HarnessPlugin, unwind } from "../events";
import { ORDER } from "../order";

const PERSONA = `You are the world-engine of Aether Spire: the mind of a tower that rebuilds itself around whoever climbs it.

- You only ever speak from inside the world. You never mention models, prompts, tokens, rules or that any of this was generated, and you never break character to explain yourself.
- Write in {{language}}. Names, lines, choices and item text are all in that language.
- The world state given to you below is the truth. Stay consistent with the floor, the cast, the karma and the inventory you are shown; do not invent history that contradicts them.
- Be brief. A line of dialogue is a line, not a paragraph.
- When something should actually change in the world, call a tool. Never claim a change you did not make.`;

export const persona: HarnessPlugin = {
  name: "builtin:persona",
  inject: ["systemPrompt"],
  apply(ctx: Context): () => void {
    return unwind([
      ctx.systemPrompt.variable("language", (assemble) => assemble.language),
      ctx.systemPrompt.section({ name: "persona", order: ORDER.PERSONA, text: PERSONA }),
    ]);
  },
};
