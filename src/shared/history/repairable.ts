// Which refusals of a model-written event the model can fix (rev 6 phase 3, D5 "refusals feed
// repairs"). A witness, chapter, place or next chapter that main refuses on append goes back to the
// model as a repair round — counted toward Rule 7's two — only when the refusal is about what the
// program says: its shape, its size, its words, its lore links. Everything else is not the model's
// fault and is shown at once: the door (access, membership), quotas and caps on the world, a race
// someone else won, a spot the host picks again itself (`place-spot-taken`), physics, keys, the
// save changing underneath. The list is an allowlist, so an unknown code is never sent to a model.

/** Refusal codes that describe the program itself. */
export const CONTENT_REFUSALS: ReadonlySet<string> = new Set([
  // readEvent: the body over a field cap, or the whole event over 128 KiB (D5 caps).
  "event-invalid",
  "event-too-large",
  // validateEventBody (src/dsl/history/validate.ts): programs that do not round-trip.
  "witness-scene-invalid",
  "witness-dialogue-invalid",
  "witness-dialogue-mismatch",
  "witness-errands-invalid",
  "witness-lore-invalid",
  "place-source-invalid",
  "place-dialogue-invalid",
  "place-dialogue-mismatch",
  "chapter-source-invalid",
  "chapter-dialogue-invalid",
  "chapter-dialogue-mismatch",
  "rumor-text-invalid",
  // admit: lore the program places or links wrongly.
  "lore-off-chunk",
  "lore-id-duplicate",
  "lore-link-unknown",
  "errand-place-unknown",
  // The land's own size checks before it appends (app/land/{chapters,places}.ts).
  "chapter-too-large",
  "place-too-large",
]);

/** Whether a refusal is about the program, so a rewrite can fix it (see the header). */
export function isContentRefusal(error: { code: string }): boolean {
  return CONTENT_REFUSALS.has(error.code);
}
