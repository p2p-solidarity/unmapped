import { type BiblePart, bibleProblems, flattenBible } from "@shared/bible";
import type { CreateDraft, DraftIdea, DraftStory, DraftWorld } from "@shared/createDraft";
import { episodePlaces, type StoryPlan, storyPlanSchema } from "@shared/story";
import type { StoryEditContext } from "@shared/storyEdits";

export function worldBasis(idea: DraftIdea): DraftWorld["basis"] {
  return {
    name: idea.name,
    intent: idea.intent,
    material: idea.story,
    language: idea.language,
    fights: idea.play.fights,
  };
}

export function storyBasis(draft: CreateDraft): DraftStory["basis"] | null {
  if (draft.world === null) return null;
  return {
    language: draft.idea.language,
    fights: draft.idea.play.fights,
    material: draft.idea.story,
    worldRev: draft.world.rev,
  };
}

/**
 * The world needs updating when the words, the player's story, the language or the play style
 * changed since it was written. The name is not compared: renaming a world never makes it stale.
 */
export function worldStale(draft: CreateDraft): boolean {
  const basis = draft.world?.basis;
  if (basis === undefined) return false;
  const now = worldBasis(draft.idea);
  return (
    basis.intent !== now.intent ||
    basis.material !== now.material ||
    basis.language !== now.language ||
    basis.fights !== now.fights
  );
}

/** Characters of a name taken from the player's words. */
const WORDS_NAME_MAX = 28;

/**
 * A name for a world whose maker left it blank: the first clause of their words, cut at a word
 * boundary when it runs long. The player can edit it on the world step.
 */
export function nameFromWords(words: string): string {
  const first =
    words
      .split(/[。．.!！?？,，、;；:：\n—–()（）「」『』"“”]/u)
      .map((part) => part.trim())
      .find((part) => part !== "") ?? "";
  const chars = [...first];
  if (chars.length <= WORDS_NAME_MAX) return first;
  const cut = chars.slice(0, WORDS_NAME_MAX).join("");
  const space = cut.lastIndexOf(" ");
  return (space >= 8 ? cut.slice(0, space) : cut).trim();
}

/** The cards the model never overwrites (none in a draft saved before locks). */
export function lockedParts(world: DraftWorld): readonly BiblePart[] {
  return world.locked ?? [];
}

/** Existing model text cannot be accepted as the new language or the opposite combat rules. */
export function canKeepWorld(draft: CreateDraft): boolean {
  return (
    draft.world !== null &&
    draft.world.basis.language === draft.idea.language &&
    draft.world.basis.fights === draft.idea.play.fights
  );
}

export function canKeepStory(draft: CreateDraft): boolean {
  return (
    draft.story !== null &&
    draft.story.basis.language === draft.idea.language &&
    draft.story.basis.fights === draft.idea.play.fights
  );
}

export function storyStale(draft: CreateDraft): boolean {
  const basis = storyBasis(draft);
  return (
    draft.story !== null &&
    (basis === null || JSON.stringify(draft.story.basis) !== JSON.stringify(basis))
  );
}

export function worldReady(draft: CreateDraft): boolean {
  return (
    draft.world !== null && !worldStale(draft) && bibleProblems(draft.world.fields).length === 0
  );
}

export function storyPlan(draft: CreateDraft): StoryPlan | null {
  if (draft.story === null) return null;
  const places = episodePlaces(draft.story.chapters.length);
  const plan = {
    formatVersion: 1 as const,
    logline: draft.story.logline,
    episodes: draft.story.chapters.map((one, index) => ({
      id: `e${index + 1}`,
      ...(places[index] ?? { cx: 1, cz: 0 }),
      title: one.title,
      place: one.place,
      kind: one.kind,
      brief: one.brief,
    })),
  };
  const parsed = storyPlanSchema.safeParse(plan);
  return parsed.success ? parsed.data : null;
}

export function editContext(draft: CreateDraft): StoryEditContext | null {
  if (draft.world === null || draft.story === null) return null;
  const bible = flattenBible(draft.world.fields);
  return {
    core: bible.core,
    style: bible.style,
    language: draft.idea.language,
    combat: draft.idea.play.fights !== "none",
    logline: draft.story.logline,
    chapters: draft.story.chapters,
  };
}
