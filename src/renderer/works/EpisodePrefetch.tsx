// Writes the story ahead while the player walks: the next chapter's people, finds and foes (or its
// climb or maze) are written in the background, so they already stand at its gate when the player
// arrives. When every chapter so far is cleared the land first writes the next one (one
// `@@episode`, up to STORY_CAP) and then its contents. One job at a time. A chapter's write is the
// shared job of `chapterJobs.ts`: a gate's card opened meanwhile adopts it rather than restarting
// it, and no new job starts while a card is open. A failure is never retried on its own, because
// that burns tokens — the card says what failed and offers Retry. Every stop aborts the model call
// itself. Pausing is a per-device preference (localStorage, Rule 2).

import { useRefreshProbe } from "@renderer/app/inferenceSync";
import {
  type ChapterStop,
  clearChapterFailure,
  startChapterJob,
  stopChapterJob,
  useChapterJobs,
} from "@renderer/app/land/chapterJobs";
import { CHAPTER_CANCELLED } from "@renderer/app/land/chapters";
import { writeNextEpisode } from "@renderer/app/land/storyMore";
import { contentLanguage, translate, useT } from "@renderer/i18n";
import { useHistoryStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, ErrorBlock, Surface, space, Text, zIndex } from "@renderer/ui";
import { bibleLanguage, type WorldBible } from "@shared/cartridge";
import type { InferenceConfig, ProbeResult } from "@shared/llm";
import type { AppError, Loadable } from "@shared/result";
import { storyEpisodes, storyStep } from "@shared/story";
import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react";

const PAUSE_KEY = "unwritten.story.prefetchPaused";

function readPaused(): boolean {
  try {
    return localStorage.getItem(PAUSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writePaused(paused: boolean): void {
  try {
    if (paused) localStorage.setItem(PAUSE_KEY, "1");
    else localStorage.removeItem(PAUSE_KEY);
  } catch {
    // A preference that cannot be stored only lasts for this session.
  }
}

/** Writing the next chapter's entry (`@@episode`): this card's own job, not a chapter's write. */
interface ContinueJob {
  stopping: boolean;
}

/** Null when the model can be asked; "waiting" while its reachability is still being checked. */
function modelProblem(
  config: InferenceConfig | null,
  probe: Loadable<ProbeResult>,
): AppError | "waiting" | null {
  if (config === null) {
    return {
      code: "story-no-model",
      message: "No model is configured, so the next chapter is not written ahead.",
      hint: "Configure a provider in Console → Inference. Walking and played episodes still work.",
    };
  }
  if (probe.status === "idle" || probe.status === "loading") return "waiting";
  if (probe.status === "error" || !probe.value.reachable) {
    return {
      code: "story-model-offline",
      message: "The model is not reachable, so the next chapter is not written ahead.",
      hint: "Start the model or check the provider in Console → Inference, then Retry.",
    };
  }
  return null;
}

function languageOf(bible: WorldBible): string {
  return useWorldStore.getState().genesis?.language ?? bibleLanguage(bible) ?? contentLanguage();
}

const card: CSSProperties = {
  position: "absolute",
  right: space.lg,
  bottom: 120,
  width: 320,
  zIndex: zIndex.hud,
  pointerEvents: "auto",
  gap: space.sm,
};

export function EpisodePrefetch(): JSX.Element | null {
  const t = useT();
  const active = useSessionStore((state) => state.activeInstance);
  const episodeOpen = useSessionStore((state) => state.episodeOpen);
  const peer = useSessionStore((state) => state.networkRole === "peer");
  const progress = useLandStore((state) => state.progress);
  const landInstance = useLandStore((state) => state.instanceId);
  // Opening a save reads (or migrates) its world's history first; a chapter started meanwhile
  // would fail as `world-loading` and wait for Retry, so the writer waits for the read instead.
  const readingWorld = useHistoryStore((state) => state.world.status === "loading");
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();
  const shared = useChapterJobs();
  const [paused, setPaused] = useState(readPaused);
  const [next, setNext] = useState<ContinueJob | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const stopReason = useRef<ChapterStop | null>(null);
  const mounted = useRef(true);

  const plan = active?.cartridge.story ?? null;
  const bible = active?.cartridge.bible ?? null;
  const episodes = plan === null ? [] : storyEpisodes(plan, progress?.storyMore);
  const step =
    plan === null || progress === null ? null : storyStep(episodes, progress.episodes ?? {});
  const stepKey =
    step === null
      ? null
      : step.kind === "prepare" || step.kind === "ready"
        ? `${step.kind}:${step.episode.id}`
        : step.kind;
  const wanted = step?.kind === "prepare" || step?.kind === "continue";
  const model = modelProblem(config, probe);
  const landReady = landInstance !== null && landInstance === active?.instance.meta.instanceId;
  // A chapter that failed (or was cancelled) waits for Retry, here or on its gate's card.
  const failed =
    step?.kind === "prepare" &&
    shared.failure?.instanceId === landInstance &&
    shared.failure.episodeId === step.episode.id
      ? shared.failure.error
      : null;
  const canRun =
    wanted &&
    !paused &&
    !peer &&
    episodeOpen === null &&
    landReady &&
    !readingWorld &&
    bible !== null &&
    model === null &&
    error === null &&
    failed === null &&
    next === null &&
    shared.job === null;

  const stop = useCallback((reason: ChapterStop): void => {
    stopChapterJob(reason);
    if (controller.current === null) return;
    stopReason.current = reason;
    controller.current.abort();
    setNext((current) => (current === null ? current : { stopping: true }));
  }, []);

  /** Writes the next chapter's entry onto the story's map (the `continue` step). */
  const continueStory = async (): Promise<void> => {
    if (controller.current !== null) return;
    const session = useSessionStore.getState().activeInstance;
    const land = useLandStore.getState();
    const story = session?.cartridge.story ?? null;
    const worldBible = session?.cartridge.bible ?? null;
    if (story === null || worldBible === null || land.progress === null) return;
    const all = storyEpisodes(story, land.progress.storyMore);
    const abort = new AbortController();
    controller.current = abort;
    stopReason.current = null;
    const instanceId = land.instanceId;
    setNext({ stopping: false });
    // The world's history keeps the episode (a `story.more` event, or the save before it has one).
    const written = await writeNextEpisode({
      logline: story.logline,
      episodes: all,
      progress: land.progress.episodes ?? {},
      carry: land.progress.storyCarry ?? null,
      language: languageOf(worldBible),
      bible: worldBible,
      combat: (useWorldStore.getState().gameplayRules?.combat ?? null) !== null,
      signal: abort.signal,
    });
    // A reply that made it back before a stop is kept: it is paid for, and resuming would ask again.
    const sameLand = useLandStore.getState().instanceId === instanceId;
    if (written.ok && sameLand) {
      const { title, place } = written.value;
      const line = translate("works.newChapterOnMap", { title, place });
      useSessionStore.getState().toast("success", line);
    }
    controller.current = null;
    const reason = stopReason.current;
    if (!mounted.current) return;
    setNext(null);
    if (written.ok) return;
    if (abort.signal.aborted) {
      if (reason === "cancel") {
        setError({
          code: CHAPTER_CANCELLED,
          message: "Cancelled; nothing was changed.",
          hint: "Retry when you want the next chapter written ahead.",
        });
      }
      return;
    }
    setError(written.error);
  };

  /** One job: read the latest state, write the next chapter or the next chapter's entry. */
  const run = (): void => {
    const session = useSessionStore.getState().activeInstance;
    const land = useLandStore.getState();
    const story = session?.cartridge.story ?? null;
    if (story === null || land.progress === null) return;
    const now = storyStep(
      storyEpisodes(story, land.progress.storyMore),
      land.progress.episodes ?? {},
    );
    if (now.kind === "prepare") startChapterJob(now.episode);
    else if (now.kind === "continue") void continueStory();
  };

  // Leaving play or switching saves stops the old job. (StrictMode's rehearsal unmount lands here
  // too; the job it stops then ends like a pause and the next one starts on the real mount.)
  // biome-ignore lint/correctness/useExhaustiveDependencies: a save change deliberately runs this cleanup
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopChapterJob("unmount");
      stopReason.current = "unmount";
      controller.current?.abort();
    };
  }, [landInstance]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run reads the latest stores itself; stepKey is the step's identity
  useEffect(() => {
    if (canRun) run();
  }, [canRun, stepKey]);

  const setPause = (nextPaused: boolean): void => {
    writePaused(nextPaused);
    setPaused(nextPaused);
    if (nextPaused) stop("pause");
  };

  const retry = (): void => {
    setError(null);
    clearChapterFailure();
    refreshProbe();
  };

  if (plan === null || peer) return null;

  const job = shared.job;
  if (job !== null || next !== null) {
    const stopping = job?.stopping === true || next?.stopping === true;
    return (
      <Surface variant="overlay" padding="sm" style={card}>
        <Text variant="caption" tone="muted">
          {t("works.writingAhead", { label: job?.title ?? t("works.landNextChapter") })}
        </Text>
        <Text variant="caption" tone="accent">
          {stopping ? t("works.stopping") : t("works.askingModel")}
        </Text>
        <div style={{ display: "flex", gap: space.sm }}>
          <Button variant="secondary" disabled={stopping} onClick={() => setPause(true)}>
            {t("works.pause")}
          </Button>
          <Button variant="ghost" disabled={stopping} onClick={() => stop("cancel")}>
            {t("common.cancel")}
          </Button>
        </div>
      </Surface>
    );
  }

  if (!wanted) return null;

  if (paused) {
    return (
      <Surface variant="overlay" padding="sm" style={card}>
        <Text variant="caption" tone="muted">
          {t("works.pausedNote")}
        </Text>
        <Button variant="secondary" onClick={() => setPause(false)}>
          {t("common.resume")}
        </Button>
      </Surface>
    );
  }

  const shown = error ?? failed ?? (model === "waiting" ? null : model);
  if (shown === null) return null;
  return (
    <Surface variant="overlay" padding="sm" style={card}>
      <Text variant="caption" tone="muted">
        {t("works.notWrittenAhead")}
      </Text>
      <ErrorBlock error={shown} />
      <div style={{ display: "flex", gap: space.sm }}>
        <Button variant="secondary" onClick={retry}>
          {t("works.retry")}
        </Button>
        <Button variant="ghost" onClick={() => setPause(true)}>
          {t("works.pause")}
        </Button>
      </div>
    </Surface>
  );
}
