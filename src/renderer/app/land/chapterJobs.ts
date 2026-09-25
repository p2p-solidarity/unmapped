// The one chapter being written, whoever asked for it. The background writer (EpisodePrefetch) and
// a gate's card (ChapterPanel) share it: opening the card while the chapter is written ahead adopts
// the call in flight instead of dropping its result and paying for a second one, and closing the
// card leaves it running. Every stop aborts the model call itself (the signal reaches the provider
// stream). Jobs and failures belong to one save, even when another save uses the same chapter id.

import { translate } from "@renderer/i18n";
import { useLandStore, useSessionStore } from "@renderer/state";
import type { ChapterStage } from "@shared/chapter";
import type { AppError, Result } from "@shared/result";
import type { StoryEpisode } from "@shared/story";
import { useSyncExternalStore } from "react";
import { CHAPTER_CANCELLED, writeChapter } from "./chapters";

/** Why a write stopped early: only Cancel waits for Retry; the others resume on their own. */
export type ChapterStop = "cancel" | "pause" | "unmount";

export interface ChapterJob {
  instanceId: string | null;
  episodeId: string;
  title: string;
  /** A stop was asked for and the call aborted; the job ends as soon as the call returns. */
  stopping: boolean;
  done: Promise<Result<ChapterStage>>;
}

export interface ChapterJobs {
  job: ChapterJob | null;
  /** The last write that failed or was cancelled, kept until someone retries it. */
  failure: { instanceId: string | null; episodeId: string; error: AppError } | null;
}

interface Running {
  job: ChapterJob;
  controller: AbortController;
  reason: ChapterStop | null;
}

let running: Running | null = null;
let snapshot: ChapterJobs = { job: null, failure: null };
const listeners = new Set<() => void>();

function publish(next: Partial<ChapterJobs>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

function settle(entry: Running, result: Result<ChapterStage>): void {
  if (running === entry) running = null;
  const { instanceId, episodeId, title } = entry.job;
  if (result.ok) {
    useSessionStore.getState().toast("success", translate("works.chapterReady", { title }));
    publish({ job: running?.job ?? null, failure: null });
    return;
  }
  // Pausing or leaving play resumes later on its own; a save that changed underneath reports
  // nothing. Cancel waits for Retry, and a real failure is never retried by itself (tokens).
  const cancelled = result.error.code === CHAPTER_CANCELLED;
  const failure =
    entry.reason === "cancel"
      ? {
          episodeId,
          instanceId,
          error: {
            code: CHAPTER_CANCELLED,
            message: "Cancelled; nothing was changed.",
            hint: "Retry when you want the next chapter written.",
          },
        }
      : cancelled
        ? snapshot.failure
        : { instanceId, episodeId, error: result.error };
  publish({ job: running?.job ?? null, failure });
}

/**
 * The write of `episode`: the one already in flight when there is one (whichever chapter it is —
 * callers compare `episodeId`), otherwise a new model call. Clears a remembered failure of it.
 */
export function startChapterJob(episode: StoryEpisode): ChapterJob {
  const instanceId = useLandStore.getState().instanceId;
  if (running !== null) {
    if (running.job.instanceId !== instanceId) stopChapterJob("unmount");
    return running.job;
  }
  const controller = new AbortController();
  let settleWith: (result: Result<ChapterStage>) => void = () => undefined;
  const done = new Promise<Result<ChapterStage>>((resolve) => {
    settleWith = resolve;
  });
  const entry: Running = {
    job: { instanceId, episodeId: episode.id, title: episode.title, stopping: false, done },
    controller,
    reason: null,
  };
  running = entry;
  const failure =
    snapshot.failure?.instanceId === instanceId && snapshot.failure.episodeId !== episode.id
      ? snapshot.failure
      : null;
  publish({ job: entry.job, failure });
  void writeChapter(episode, controller.signal).then((result) => {
    settle(entry, result);
    settleWith(result);
  });
  return entry.job;
}

/** Aborts the chapter being written (its call included); a no-op when none is. */
export function stopChapterJob(reason: ChapterStop): void {
  if (running === null || running.reason !== null) return;
  running.reason = reason;
  running.job = { ...running.job, stopping: true };
  running.controller.abort();
  publish({ job: running.job });
}

/** Forgets a remembered failure so the chapter may be written again. */
export function clearChapterFailure(): void {
  if (snapshot.failure !== null) publish({ failure: null });
}

export function getChapterJobs(): ChapterJobs {
  return snapshot;
}

export function useChapterJobs(): ChapterJobs {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getChapterJobs);
}
