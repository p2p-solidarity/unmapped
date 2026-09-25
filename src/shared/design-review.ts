// AI Design Interview contracts (plan.md §2.4). The model acts as a game director: it finds gaps
// in the player's selection and offers understandable options. It never writes rules, saves or
// cartridges — everything it wants lands as a typed `DefinitionPatch` the player must accept.

import type { CapabilityKey, CapabilityResolution } from "./capabilities";
import { CAPABILITY_KEYS } from "./capabilities";
import type { DefinitionPatch } from "./game-definition";

/** A question is filed under the capability it decides; any capability key is a valid topic. */
export const DESIGN_QUESTION_CATEGORIES = CAPABILITY_KEYS;
export type DesignQuestionCategory = (typeof DESIGN_QUESTION_CATEGORIES)[number];

export interface DesignOption {
  id: string;
  label: string;
  description: string;
  /** What accepting this option does to the definition. May be empty for "keep as is". */
  patches: DefinitionPatch[];
}

export interface DesignQuestion {
  id: string;
  category: DesignQuestionCategory;
  question: string;
  /** A required question blocks Forge until answered. */
  required: boolean;
  affects: CapabilityKey[];
  /** True when the player may pick several options at once. */
  multiSelect: boolean;
  options: DesignOption[];
}

export type DesignSuggestionStatus = "proposed" | "accepted" | "dismissed";

export interface DesignSuggestion {
  id: string;
  title: string;
  rationale: string;
  patches: DefinitionPatch[];
  status: DesignSuggestionStatus;
}

export interface DesignMessage {
  messageId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export type DesignReviewStatus = "waiting_for_user" | "ready" | "blocked";

export interface DesignReview {
  reviewId: string;
  /** The deterministic compiler output this review was generated against. */
  resolution: CapabilityResolution;
  questions: DesignQuestion[];
  suggestions: DesignSuggestion[];
  /** Answered question ids → chosen option ids. */
  answers: Record<string, string[]>;
  acceptedPatches: DefinitionPatch[];
  messages: DesignMessage[];
  status: DesignReviewStatus;
}

/** A review is only `ready` once every required question has at least one answer. */
export function reviewStatus(
  review: Pick<DesignReview, "questions" | "answers" | "resolution">,
): DesignReviewStatus {
  if (review.resolution.status === "conflict" || review.resolution.status === "needs_plugin") {
    return "blocked";
  }
  const unanswered = review.questions.filter(
    (question) => question.required && (review.answers[question.id]?.length ?? 0) === 0,
  );
  return unanswered.length > 0 ? "waiting_for_user" : "ready";
}

export function answerQuestion(
  review: DesignReview,
  questionId: string,
  optionIds: string[],
): DesignReview {
  const question = review.questions.find((one) => one.id === questionId);
  if (question === undefined) return review;
  const valid = optionIds.filter((id) => question.options.some((option) => option.id === id));
  const selected = question.multiSelect ? valid : valid.slice(0, 1);
  const nextAnswers = { ...review.answers, [questionId]: selected };
  const next = {
    ...review,
    answers: nextAnswers,
    acceptedPatches: acceptedPatches(review, nextAnswers),
  };
  return { ...next, status: reviewStatus(next) };
}

export function decideSuggestion(
  review: DesignReview,
  suggestionId: string,
  status: "accepted" | "dismissed",
): DesignReview {
  const suggestion = review.suggestions.find((one) => one.id === suggestionId);
  if (suggestion === undefined || suggestion.status !== "proposed") return review;
  return {
    ...review,
    suggestions: review.suggestions.map((one) =>
      one.id === suggestionId ? { ...one, status } : one,
    ),
    acceptedPatches: acceptedPatches(
      {
        ...review,
        suggestions: review.suggestions.map((one) =>
          one.id === suggestionId ? { ...one, status } : one,
        ),
      },
      review.answers,
    ),
  };
}

function acceptedPatches(
  review: DesignReview,
  answers: Record<string, string[]>,
): DefinitionPatch[] {
  const fromAnswers = review.questions.flatMap((question) => {
    const selected = answers[question.id] ?? [];
    return question.options
      .filter((option) => selected.includes(option.id))
      .flatMap((option) => option.patches);
  });
  const fromSuggestions = review.suggestions
    .filter((suggestion) => suggestion.status === "accepted")
    .flatMap((suggestion) => suggestion.patches);
  return [...fromAnswers, ...fromSuggestions];
}
