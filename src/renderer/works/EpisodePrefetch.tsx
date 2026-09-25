// Writes the story ahead while the player walks: the next episode's world is generated, checked and
// published in the background, so its gate opens at once. When every episode so far is cleared the
// land first writes the next chapter (one `@@episode`, up to STORY_CAP) and then its world.
// One job at a time; none while a gate's panel is open (the panel owns generation then — a job in
// flight stops and resumes after); a failure is never retried on its own, because that burns
// tokens — the card says what failed and offers Retry. The check frame lives in this card: a hidden
// frame gets no animation frames. Pausing is a per-device preference (localStorage, Rule 2).

import { useRefreshProbe } from "@renderer/app/inferenceSync";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, ErrorBlock, Surface, space, Text, zIndex } from "@renderer/ui";
import { bibleLanguage, type WorldBible } from "@shared/cartridge";
import type { InferenceConfig, ProbeResult } from "@shared/llm";
import type { AppError, Loadable } from "@shared/result";
import { storyEpisodes, storyStep } from "@shared/story";
import { type CSSProperties, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { writeNextChapter } from "./continueStory";
import { EPISODE_CANCELLED, prepareEpisode } from "./prepareEpisode";
import { useChecker } from "./useChecker";

const PAUSE_KEY = "unwritten.story.prefetchPaused";
const CHECK_HEIGHT = 150;

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

/** Why a job stopped early: only Cancel waits for Retry; the others resume on their own. */
type StopReason = "cancel" | "pause" | "panel" | "unmount";

interface Job {
  /** What is being written, for the card. */
  label: string;
  stage: string;
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
  return useWorldStore.getState().genesis?.language ?? bibleLanguage(bible) ?? navigator.language;
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
  const active = useSessionStore((state) => state.activeInstance);
  const episodeOpen = useSessionStore((state) => state.episodeOpen);
  const peer = useSessionStore((state) => state.networkRole === "peer");
  const progress = useLandStore((state) => state.progress);
  const landInstance = useLandStore((state) => state.instanceId);
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const refreshProbe = useRefreshProbe();
  const { checkCandidate, checker } = useChecker(CHECK_HEIGHT);
  const [paused, setPaused] = useState(readPaused);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const controller = useRef<AbortController | null>(null);
  const stopReason = useRef<StopReason | null>(null);
  const running = useRef(false);
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
  const canRun =
    wanted &&
    !paused &&
    !peer &&
    episodeOpen === null &&
    landReady &&
    bible !== null &&
    model === null &&
    error === null &&
    job === null;

  const stop = useCallback((reason: StopReason): void => {
    if (controller.current === null) return;
    stopReason.current = reason;
    controller.current.abort();
    setJob((current) => (current === null ? current : { ...current, stopping: true }));
  }, []);

  /** One job: read the latest state, write the next episode's world or the next chapter. */
  const run = async (): Promise<void> => {
    if (running.current) return;
    const session = useSessionStore.getState().activeInstance;
    const land = useLandStore.getState();
    const story = session?.cartridge.story ?? null;
    const worldBible = session?.cartridge.bible ?? null;
    if (story === null || worldBible === null || land.progress === null) return;
    const all = storyEpisodes(story, land.progress.storyMore);
    const next = storyStep(all, land.progress.episodes ?? {});
    if (next.kind !== "prepare" && next.kind !== "continue") return;
    running.current = true;
    const abort = new AbortController();
    controller.current = abort;
    stopReason.current = null;
    const instanceId = land.instanceId;
    setJob({
      label: next.kind === "prepare" ? next.episode.title : "the land's next chapter",
      stage: next.kind === "prepare" ? "Preparing the episode…" : "Asking the model…",
      stopping: false,
    });
    const onStage = (stage: string): void =>
      setJob((current) => (current === null ? current : { ...current, stage }));
    const toast = useSessionStore.getState().toast;
    let problem: AppError | null = null;
    if (next.kind === "prepare") {
      const prepared = await prepareEpisode({
        target: next.episode,
        episodes: all,
        logline: story.logline,
        bible: worldBible,
        check: checkCandidate,
        signal: abort.signal,
        onStage,
        model: useInferenceStore.getState().config?.model ?? null,
      });
      if (prepared.ok)
        toast("success", `“${next.episode.title}” is written and waits at its gate.`);
      else problem = prepared.error;
    } else {
      const written = await writeNextChapter({
        logline: story.logline,
        episodes: all,
        progress: land.progress.episodes ?? {},
        carry: land.progress.storyCarry ?? null,
        language: languageOf(worldBible),
        bible: worldBible,
        signal: abort.signal,
      });
      const sameLand = useLandStore.getState().instanceId === instanceId;
      if (written.ok && sameLand && stopReason.current !== "cancel") {
        useLandStore.getState().addEpisode(written.value);
        toast(
          "success",
          `A new chapter is on the map: ${written.value.title} (${written.value.place})`,
        );
      } else if (!written.ok) problem = written.error;
    }
    running.current = false;
    controller.current = null;
    const reason = stopReason.current;
    if (!mounted.current) return;
    setJob(null);
    if (abort.signal.aborted) {
      if (reason === "cancel") {
        setError({
          code: EPISODE_CANCELLED,
          message: "Cancelled; nothing was changed.",
          hint: "Retry when you want the next chapter written ahead.",
        });
      }
      return;
    }
    // A cancel without an abort means the save changed underneath: nothing to report here.
    if (problem !== null && problem.code !== EPISODE_CANCELLED) setError(problem);
  };

  // Leaving play stops the job. (StrictMode's rehearsal unmount lands here too; the job it stops
  // then ends like a pause and the next one starts on the real mount.)
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopReason.current = "unmount";
      controller.current?.abort();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run reads the latest stores itself; stepKey is the step's identity
  useEffect(() => {
    if (canRun) void run();
  }, [canRun, stepKey]);

  // The gate's panel owns generation while it is open.
  useEffect(() => {
    if (episodeOpen !== null) stop("panel");
  }, [episodeOpen, stop]);

  const setPause = (next: boolean): void => {
    writePaused(next);
    setPaused(next);
    if (next) stop("pause");
  };

  const retry = (): void => {
    setError(null);
    refreshProbe();
  };

  if (plan === null || peer) return null;

  if (job !== null) {
    return (
      <Surface variant="overlay" padding="sm" style={card}>
        <Text variant="caption" tone="muted">
          Writing the next chapter… · {job.label}
        </Text>
        <Text variant="caption" tone="accent">
          {job.stopping ? "Stopping after the current step…" : job.stage}
        </Text>
        {checker}
        <div style={{ display: "flex", gap: space.sm }}>
          <Button variant="secondary" disabled={job.stopping} onClick={() => setPause(true)}>
            Pause
          </Button>
          <Button variant="ghost" disabled={job.stopping} onClick={() => stop("cancel")}>
            Cancel
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
          Writing the next chapter ahead is paused.
        </Text>
        <Button variant="secondary" onClick={() => setPause(false)}>
          Resume
        </Button>
      </Surface>
    );
  }

  const shown = error ?? (model === "waiting" ? null : model);
  if (shown === null) return null;
  return (
    <Surface variant="overlay" padding="sm" style={card}>
      <Text variant="caption" tone="muted">
        The next chapter is not written ahead.
      </Text>
      <ErrorBlock error={shown} />
      <div style={{ display: "flex", gap: space.sm }}>
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
        <Button variant="ghost" onClick={() => setPause(true)}>
          Pause
        </Button>
      </div>
    </Surface>
  );
}
