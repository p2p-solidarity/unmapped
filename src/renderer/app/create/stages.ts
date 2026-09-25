// The Create steps and the model calls it runs, with their labels. `Run` is the controller's one
// foreground call runner (a stage label, a timer, a streamed preview, Cancel).

import type { StringKey } from "@renderer/i18n";
import type { NewWorldStage } from "@renderer/narrative/newWorld";
import type { BiblePart } from "@shared/bible";
import { CREATE_STEPS, type CreateStep } from "@shared/createDraft";
import type { Result } from "@shared/result";

export const STEPS: readonly CreateStep[] = CREATE_STEPS;

export const STEP_LABEL: Record<CreateStep, StringKey> = {
  idea: "create.stepIdea",
  world: "create.stepWorld",
  look: "create.stepLook",
  story: "create.stepStory",
  build: "create.stepBuild",
};

export type Stage =
  | "world"
  | "card"
  | "cards"
  | "story"
  | "chapter"
  | "insert"
  | "note"
  | NewWorldStage;

export const STAGE_LABEL: Record<Stage, StringKey> = {
  world: "create.stageWorld",
  card: "create.stageCard",
  cards: "create.stageCards",
  story: "create.stageStory",
  chapter: "create.stageChapter",
  insert: "create.stageInsert",
  note: "create.stageNote",
  origin: "create.stageOrigin",
  publish: "create.stagePublish",
};

export const CARD_LABEL: Record<BiblePart, StringKey> = {
  premise: "create.partPremise",
  tone: "create.partTone",
  rules: "create.partRules",
  taboos: "create.partTaboos",
  naming: "create.partNaming",
  voice: "create.partVoice",
  look: "create.partLook",
};

export type Run = <T>(
  at: Stage,
  work: (signal: AbortSignal, onDelta: (text: string) => void) => Promise<Result<T>>,
  arg?: Record<string, string | number>,
) => Promise<Result<T>>;

export const newKey = (): string => crypto.randomUUID().replaceAll("-", "").slice(0, 16);
