// A story episode's gate on the open land. The first visit writes the episode's world with the
// same generate → check → repair loop as the workshop, publishes it as an immutable revision and
// starts a one-world journey carrying the story so far; later visits resume that journey. Clearing
// it marks the episode, merges what the world handed back into the story's carry, and records the
// clear in karma. Nothing here is invented: no model, no world — the panel says why.

import { makeKarmaEntry } from "@renderer/app/karmaFile";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import { Button, colors, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { episodeRequest, episodeUnlocked, mergeCarry, type StoryEpisode } from "@shared/story";
import type { Json } from "@shared/works";
import { type JSX, useEffect, useRef, useState } from "react";
import { runAttempt } from "./author";
import { PlayerView } from "./PlayerView";
import { useChecker } from "./useChecker";

function fail(code: string, message: string, hint?: string): AppError {
  return hint === undefined ? { code, message } : { code, message, hint };
}

export function EpisodePanel(): JSX.Element | null {
  const episodeId = useSessionStore((state) => state.episodeOpen);
  const close = useSessionStore((state) => state.closeEpisode);
  const active = useSessionStore((state) => state.activeInstance);
  const progress = useLandStore((state) => state.progress);
  const model = useInferenceStore((state) => state.config?.model ?? null);
  const { checkCandidate, checker } = useChecker(200);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // However the panel closes (button, Esc, leaving play), an unfinished generation stops with it.
  useEffect(() => {
    if (episodeId !== null) return;
    controller.current?.abort();
    setPlaying(false);
    setStage(null);
    setError(null);
  }, [episodeId]);

  if (episodeId === null) return null;
  const plan = active?.cartridge.story ?? null;
  const bible = active?.cartridge.bible ?? null;
  const episode = plan?.episodes.find((entry) => entry.id === episodeId) ?? null;
  const record = progress?.episodes?.[episodeId] ?? null;
  const index = plan?.episodes.findIndex((entry) => entry.id === episodeId) ?? -1;

  const shut = (): void => {
    controller.current?.abort();
    setPlaying(false);
    setError(null);
    setStage(null);
    setNotice(null);
    close();
  };

  /** Writes an episode's world (generate → check → publish → journey) without opening it. */
  const prepare = async (target: StoryEpisode, andPlay = true): Promise<void> => {
    if (plan === null || bible === null) return;
    const land = useLandStore.getState();
    const signal = new AbortController();
    controller.current = signal;
    setError(null);
    setStage("Preparing the episode…");
    // Cancel must hold between steps too: the model call is only one of several awaits.
    const cancelled = (): boolean => signal.signal.aborted;
    const stop = (): void => finish(fail("episode-cancelled", "Cancelled; nothing was changed."));
    let draftId = land.progress?.episodes?.[target.id]?.draftId ?? null;
    if (draftId === null) {
      const created = await window.seed.works.createDraft(target.title);
      if (!created.ok) return finish(created.error);
      draftId = created.value.draftId;
      land.setEpisode(target.id, { draftId });
    }
    if (cancelled()) return stop();
    const draft = await window.seed.works.readDraft(draftId);
    if (!draft.ok) return finish(draft.error);
    if (cancelled()) return stop();
    if (draft.value.head === null) {
      const id = draftId;
      const report = await runAttempt(
        draft.value,
        "generate",
        episodeRequest(plan, target, bible),
        {
          check: (candidateId) => checkCandidate(id, candidateId),
          signal: signal.signal,
          onStage: setStage,
          model,
        },
      );
      if (!report.ok) return finish(report.error);
      console.info(
        `[works:attempt] ${JSON.stringify({ draftId: id, episode: target.id, ...report.value, draft: undefined })}`,
      );
      if (report.value.outcome !== "playable") {
        return finish(
          fail(
            `episode-${report.value.outcome}`,
            report.value.outcome === "cancelled"
              ? "Cancelled; nothing was changed."
              : "The episode's world did not pass the player check.",
            report.value.problems.join("\n") || undefined,
          ),
        );
      }
    }
    if (cancelled()) return stop();
    setStage("Saving the episode as a version…");
    const published = await window.seed.works.publishDraft(draftId);
    if (!published.ok) return finish(published.error);
    if (cancelled()) return stop();
    const { manifest } = published.value;
    const work = {
      workId: manifest.workId,
      version: manifest.version,
      contentHash: manifest.contentHash,
    };
    const carry = useLandStore.getState().progress?.storyCarry ?? null;
    const play = await window.seed.works.createPlay({ title: target.title, worlds: [work], carry });
    if (!play.ok) return finish(play.error);
    if (cancelled()) return stop();
    useLandStore.getState().setEpisode(target.id, { work, playId: play.value.playId });
    finish(null);
    if (andPlay) setPlaying(true);
    else setNotice(`“${target.title}” is ready at its gate.`);
  };

  function finish(problem: AppError | null): void {
    controller.current = null;
    setStage(null);
    setError(problem);
  }

  const cleared = (target: StoryEpisode, summary: string, carry: Json): void => {
    const land = useLandStore.getState();
    const before = land.progress?.storyCarry ?? null;
    land.setEpisode(target.id, { cleared: true, summary });
    land.setStoryCarry(mergeCarry(before, carry));
    const world = useWorldStore.getState();
    world.appendKarma(
      makeKarmaEntry({
        floor: world.floor,
        action: "witness",
        choice: `cleared episode ${target.title}`,
        effect: summary,
        chunk: { cx: target.cx, cz: target.cz },
      }),
    );
    useSessionStore.getState().toast("success", `Episode cleared: ${target.title}`);
  };

  const frame = {
    position: "absolute" as const,
    inset: 0,
    zIndex: 40,
    background: colors.bg,
    display: "flex",
    flexDirection: "column" as const,
  };

  if (plan === null || episode === null || bible === null || progress === null) {
    return (
      <div style={{ ...frame, padding: space.xl, gap: space.md }}>
        <ErrorBlock
          error={fail(
            "episode-missing",
            "This world has no such episode.",
            "Close and keep walking.",
          )}
        />
        <Button onClick={shut}>Close</Button>
      </div>
    );
  }

  if (playing && record?.playId) {
    return (
      <div style={frame}>
        <PlayerView
          playId={record.playId}
          onExit={() => setPlaying(false)}
          onComplete={(summary, carry) => cleared(episode, summary, carry)}
        />
      </div>
    );
  }

  const unlocked = episodeUnlocked(plan, progress.episodes ?? {}, episode.id);
  const previous = plan.episodes[index - 1];
  const after = plan.episodes[index + 1];
  const upcoming =
    after !== undefined && (progress.episodes?.[after.id]?.playId ?? null) === null ? after : null;
  const busy = stage !== null;
  return (
    <div style={{ ...frame, alignItems: "center", justifyContent: "center", padding: space.xl }}>
      <Surface variant="card" padding="xl" style={{ width: "min(720px, 94%)", gap: space.md }}>
        <Text variant="caption" tone="muted">
          Episode {index + 1} / {plan.episodes.length} · {episode.place} · {episode.kind}
        </Text>
        <Text variant="title" as="h2">
          {episode.title}
        </Text>
        <Text>{episode.brief}</Text>
        <Text variant="caption" tone="dim">
          Carried from earlier episodes: {JSON.stringify(progress.storyCarry ?? null)}
        </Text>
        {record?.cleared ? <Text tone="success">Cleared — {record.summary ?? ""}</Text> : null}
        {!unlocked ? (
          <Text tone="accent">
            This gate opens after “{previous?.title ?? "the previous episode"}” is cleared.
          </Text>
        ) : null}
        {stage === null ? null : <Text tone="accent">{stage}</Text>}
        {notice === null ? null : <Text tone="success">{notice}</Text>}
        {/* Once this one is done, the next world can be written while the player is still here, so
            its gate opens without a wait. Explicit: writing a world costs model time. */}
        {record?.cleared && upcoming !== null && !busy ? (
          <Button variant="secondary" onClick={() => void prepare(upcoming, false)}>
            Prepare the next episode now · {upcoming.title}
          </Button>
        ) : null}
        {checker}
        {error === null ? null : <ErrorBlock error={error} />}
        <div style={{ display: "flex", gap: space.sm }}>
          {unlocked && !busy ? (
            <Button
              variant="primary"
              onClick={() => {
                if (record?.playId) setPlaying(true);
                else void prepare(episode);
              }}
            >
              {record?.playId
                ? record.cleared
                  ? "Play again"
                  : "Continue"
                : "Enter (the world is written now)"}
            </Button>
          ) : null}
          {busy ? (
            <Button variant="destructive" onClick={() => controller.current?.abort()}>
              Cancel
            </Button>
          ) : null}
          <Button variant="ghost" onClick={shut}>
            Back to the land
          </Button>
        </div>
      </Surface>
    </div>
  );
}
