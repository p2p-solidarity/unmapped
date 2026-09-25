// The story step's edits: one chapter by hand, one chapter again after a note, a new chapter
// between two others, and every unlocked chapter after a note on the whole story. Each model call
// goes through the controller's runner; a locked chapter is never overwritten.

import { rewriteChapter, rewriteUnlocked, writeChapterAt } from "@renderer/narrative/worldDraft";
import type { CreateDraft, DraftChapter } from "@shared/createDraft";
import { STORY_LIMITS } from "@shared/story";
import type { MutableRefObject } from "react";
import { editContext } from "./draftState";
import { newKey, type Run } from "./stages";

export function useStoryActions(
  latest: MutableRefObject<CreateDraft | null>,
  update: (change: (current: CreateDraft) => CreateDraft) => void,
  run: Run,
) {
  const editChapter = (index: number, patch: Partial<DraftChapter>): void =>
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch, at) =>
                at === index ? { ...ch, ...patch } : ch,
              ),
            },
          },
    );

  const rewriteOne = async (index: number, note: string): Promise<void> => {
    const current = latest.current;
    if (current === null) return;
    const ctx = editContext(current);
    const key = current.story?.chapters[index]?.key;
    if (ctx === null || key === undefined || current.story?.chapters[index]?.locked) return;
    const result = await run(
      "chapter",
      (signal, onDelta) => rewriteChapter(ctx, index, note, { signal, onDelta }),
      { n: index + 1 },
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch) =>
                ch.key === key && !ch.locked ? { ...ch, ...result.value, edited: false } : ch,
              ),
            },
          },
    );
  };

  const insert = async (index: number): Promise<void> => {
    const current = latest.current;
    if (
      current === null ||
      current.story === null ||
      current.story.chapters.length >= STORY_LIMITS.maxEpisodes
    )
      return;
    const ctx = editContext(current);
    if (ctx === null) return;
    const result = await run(
      "insert",
      (signal, onDelta) => writeChapterAt(ctx, index, { signal, onDelta }),
      { n: index + 1 },
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: [
                ...one.story.chapters.slice(0, index),
                { ...result.value, key: newKey(), locked: false, edited: false },
                ...one.story.chapters.slice(index),
              ],
            },
          },
    );
  };

  const revise = async (note: string): Promise<void> => {
    const current = latest.current;
    if (current === null || current.story === null) return;
    const ctx = editContext(current);
    if (ctx === null) return;
    const unlocked = current.story.chapters.flatMap((one, index) => (one.locked ? [] : [index]));
    if (unlocked.length === 0) return;
    const chapters = current.story.chapters;
    const keys = unlocked
      .map((index) => chapters[index]?.key)
      .filter((key): key is string => key !== undefined);
    const result = await run("note", (signal, onDelta) =>
      rewriteUnlocked(ctx, unlocked, note, { signal, onDelta }),
    );
    if (!result.ok) return;
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.map((ch) => {
                const at = keys.indexOf(ch.key);
                const target = unlocked[at];
                const replacement = target === undefined ? undefined : result.value.get(target);
                return replacement === undefined || ch.locked
                  ? ch
                  : { ...ch, ...replacement, edited: false };
              }),
            },
          },
    );
  };

  const removeChapter = (index: number): void =>
    update((one) =>
      one.story === null
        ? one
        : {
            ...one,
            story: {
              ...one.story,
              chapters: one.story.chapters.filter((_, at) => at !== index),
            },
          },
    );

  const moveChapter = (index: number, delta: number): void =>
    update((one) => {
      if (one.story === null) return one;
      const chapters = [...one.story.chapters];
      const [item] = chapters.splice(index, 1);
      if (item) chapters.splice(index + delta, 0, item);
      return { ...one, story: { ...one.story, chapters } };
    });

  const editLogline = (value: string): void =>
    update((one) =>
      one.story === null
        ? one
        : { ...one, story: { ...one.story, logline: value, loglineEdited: true } },
    );

  return { editChapter, rewriteOne, insert, revise, removeChapter, moveChapter, editLogline };
}
