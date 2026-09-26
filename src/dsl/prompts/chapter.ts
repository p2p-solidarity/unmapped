// A story chapter played on the land (see @shared/chapter): the model writes the people, finds and
// foes of the chapter and what each person says; the host sets them around the gate and clears
// the chapter once every person is spoken to, every treasure opened and every monster defeated.

import { chapterLibrary } from "../libraries";
import { clampText, LIMITS } from "../limits";
import { CHAPTER_PARTS } from "../parse/chapter";
import { WITNESS_ACTIONS } from "../parse/chunk";
import { languageName } from "./shared";

/** Syntax demonstration only (Rule 2): parsed by the DSL tests, never rendered or saved. */
export const CHAPTER_EXAMPLE = `root = Chapter("Tidewater Steps", "Take the lamp wick back from the gulls' rock and tell Mako it is safe.", [mako, talk_mako, gull1, gull2, crate])
mako = NPC("mako", "Mako", "farmer", "wary", "#6f8fa8")
talk_mako = Talk("mako", "The gulls took the wick again. Their rock is past the steps, if you can stand the noise.", [c1, c2])
c1 = Choice("I will get it back", "talk", "Mako hands you a length of rope.", ["rope"])
c2 = Choice("Not now", "leave", "Mako goes back to mending nets.", [])
gull1 = Monster("gull1", "wisp", 2, "a thrown fish")
gull2 = Monster("gull2", "wisp", 3, "a thrown fish")
crate = Treasure("crate", ["lamp wick"])`;

export interface ChapterPromptContext {
  title: string;
  place: string;
  kind: string;
  brief: string;
  logline: string;
  /** What earlier chapters handed on, as short text; null when nothing yet. */
  carry: string | null;
  combat: boolean;
  language: string;
}

/**
 * The names already in use near a chapter's gate and in the story, nearest first, so its people
 * get names of their own (at New game chapter 1 and the origin, written at once, both had a Sumi).
 * A person who takes one anyway is sent back by the parser's hygiene check.
 */
export function chapterNamesSection(names: readonly string[]): string {
  if (names.length === 0) return "";
  return [
    "## Names already in use",
    `People nearby or in the story: ${names.map((name) => clampText(name, 40)).join(", ")}.`,
    "Every person of this chapter gets a name of their own, never one of these.",
  ].join("\n");
}

export function chapterPrompt(ctx: ChapterPromptContext): string {
  const { npcs, treasures, monsters } = CHAPTER_PARTS;
  return chapterLibrary.prompt({
    preamble: [
      "You write one chapter of an open-world RPG's story, played right on the land. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.",
      `## This chapter\n"${clampText(ctx.title, 80)}" at ${clampText(ctx.place, 80)} (${clampText(ctx.kind, 40)})\n${clampText(ctx.brief, 600)}`,
      `## Story so far\n${clampText(ctx.logline, 300)}`,
      ctx.carry === null ? null : `## The player carries\n${clampText(ctx.carry, 400)}`,
    ]
      .filter((part) => part !== null)
      .join("\n\n"),
    additionalRules: [
      `Write every word the player reads — the place, the goal, names, lines, answers, loot, weaknesses — in ${languageName(ctx.language)}. Ids stay ascii snake_case and unique.`,
      "The player finishes this chapter by talking to every NPC, opening every Treasure and defeating every Monster in it. Write the goal and the lines so that doing exactly that plays out the chapter.",
      `${npcs.min} to ${npcs.max} NPCs who belong to this chapter, each with exactly one Talk: what they say when approached, with 1 to ${LIMITS.maxChoices} answers. A Choice action is one of ${WITNESS_ACTIONS.join(", ")}; gives is [] or one small thing.`,
      `${treasures.min} to ${treasures.max} Treasures holding what the chapter is about: the thing sought, a clue, what is earned.`,
      ctx.combat
        ? `${monsters.min} to ${monsters.max} Monsters that stand in the way, levels 1 to 8, each with a weakness.`
        : "No Monster: this game declares no combat.",
      "The host decides where everyone and everything stands: write no coordinates.",
      "Everyday, concrete details. No assistant voice, no vague mystery words.",
      "The example below shows syntax only. Never reuse its words, names or places.",
      "Answer with the program only: first line root = Chapter(...), every other statement referenced from it exactly once.",
    ],
    examples: [CHAPTER_EXAMPLE],
  });
}
