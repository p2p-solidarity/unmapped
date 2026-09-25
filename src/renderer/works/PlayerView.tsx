// Plays a journey: the current world of a pinned play, its saved state restored on open, saves and
// completions written back through main, and the carry object handed to the next world. Restart
// clears only this world's state; Reload opens a fresh session with the saved state (after a
// fault); Exit leaves progress exactly where the last save put it.

import { useT } from "@renderer/i18n";
import { Button, colors, ErrorBlock, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import type { Json, WorkPlay } from "@shared/works";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { type FrameEvent, WorkFrame } from "./WorkFrame";

interface Completed {
  summary: string;
}

export function PlayerView({
  playId,
  onExit,
  onComplete,
}: {
  playId: string;
  onExit: () => void;
  /** Called once a world reports completion, with the carry it handed on. */
  onComplete?: (summary: string, carry: Json) => void;
}): JSX.Element {
  const t = useT();
  const [play, setPlay] = useState<WorkPlay | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [status, setStatus] = useState<string>("");
  const [completed, setCompleted] = useState<Completed | null>(null);
  const [fault, setFault] = useState<AppError | null>(null);
  // The world a session was opened on. Saves and completions are bound to it, so a late message
  // from the previous world can never land in the next world's slot.
  const sessionWorld = useRef<number | null>(null);

  const load = useCallback(async () => {
    const result = await window.seed.works.readPlay(playId);
    if (result.ok) setPlay(result.value);
    else setError(result.error);
  }, [playId]);
  useEffect(() => {
    void load();
  }, [load]);

  const change = async (next: Parameters<typeof window.seed.works.changePlay>[1]) => {
    const result = await window.seed.works.changePlay(playId, next);
    if (result.ok) setPlay(result.value);
    else setError(result.error);
    return result;
  };

  const world = play?.current ?? 0;

  const onEvent = (event: FrameEvent): void => {
    if (event.kind === "opened") {
      sessionWorld.current = event.session.world;
      setFault(null);
      setStatus("");
      return;
    }
    if (event.kind === "fault") {
      setFault(event.error);
      return;
    }
    if (event.kind !== "message") return;
    const message = event.message;
    const owner = sessionWorld.current;
    if (owner === null) return;
    if (message.type === "save") void change({ kind: "save", world: owner, state: message.state });
    else if (message.type === "status") setStatus(message.text);
    else if (message.type === "error")
      setStatus(t("works.worldError", { message: message.message.split("\n")[0] ?? "" }));
    else if (message.type === "complete") {
      void change({
        kind: "complete",
        world: owner,
        summary: message.summary,
        carry: message.carry,
      });
      setCompleted({ summary: message.summary });
      onComplete?.(message.summary, message.carry);
    }
  };

  const next = async (): Promise<void> => {
    if (play === null || world + 1 >= play.worlds.length) return;
    const moved = await change({ kind: "goto", world: world + 1 });
    if (moved.ok) {
      setCompleted(null);
      setRunKey((key) => key + 1);
    }
  };

  const restart = async (): Promise<void> => {
    const cleared = await change({ kind: "restart", world });
    if (cleared.ok) {
      setCompleted(null);
      setRunKey((key) => key + 1);
    }
  };

  if (error !== null) {
    return (
      <div style={{ padding: space.xl, display: "flex", flexDirection: "column", gap: space.md }}>
        <ErrorBlock error={error} />
        <Button onClick={onExit}>{t("common.back")}</Button>
      </div>
    );
  }
  if (play === null) {
    return (
      <div style={{ padding: space.xl }}>
        <Text tone="muted">{t("works.openingJourney")}</Text>
      </div>
    );
  }

  const last = world + 1 >= play.worlds.length;
  const ref = play.worlds[world];
  // A world cleared in an earlier sitting still lets the player move on after reopening.
  const clearedBefore = play.completions.some((entry) => entry.world === world);
  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", background: colors.bg }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: space.md,
          padding: `${space.sm}px ${space.lg}px`,
          borderBottom: `1px solid ${colors.surfaceBorder}`,
        }}
      >
        <Button variant="ghost" onClick={onExit}>
          {t("works.exit")}
        </Button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text>{play.title}</Text>
          <Text variant="caption" tone="muted">
            {" "}
            ·{" "}
            {t("works.playerLine", {
              current: world + 1,
              total: play.worlds.length,
              ref: `${ref?.workId}@${ref?.version}`,
              carry: JSON.stringify(play.carry) ?? "null",
            })}
          </Text>
        </div>
        <Text variant="caption" tone="muted">
          {status}
        </Text>
        {clearedBefore && !last && completed === null ? (
          <Button variant="primary" onClick={() => void next()}>
            {t("works.nextWorld")}
          </Button>
        ) : null}
        <Button onClick={() => void restart()}>{t("works.restartWorld")}</Button>
        <Button onClick={() => setRunKey((key) => key + 1)}>{t("common.reload")}</Button>
      </div>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <WorkFrame
          source={{ kind: "play", playId }}
          runKey={runKey}
          mode="play"
          onEvent={onEvent}
        />
        {fault === null ? null : (
          <div style={{ position: "absolute", left: space.lg, bottom: space.lg, maxWidth: 520 }}>
            <Button variant="primary" onClick={() => setRunKey((key) => key + 1)}>
              {t("works.reloadWorld")}
            </Button>
          </div>
        )}
        {completed === null ? null : (
          <div
            style={{
              position: "absolute",
              left: "50%",
              bottom: space.xl,
              transform: "translateX(-50%)",
              background: colors.bgOverlay,
              border: `1px solid ${colors.gold}`,
              padding: space.lg,
              display: "flex",
              flexDirection: "column",
              gap: space.sm,
              maxWidth: 560,
            }}
          >
            <Text tone="accent">{t("works.worldCleared")}</Text>
            <Text>{completed.summary || t("works.noSummary")}</Text>
            <Text variant="caption" tone="muted">
              {t("works.carriedForward", { carry: JSON.stringify(play.carry) ?? "null" })}
            </Text>
            {last ? (
              <Text tone="success">{t("works.journeyComplete")}</Text>
            ) : (
              <Button variant="primary" onClick={() => void next()}>
                {t("works.nextWorld")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
