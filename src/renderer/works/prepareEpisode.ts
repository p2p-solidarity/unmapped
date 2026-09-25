// Writes one story episode's world without opening it: reuse (or create) the episode's draft,
// generate → check → repair while it has no playable version, publish that as an immutable
// revision and start a one-world journey carrying the story so far. Shared by the gate panel and
// the background prefetch. Cancel holds between every step, not only during the model call, and
// a land that changed underneath (the player left for another save) counts as cancelled, so a late
// step never writes into the wrong save.

import { useLandStore } from "@renderer/state";
import type { WorldBible } from "@shared/cartridge";
import { err, ok, type Result } from "@shared/result";
import { episodeRequest, type StoryEpisode } from "@shared/story";
import type { WorkRef } from "@shared/works";
import { runAttempt } from "./author";
import type { CheckOutcome } from "./frameGuard";

export interface PrepareEpisodeInput {
  target: StoryEpisode;
  /** The whole story as it stands (`storyEpisodes`): authored episodes, then the land's chapters. */
  episodes: readonly StoryEpisode[];
  logline: string;
  bible: WorldBible;
  /** The player check (`useChecker`); its element must be on screen while it runs. */
  check(draftId: string, candidateId: string): Promise<CheckOutcome>;
  signal: AbortSignal;
  onStage(stage: string): void;
  model: string | null;
}

export interface PreparedEpisode {
  work: WorkRef;
  playId: string;
}

export const EPISODE_CANCELLED = "episode-cancelled";

export async function prepareEpisode(input: PrepareEpisodeInput): Promise<Result<PreparedEpisode>> {
  const { target, signal } = input;
  const instanceId = useLandStore.getState().instanceId;
  const moved = (): boolean => useLandStore.getState().instanceId !== instanceId;
  const cancelled = (): boolean => signal.aborted || moved();
  const stop = (): Result<PreparedEpisode> =>
    err(EPISODE_CANCELLED, "Cancelled; nothing was changed.");

  input.onStage("Preparing the episode…");
  let draftId = useLandStore.getState().progress?.episodes?.[target.id]?.draftId ?? null;
  if (draftId === null) {
    const created = await window.seed.works.createDraft(target.title);
    if (!created.ok) return created;
    if (moved()) return stop();
    draftId = created.value.draftId;
    // Kept even when cancelled next: the next attempt reuses this draft instead of a new one.
    useLandStore.getState().setEpisode(target.id, { draftId });
  }
  if (cancelled()) return stop();
  const draft = await window.seed.works.readDraft(draftId);
  if (!draft.ok) return draft;
  if (cancelled()) return stop();
  if (draft.value.head === null) {
    const id = draftId;
    const report = await runAttempt(
      draft.value,
      "generate",
      episodeRequest({ logline: input.logline, episodes: input.episodes }, target, input.bible),
      {
        check: (candidateId) => input.check(id, candidateId),
        signal,
        onStage: input.onStage,
        model: input.model,
      },
    );
    if (!report.ok) return report;
    console.info(
      `[works:attempt] ${JSON.stringify({ draftId: id, episode: target.id, ...report.value, draft: undefined })}`,
    );
    if (report.value.outcome === "cancelled") return stop();
    if (report.value.outcome !== "playable") {
      return err(
        `episode-${report.value.outcome}`,
        "The episode's world did not pass the player check.",
        report.value.problems.join("\n") || undefined,
      );
    }
  }
  if (cancelled()) return stop();
  input.onStage("Saving the episode as a version…");
  const published = await window.seed.works.publishDraft(draftId);
  if (!published.ok) return published;
  if (cancelled()) return stop();
  const { manifest } = published.value;
  const work: WorkRef = {
    workId: manifest.workId,
    version: manifest.version,
    contentHash: manifest.contentHash,
  };
  const carry = useLandStore.getState().progress?.storyCarry ?? null;
  const play = await window.seed.works.createPlay({ title: target.title, worlds: [work], carry });
  if (!play.ok) return play;
  if (cancelled()) return stop();
  useLandStore.getState().setEpisode(target.id, { work, playId: play.value.playId });
  return ok({ work, playId: play.value.playId });
}
