// The model calls of Create a game before Build, each small and each stopping for review: the
// world bible (a Bible program, parsed into its seven parts), one bible part again after a note,
// every unlocked part again in one call (the locked ones as fixed context), the story from the reviewed world, one chapter again, one new chapter between two others, and
// every unlocked chapter after a note on the whole story. Every call is aborted by its signal and
// repaired at most twice (Rule 7); none returns anything the model did not write.

import { biblePrompt, parseBible } from "@dsl";
import {
  type BibleFields,
  type BiblePart,
  bibleCardMessages,
  bibleCardsMessages,
  flattenBible,
  parseBibleCard,
  parseBibleCards,
} from "@shared/bible";
import { ok, type Result } from "@shared/result";
import { type EpisodeText, parseStoryReply, storyMessages } from "@shared/story";
import {
  checkPlayKind,
  checkPlayKinds,
  insertChapterMessages,
  parseChapterReply,
  parseChapterRewrites,
  rewriteChapterMessages,
  type StoryEditContext,
  storyNoteMessages,
} from "@shared/storyEdits";
import { askInLines, type CallIo } from "./lineReply";
import type { WorldIdea } from "./newWorld";
import { generateProgram } from "./pipeline";

function checkedChapter(parsed: Result<EpisodeText>, combat: boolean): Result<EpisodeText> {
  return parsed.ok ? checkPlayKind(parsed.value, combat) : parsed;
}

/** Tokens for one chapter in the @@ protocol, as the land's next-chapter call uses. */
const CHAPTER_TOKENS = 700;
/** Tokens per bible card in the @@ protocol. */
const CARD_TOKENS = 600;

export async function writeBible(idea: WorldIdea, io: CallIo): Promise<Result<BibleFields>> {
  const bible = await generateProgram<BibleFields>({
    system: biblePrompt({
      name: idea.name,
      intent: idea.intent,
      language: idea.language,
      fights: idea.play.fights,
      material: idea.story,
    }),
    user: "Write the Bible program for this world now. Output the program only.",
    purpose: "free",
    task: "bible",
    language: idea.language,
    parse: parseBible,
    maxTokens: 1400,
    temperature: 0.9,
    signal: io.signal,
    ...(io.onDelta === undefined ? {} : { onDelta: io.onDelta }),
  });
  return bible.ok ? ok(bible.value.graph) : bible;
}

/** One part of the bible again, after the player's note; the rest is the context it must fit. */
export function rewriteBiblePart(
  idea: WorldIdea,
  fields: BibleFields,
  part: BiblePart,
  note: string,
  io: CallIo,
): Promise<Result<Partial<BibleFields>>> {
  return askInLines(
    {
      task: "bible",
      messages: bibleCardMessages({
        name: idea.name,
        intent: idea.intent,
        language: idea.language,
        fights: idea.play.fights,
        fields,
        part,
        note,
      }),
      parse: (reply) => parseBibleCard(part, reply),
      maxTokens: CARD_TOKENS,
    },
    io,
  );
}

/**
 * Every part in `parts` (the unlocked cards) again after one note, in one call; the other parts
 * go in as fixed context and are never read back from the reply, so a locked card cannot change.
 */
export function rewriteBibleParts(
  idea: WorldIdea,
  fields: BibleFields,
  parts: readonly BiblePart[],
  note: string,
  io: CallIo,
): Promise<Result<Partial<BibleFields>>> {
  return askInLines(
    {
      task: "bible",
      messages: bibleCardsMessages({
        name: idea.name,
        intent: idea.intent,
        language: idea.language,
        fights: idea.play.fights,
        fields,
        parts,
        note,
      }),
      parse: (reply) => parseBibleCards(parts, reply),
      maxTokens: Math.min(2_400, CARD_TOKENS * parts.length),
    },
    io,
  );
}

export interface WrittenStory {
  logline: string;
  chapters: EpisodeText[];
}

/** The logline and 3–6 chapters from the reviewed world and, if any, the player's own story. */
export async function writeStory(
  idea: WorldIdea,
  fields: BibleFields,
  io: CallIo,
): Promise<Result<WrittenStory>> {
  const bible = flattenBible(fields);
  const plan = await askInLines(
    {
      task: "story",
      messages: storyMessages({
        story: idea.story,
        core: bible.core,
        style: bible.style,
        language: idea.language,
        combat: idea.play.fights !== "none",
        world: { name: idea.name, intent: idea.intent },
      }),
      // A chapter the land cannot play (an unknown kind, a fight without fighting) is repaired.
      parse: (reply) => {
        const parsed = parseStoryReply(reply);
        if (!parsed.ok) return parsed;
        const kinds = checkPlayKinds(parsed.value.episodes, idea.play.fights !== "none");
        if (!kinds.ok) return kinds;
        return ok({
          ...parsed.value,
          episodes: parsed.value.episodes.map((episode, at) => ({
            ...episode,
            ...kinds.value[at],
          })),
        });
      },
      maxTokens: 4_000,
    },
    io,
  );
  if (!plan.ok) return plan;
  return ok({
    logline: plan.value.logline,
    chapters: plan.value.episodes.map(({ title, place, kind, brief }) => ({
      title,
      place,
      kind,
      brief,
    })),
  });
}

export function rewriteChapter(
  ctx: StoryEditContext,
  index: number,
  note: string,
  io: CallIo,
): Promise<Result<EpisodeText>> {
  return askInLines(
    {
      task: "story-edit",
      messages: rewriteChapterMessages(ctx, index, note),
      parse: (reply) => checkedChapter(parseChapterReply(reply), ctx.combat),
      maxTokens: CHAPTER_TOKENS,
    },
    io,
  );
}

/** A new chapter for 0-based position `at`, written to fit the chapters on either side. */
export function writeChapterAt(
  ctx: StoryEditContext,
  at: number,
  io: CallIo,
): Promise<Result<EpisodeText>> {
  return askInLines(
    {
      task: "story-edit",
      messages: insertChapterMessages(ctx, at),
      parse: (reply) => checkedChapter(parseChapterReply(reply), ctx.combat),
      maxTokens: CHAPTER_TOKENS,
    },
    io,
  );
}

/** Every chapter in `unlocked` (0-based) again after a note on the whole story. */
export function rewriteUnlocked(
  ctx: StoryEditContext,
  unlocked: readonly number[],
  note: string,
  io: CallIo,
): Promise<Result<Map<number, EpisodeText>>> {
  return askInLines(
    {
      task: "story-edit",
      messages: storyNoteMessages(ctx, unlocked, note),
      parse: (reply) => {
        const parsed = parseChapterRewrites(reply, unlocked);
        if (!parsed.ok) return parsed;
        const out = new Map<number, EpisodeText>();
        for (const [index, chapter] of parsed.value) {
          const checked = checkPlayKind(chapter, ctx.combat);
          if (!checked.ok) return checked;
          out.set(index, checked.value);
        }
        return ok(out);
      },
      maxTokens: Math.min(4_000, CHAPTER_TOKENS * unlocked.length),
    },
    io,
  );
}
