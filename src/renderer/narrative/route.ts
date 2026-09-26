// How a witness or a chapter is asked on the current route. A route whose whole context is small
// and that decodes against a schema (Apple's on-device model, 4096 tokens) is guided: a compact
// prompt and an answer held to the dialect's answer schema, written back as a program the parser
// checks (@dsl chunkAnswer / chapterAnswer). Every other route keeps the full prompt.

import { useInferenceStore } from "@renderer/state/inferenceStore";

/** A route holding less than this, prompt and answer together, cannot take the full prompt. */
export const COMPACT_BELOW_TOKENS = 8192;

export type AnswerRoute = "full" | "guided";

export function answerRoute(): AnswerRoute {
  const { config, probe } = useInferenceStore.getState();
  const context = probe.status === "ready" ? probe.value.context : null;
  const small = context !== null && context.tokens < COMPACT_BELOW_TOKENS;
  return small && config?.kind === "apple-fm" ? "guided" : "full";
}

/** Names shown to the model (nearest first), and checked against: each prompt's own budget. */
export const NAMES_SHOWN: Readonly<Record<AnswerRoute, number>> = { full: 24, guided: 12 };

/**
 * The names a new person is checked against: the ones the prompt showed, plus any that came into
 * use while the model wrote (`now`, read at the check), within the same budget.
 */
export function namesChecked(
  shown: readonly string[],
  now: (() => readonly string[]) | undefined,
  route: AnswerRoute,
): string[] {
  const later = now === undefined ? [] : now().slice(0, NAMES_SHOWN[route]);
  return [...new Set([...shown, ...later])];
}
