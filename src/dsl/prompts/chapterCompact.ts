// The chapter prompt for a route whose whole context is small (Apple's on-device model holds 4096
// tokens, prompt and answer together). Big models keep ./chapter.ts. Here the Chapter spec and its
// example give way to the answer's schema (../chapterAnswer.ts), which carries the roles, moods,
// actions, foes and counts the spec says in words; what is left is what the schema cannot say:
// this chapter, the story so far, what the player carries, and how a chapter plays out. The world
// is told by the bible's short lines (./chunkCompact.ts) and the compact lore around the gate.
//
// Like the compact witness, nothing here lists forbidden things: on Apple's model a prompt that
// did was refused by its input guardrail, and the schema has no slot for what it would forbid.

import { clampText } from "../limits";
import type { ChapterPromptContext } from "./chapter";
import { languageName } from "./shared";

export function compactChapterPrompt(ctx: ChapterPromptContext): string {
  const lang = languageName(ctx.language);
  const does = ctx.combat
    ? "talking to every person, opening every find and defeating every foe"
    : "talking to every person and opening every find";
  return [
    "## Chapter",
    `You write one chapter of this world's story, played on the land around its gate. Answer with the place, the goal, who is there and what each of them says, and what can be found${ctx.combat ? ", and what stands in the way" : ""}.`,
    `- Every word the player reads, names too, is in ${lang}.`,
    `- The player finishes the chapter by ${does}. Write the goal and the lines so that doing exactly that plays out the chapter.`,
    "- The place's name is what the locals call it: a word or two, never a coordinate or an id.",
    "- Each person says one line when the player walks up; each answer is what the player says back.",
    "- A find holds what the chapter is about: the thing sought, a clue, or what is earned.",
    "- Talk like neighbours: everyday, concrete, quiet details. People may misremember and disagree.",
    "",
    `## This chapter\n"${clampText(ctx.title, 80)}" at ${clampText(ctx.place, 80)} (${clampText(ctx.kind, 40)})\n${clampText(ctx.brief, 480)}`,
    "",
    `## Story so far\n${clampText(ctx.logline, 240)}`,
    ...(ctx.carry === null ? [] : ["", `## The player carries\n${clampText(ctx.carry, 200)}`]),
  ].join("\n");
}
