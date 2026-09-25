// Writing a place (地點): the model writes what lives in a course or a dungeon, against the world
// bible, and the host builds the ground around it. Parse → issues → repair ≤ 2 rounds (Rule 7); a
// place that never parses is an error, never a stand-in.

import { bibleSections, parseScene } from "@dsl";
import { dslError } from "@dsl/parse/program";
import { type PlacePromptContext, placeIssues, placePrompt } from "@dsl/prompts/place";
import { ORDER } from "@harness";
import type { WorldBible } from "@shared/cartridge";
import type { Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { generateProgram, type Program } from "./pipeline";

export const PLACE_MAX_TOKENS = 2400;

export function generatePlace(
  ctx: PlacePromptContext & { bible: WorldBible | null },
): Promise<Result<Program<SceneGraph>>> {
  const bible = ctx.bible === null ? null : bibleSections(ctx.bible);
  return generateProgram<SceneGraph>({
    system: placePrompt(ctx),
    user: "Write the Scene program for this place now. Output the program only.",
    purpose: "scene",
    language: ctx.language,
    parse: (source) => {
      const parsed = parseScene(source);
      if (!parsed.ok) return parsed;
      const issues = placeIssues(parsed.value, ctx);
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
    ...(bible === null
      ? {}
      : {
          sections: [
            { name: "place:bible-core", order: ORDER.WORLD_RULES, text: bible.core },
            { name: "place:bible-style", order: ORDER.WORLD_RULES + 1, text: bible.style },
          ],
        }),
    maxTokens: PLACE_MAX_TOKENS,
    temperature: 0.9,
  });
}
