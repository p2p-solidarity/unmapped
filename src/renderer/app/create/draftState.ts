import { bibleProblems, flattenBible } from "@shared/bible";
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

export function worldStale(draft: CreateDraft): boolean {
  const basis = draft.world?.basis;
  return basis !== undefined && JSON.stringify(basis) !== JSON.stringify(worldBasis(draft.idea));
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
