// Writing a story chapter for play on the land: the model writes its people, their words, its finds
// and its foes against the world bible; parse → issues → repair ≤ 2 rounds (Rule 7), a content
// refusal of its `chapter` event counting as one (D5). A chapter that never parses is an error the
// player sees, never a stand-in.

import { bibleSections, type ChapterDraft, type ChapterPromptContext, chapterPrompt } from "@dsl";
import { parseChapter } from "@dsl/parse/chapter";
import { ORDER } from "@harness";
import type { WorldBible } from "@shared/cartridge";
import type { Result } from "@shared/result";
import { generateProgram, type Program } from "./pipeline";

export const CHAPTER_MAX_TOKENS = 2400;

export function generateChapter(
  ctx: ChapterPromptContext & {
    bible: WorldBible | null;
    signal?: AbortSignal;
    /** Keeps a parsed chapter (its `chapter` event); a content refusal is repaired (D5). */
    accept?: (program: { source: string; graph: ChapterDraft }) => Promise<Result<unknown>>;
  },
): Promise<Result<Program<ChapterDraft>>> {
  const bible = ctx.bible === null ? null : bibleSections(ctx.bible);
  return generateProgram<ChapterDraft>({
    system: chapterPrompt(ctx),
    user: "Write the Chapter program now. Output the program only.",
    purpose: "scene",
    task: "chapter",
    language: ctx.language,
    parse: (source) => parseChapter(source, { combat: ctx.combat, language: ctx.language }),
    ...(bible === null
      ? {}
      : {
          sections: [
            { name: "chapter:bible-core", order: ORDER.WORLD_RULES, text: bible.core },
            { name: "chapter:bible-style", order: ORDER.WORLD_RULES + 1, text: bible.style },
          ],
        }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    ...(ctx.accept === undefined ? {} : { accept: ctx.accept }),
    maxTokens: CHAPTER_MAX_TOKENS,
    temperature: 0.9,
  });
}
