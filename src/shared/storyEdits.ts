// Partial edits of a story plan while a world is being made (Create a game): rewrite one chapter
// after the player's note, write one chapter to stand between two others, or rewrite every
// unlocked chapter after a note on the whole story. Same @@ line protocol as the plan (story.ts);
// the host keeps the order, the ids and the gates — the model writes only words, and a chapter
// the player locked is never taken from a reply, whatever the reply says.

import { z } from "zod";
import { chapterKind, PLAY_KINDS, type PlayKind } from "./chapter";
import { languageName } from "./language";
import type { ChatMessage } from "./llm";
import { err, ok, type Result } from "./result";
import { type EpisodeText, kindLine, kindsOfPlay, readStoryBlocks, STORY_LIMITS } from "./story";

const FIGHT = /fight|battle|duel|combat|boss|skirmish|戰|战|鬥|斗|戦|闘|討伐|退治/i;
const SEARCH = /search|find|seek|explor|treasure|collect|gather|找|尋|寻|搜|探|拾|捜/i;
const MEET = /meet|talk|visit|speak|social|conversation|會|会|談|谈|話|话|訪|访/i;

/**
 * The kind of play a free label names — the model may write "duel" or "戰鬥" for a fight — or
 * null when it names nothing this game can play. Stored stories keep their free labels (they are
 * hashed cartridge content); Create uses this to refuse a chapter the land cannot play.
 */
export function playKindOf(label: string): PlayKind | null {
  const text = label.trim().toLowerCase();
  if ((PLAY_KINDS as readonly string[]).includes(text)) return text as PlayKind;
  const place = chapterKind(text);
  if (place === "side") return "climb";
  if (place === "dungeon") return "maze";
  if (FIGHT.test(text)) return "fight";
  if (SEARCH.test(text)) return "search";
  if (MEET.test(text)) return "meet";
  return null;
}

/** A chapter with its kind made one of Create's kinds, or why the game cannot play it. */
export function checkPlayKind(chapter: EpisodeText, combat: boolean): Result<EpisodeText> {
  const kind = playKindOf(chapter.kind);
  if (kind === null) {
    return err(
      "story-kind-unknown",
      `"${chapter.title}" is a "${chapter.kind}" chapter, which is not a kind of play this game has.`,
      `Give every chapter a kind that is one of: ${kindLine(combat)}.`,
    );
  }
  if (kind === "fight" && !combat) {
    return err(
      "story-kind-fight",
      `"${chapter.title}" is a fight, but this game has no fighting.`,
      `Give it a kind that is one of: ${kindLine(false)}.`,
    );
  }
  return ok({ ...chapter, kind });
}

/** Every chapter's kind checked; the first chapter the game cannot play is the error. */
export function checkPlayKinds(
  chapters: readonly EpisodeText[],
  combat: boolean,
): Result<EpisodeText[]> {
  const out: EpisodeText[] = [];
  for (const chapter of chapters) {
    const checked = checkPlayKind(chapter, combat);
    if (!checked.ok) return checked;
    out.push(checked.value);
  }
  return ok(out);
}

export interface StoryEditContext {
  core: string;
  style: string;
  language: string;
  combat: boolean;
  logline: string;
  chapters: readonly EpisodeText[];
}

const text = (max: number) => z.string().trim().min(1).max(max);

export const chapterTextSchema = z
  .object({
    title: text(STORY_LIMITS.titleChars),
    place: text(STORY_LIMITS.placeChars),
    kind: text(STORY_LIMITS.kindChars),
    brief: text(STORY_LIMITS.briefChars),
  })
  .strict();

function episodeFormat(ctx: StoryEditContext, number: string): string {
  return `@@episode${number}
title: <short title>
place: <what the locals call the place>
kind: <one of: ${kindLine(ctx.combat)}>
brief: <2-3 sentences: what the player does there, how it is won, what they carry away>`;
}

function system(ctx: StoryEditContext, task: string, format: string): ChatMessage {
  return {
    role: "system",
    content: `You edit a short chain of playable episodes for an open-world RPG. Each episode is one chapter played in the game itself at a place on the map. ${kindsOfPlay(ctx.combat)}
Write every text in ${languageName(ctx.language)}. Keep the world's rules and tone:
CORE: ${ctx.core.slice(0, 1_500)}
STYLE: ${ctx.style.slice(0, 600)}

${task}

Reply ONLY in this line format:
${format}
@@end`,
  };
}

function outline(ctx: StoryEditContext, mark: (index: number) => string = () => ""): string {
  return [
    `Story: ${ctx.logline.slice(0, STORY_LIMITS.loglineChars)}`,
    ...ctx.chapters.map(
      (chapter, index) =>
        `${index + 1}.${mark(index)} ${chapter.title} — ${chapter.place} (${chapter.kind}): ${chapter.brief}`,
    ),
  ].join("\n");
}

function noteLine(note: string): string {
  const trimmed = note.trim();
  return trimmed === ""
    ? "No note: write a fresh version that fits the story better."
    : `Player's note: ${trimmed.slice(0, 300)}`;
}

/** One chapter again, after the player's note; the reply is a single @@episode block. */
export function rewriteChapterMessages(
  ctx: StoryEditContext,
  index: number,
  note: string,
): ChatMessage[] {
  const n = index + 1;
  const around = [
    index > 0 ? `still follow chapter ${n - 1}` : null,
    index < ctx.chapters.length - 1 ? `still lead into chapter ${n + 1}` : null,
  ].filter((part) => part !== null);
  return [
    system(
      ctx,
      `Rewrite chapter ${n} only, following the player's note.${around.length > 0 ? ` It must ${around.join(" and ")}.` : ""}`,
      episodeFormat(ctx, ""),
    ),
    { role: "user", content: `${outline(ctx)}\n\nChapter to rewrite: ${n}.\n${noteLine(note)}` },
  ];
}

/** A new chapter at 0-based position `at` (it will become chapter at + 1), fitting its neighbours. */
export function insertChapterMessages(ctx: StoryEditContext, at: number): ChatMessage[] {
  const count = ctx.chapters.length;
  const where =
    at <= 0
      ? "comes before chapter 1 and leads into it"
      : at >= count
        ? `comes after chapter ${count} and follows from it`
        : `goes between chapter ${at} and chapter ${at + 1}: it follows from the first and leads into the second`;
  return [
    system(
      ctx,
      `Write ONE new chapter that ${where}. Give it a different kind from its neighbours when you can.`,
      episodeFormat(ctx, ""),
    ),
    { role: "user", content: `${outline(ctx)}\n\nWrite the new chapter.` },
  ];
}

/** Every chapter in `unlocked` (0-based) again after a note on the whole story; locked ones stay. */
export function storyNoteMessages(
  ctx: StoryEditContext,
  unlocked: readonly number[],
  note: string,
): ChatMessage[] {
  const wanted = unlocked.map((index) => index + 1).join(", ");
  return [
    system(
      ctx,
      `The player has a note on the whole story. Rewrite chapters ${wanted} (marked "rewrite") following it. Chapters marked "locked" stay exactly as they are; yours must still fit around them. Keep every chapter at its number and write one block per chapter you rewrite.`,
      `${episodeFormat(ctx, " <chapter number>")}\n(one block for each of chapters ${wanted})`,
    ),
    {
      role: "user",
      content: `${outline(ctx, (index) => (unlocked.includes(index) ? " [rewrite]" : " [locked]"))}\n\n${noteLine(note)}`,
    },
  ];
}

function incomplete(issue: { path: PropertyKey[]; message: string } | undefined): string {
  return `${issue?.path.map(String).join(".") || "chapter"} — ${issue?.message ?? "missing"}`;
}

/** The first @@episode block of a reply, complete, or an error the caller sends back. */
export function parseChapterReply(reply: string): Result<EpisodeText> {
  const first = readStoryBlocks(reply).episodes[0];
  const checked = chapterTextSchema.safeParse(first ?? {});
  if (checked.success) return ok(checked.data);
  return err(
    "story-chapter-invalid",
    `The chapter is incomplete: ${incomplete(checked.error.issues[0])}`,
    "Answer with exactly one @@episode block with title, place, kind and brief lines, then @@end.",
  );
}

/**
 * The rewritten chapters of a story-note reply, keyed by 0-based index. Only indexes in `wanted`
 * are ever taken: a block for a locked or unknown chapter is ignored. Blocks without numbers are
 * accepted only when there is exactly one per wanted chapter, in order.
 */
export function parseChapterRewrites(
  reply: string,
  wanted: readonly number[],
): Result<Map<number, EpisodeText>> {
  const blocks = readStoryBlocks(reply);
  const unnumbered =
    blocks.numbers.every((number) => number === null) && blocks.episodes.length === wanted.length;
  const found = new Map<number, EpisodeText>();
  blocks.episodes.forEach((episode, at) => {
    const number = blocks.numbers[at] ?? null;
    const index = unnumbered ? wanted[at] : number === null ? undefined : number - 1;
    if (index === undefined || !wanted.includes(index) || found.has(index)) return;
    const checked = chapterTextSchema.safeParse(episode);
    if (checked.success) found.set(index, checked.data);
  });
  const missing = wanted.filter((index) => !found.has(index));
  if (missing.length === 0) return ok(found);
  const list = (indexes: readonly number[]) => indexes.map((index) => index + 1).join(", ");
  return err(
    "story-note-invalid",
    `Chapter(s) ${list(missing)} are missing or incomplete in the reply.`,
    `Answer with one @@episode <number> block for each of chapters ${list(wanted)}, each with title, place, kind and brief lines, then @@end.`,
  );
}
