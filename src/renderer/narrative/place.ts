// Writing a place (地點): the model writes what lives in a course or a dungeon, and what each of
// its residents says, against the world bible; the host builds the ground around it. Parse → issues
// → repair ≤ 2 rounds (Rule 7), a content refusal of the event it becomes counting as one (D5); a
// place that never parses is an error, never a stand-in. A chapter's place (a climb or a maze) is
// given the names already in use, as a land chapter is (./chapter.ts): its residents take none of
// them, checked against the names as they stand at each check.

import { bibleSections, chapterNamesSection, type PlaceDraft, parsePlace } from "@dsl";
import { dslError } from "@dsl/parse/program";
import { type PlacePromptContext, placeIssues, placePrompt } from "@dsl/prompts/place";
import { ORDER } from "@harness";
import type { WorldBible } from "@shared/cartridge";
import type { Result } from "@shared/result";
import { generateProgram, type Program } from "./pipeline";
import { answerRoute, NAMES_SHOWN, namesChecked } from "./route";

export const PLACE_MAX_TOKENS = 2400;

export function generatePlace(
  ctx: PlacePromptContext & {
    bible: WorldBible | null;
    /** A chapter's place: names already in use near its gate and in the story, nearest first. */
    names?: readonly string[];
    /** The same names as they stand at each check. */
    namesNow?: () => readonly string[];
    signal?: AbortSignal;
    /** Keeps a parsed place (its `place` or `chapter` event); a content refusal is repaired (D5). */
    accept?: (program: { source: string; graph: PlaceDraft }) => Promise<Result<unknown>>;
  },
): Promise<Result<Program<PlaceDraft>>> {
  const bible = ctx.bible === null ? null : bibleSections(ctx.bible);
  const route = answerRoute();
  const names = (ctx.names ?? []).slice(0, NAMES_SHOWN[route]);
  return generateProgram<PlaceDraft>({
    system: placePrompt(ctx),
    user: "Write the Place program for this place now. Output the program only.",
    purpose: "scene",
    task: "place",
    language: ctx.language,
    parse: (source) => {
      const checked = namesChecked(names, ctx.namesNow, route);
      const parsed = parsePlace(source, { language: ctx.language, names: checked });
      if (!parsed.ok) return parsed;
      const issues = placeIssues(parsed.value.graph, ctx);
      return issues.length === 0
        ? parsed
        : {
            ok: false,
            error: dslError({
              code: "place-invalid",
              message: `${issues.length} thing(s) about this place need changing.`,
              hint: "Fix exactly the listed points and resend the whole program.",
              errors: issues,
            }),
          };
    },
    sections: [
      ...(bible === null
        ? []
        : [
            { name: "place:bible-core", order: ORDER.WORLD_RULES, text: bible.core },
            { name: "place:bible-style", order: ORDER.WORLD_RULES + 1, text: bible.style },
          ]),
      { name: "place:names", order: ORDER.CONTEXT + 14, text: chapterNamesSection(names) },
    ],
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    ...(ctx.accept === undefined ? {} : { accept: ctx.accept }),
    maxTokens: PLACE_MAX_TOKENS,
    temperature: 0.9,
  });
}
