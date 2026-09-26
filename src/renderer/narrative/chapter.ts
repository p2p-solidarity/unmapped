// Writing a story chapter for play on the land: the model writes its people, their words, its finds
// and its foes against the world bible; parse → issues → repair ≤ 2 rounds (Rule 7), a content
// refusal of its `chapter` event counting as one (D5). A chapter that never parses is an error the
// player sees, never a stand-in.
//
// Its people get names of their own: the prompt lists the names already in use near the gate and in
// the story, and the parser sends back a person who takes one. Those names are read again at every
// check (`namesNow`): at New game the origin is witnessed while chapter 1 is written, and whichever
// lands second is held to the other's names — neither waits for the other, so the first walk is
// not slowed, and a clash costs one repair round.
//
// On a route whose whole context is small and that decodes against a schema (Apple's on-device
// model, 4096 tokens; ./route.ts) the chapter is guided: a compact prompt (the bible's short lines,
// the compact lore around the gate, no Chapter spec) and an answer held to the chapter schema,
// written back as a Chapter program that `parseChapter` checks like any other (@dsl chapterAnswer);
// a repair asks again with the complaints alone. Every other route keeps the full prompt.

import {
  bibleSections,
  type ChapterDraft,
  type ChapterPromptContext,
  chapterAnswerSchema,
  chapterNamesSection,
  chapterPrompt,
  compactBibleSection,
  compactChapterPrompt,
  repairNote,
  writeChapterProgram,
} from "@dsl";
import { parseChapter } from "@dsl/parse/chapter";
import { ORDER } from "@harness";
import type { WorldBible } from "@shared/cartridge";
import type { ChunkCoord } from "@shared/chunks";
import type { Result } from "@shared/result";
import { generateProgram, type Program } from "./pipeline";
import { answerRoute, NAMES_SHOWN, namesChecked } from "./route";
import type { TurnSection } from "./turn";

export const CHAPTER_MAX_TOKENS = 2400;
export const CHAPTER_TEMPERATURE = 0.9;
/**
 * A guided chapter (≤ 3 people with a line and ≤ 2 answers each, ≤ 3 finds) is shorter than a
 * guided witness; this much lets it finish in a CJK language, and an answer that loops stops here.
 */
export const CHAPTER_GUIDED_MAX_TOKENS = 1300;
export const CHAPTER_GUIDED_MIN_TOKENS = 900;

export interface ChapterInput extends ChapterPromptContext {
  bible: WorldBible | null;
  /** The gate's chunk: a guided chapter is told the lore around it. */
  coord?: ChunkCoord;
  /** Names already in use near the gate and in the story, nearest first (shown and checked). */
  names?: readonly string[];
  /** The same names as they stand at each check (see the header). */
  namesNow?: () => readonly string[];
  signal?: AbortSignal;
  /** Keeps a parsed chapter (its `chapter` event); a content refusal is repaired (D5). */
  accept?: (program: { source: string; graph: ChapterDraft }) => Promise<Result<unknown>>;
}

export function generateChapter(ctx: ChapterInput): Promise<Result<Program<ChapterDraft>>> {
  const route = answerRoute();
  const names = (ctx.names ?? []).slice(0, NAMES_SHOWN[route]);
  const namesTurn: TurnSection = {
    name: "chapter:names",
    order: ORDER.CONTEXT + 14,
    text: chapterNamesSection(names),
  };
  const common = {
    purpose: "scene",
    task: "chapter",
    language: ctx.language,
    parse: (source: string) =>
      parseChapter(source, {
        combat: ctx.combat,
        language: ctx.language,
        names: namesChecked(names, ctx.namesNow, route),
      }),
    temperature: CHAPTER_TEMPERATURE,
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
    ...(ctx.accept === undefined ? {} : { accept: ctx.accept }),
  } as const;

  if (route === "guided") {
    const answer = { language: ctx.language, combat: ctx.combat, names };
    return generateProgram<ChapterDraft>({
      ...common,
      system: compactChapterPrompt(ctx),
      user: "Answer with this chapter now.",
      sections: [
        ...(ctx.bible === null
          ? []
          : [
              {
                name: "chapter:bible",
                order: ORDER.WORLD_RULES,
                text: compactBibleSection(ctx.bible),
              },
            ]),
        namesTurn,
      ],
      schema: chapterAnswerSchema(answer),
      write: (raw) => writeChapterProgram(raw, answer),
      brief: repairNote,
      compact: true,
      ...(ctx.coord === undefined ? {} : { coord: ctx.coord }),
      maxTokens: CHAPTER_GUIDED_MAX_TOKENS,
      minTokens: CHAPTER_GUIDED_MIN_TOKENS,
    });
  }

  const bible = ctx.bible === null ? null : bibleSections(ctx.bible);
  return generateProgram<ChapterDraft>({
    ...common,
    system: chapterPrompt(ctx),
    user: "Write the Chapter program now. Output the program only.",
    sections: [
      ...(bible === null
        ? []
        : [
            { name: "chapter:bible-core", order: ORDER.WORLD_RULES, text: bible.core },
            { name: "chapter:bible-style", order: ORDER.WORLD_RULES + 1, text: bible.style },
          ]),
      namesTurn,
    ],
    maxTokens: CHAPTER_MAX_TOKENS,
  });
}
