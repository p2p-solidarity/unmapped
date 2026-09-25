// Create a game, the look step (看樣子): three low-quality concept pictures drawn from the Look card,
// one to choose as the world's look (published as `assets/look.png` and the reference for its later
// pictures), a redraw, or none. The story plan is written beside it (StoryAheadPanel), so there is
// always something happening. With no image key the error says how to add one, and going on
// without a picture still works.

import { useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { DraftLook, DraftStory } from "@shared/createDraft";
import { type JSX, useEffect, useState } from "react";
import { StreamPreview } from "./StreamPreview";
import { STAGE_LABEL } from "./stages";
import type { LookPictures } from "./useLookPictures";
import type { StoryAhead } from "./useStoryAhead";

/** Seconds since `started`, ticking once a second while shown. */
function useSeconds(started: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (started === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  return started === null ? 0 : Math.max(0, Math.floor((now - started) / 1000));
}

export function LookStep({
  look,
  looks,
  lookCard,
  busy,
}: {
  look: DraftLook | undefined;
  looks: LookPictures;
  lookCard: string;
  busy: boolean;
}): JSX.Element {
  const t = useT();
  const [drawStarted, setDrawStarted] = useState<number | null>(null);
  const drawing = looks.drawing > 0;
  useEffect(() => setDrawStarted(drawing ? Date.now() : null), [drawing]);
  const seconds = useSeconds(drawStarted);
  const ids = look?.pictures ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
      <Text variant="title" as="h2">
        {t("create.lookTitle")}
      </Text>
      <Text tone="muted">{t("create.lookNote")}</Text>
      <Text variant="caption" tone="dim">
        {t("create.partLook")}: {lookCard}
      </Text>
      <StatePanel state={looks.pictures} loadingText={t("create.lookLoading")}>
        {(pictures) => (
          <div
            data-look-pictures=""
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: space.md,
            }}
          >
            {ids.map((id, at) => {
              const url = pictures[id];
              const chosen = look?.chosen === id;
              return (
                <Button
                  key={id}
                  variant="tile"
                  active={chosen}
                  disabled={busy}
                  onClick={() => looks.pick(id)}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
                    {url === undefined ? (
                      <Text variant="caption" tone="danger">
                        {t("create.lookMissing")}
                      </Text>
                    ) : (
                      <img
                        src={url}
                        alt={t("create.lookPicture", { n: at + 1 })}
                        style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }}
                      />
                    )}
                    <Text variant="caption" tone={chosen ? "accent" : "muted"}>
                      {chosen ? t("create.lookChosen") : t("create.lookPick", { n: at + 1 })}
                    </Text>
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </StatePanel>
      {drawing ? (
        <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
          <Text tone="accent">
            {t("create.lookDrawing", { n: looks.drawing })} · {t("create.elapsed", { s: seconds })}
          </Text>
          <Button variant="destructive" onClick={() => looks.cancel()}>
            {t("create.lookCancel")}
          </Button>
        </Surface>
      ) : (
        <Button disabled={busy} onClick={() => void looks.draw()}>
          {ids.length === 0 ? t("create.lookDraw") : t("create.lookRedraw")}
        </Button>
      )}
      {looks.error !== null && (
        <>
          <ErrorBlock error={looks.error} />
          <Text variant="caption" tone="muted">
            {t("create.lookWithout")}
          </Text>
        </>
      )}
    </div>
  );
}

/**
 * The story plan being written ahead, as it streams; Cancel keeps nothing. Once written, the look
 * step keeps showing it (its logline and chapter titles), so the player sees what is ready.
 */
export function StoryAheadPanel({
  ahead,
  story = null,
}: {
  ahead: StoryAhead;
  story?: DraftStory | null;
}): JSX.Element | null {
  const t = useT();
  const seconds = useSeconds(ahead.writing?.started ?? null);
  if (ahead.writing === null) {
    if (story === null) return null;
    return (
      <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
        <Text tone="accent">{t("create.storyAheadReady", { n: story.chapters.length })}</Text>
        {story.logline === "" ? null : <Text variant="caption">{story.logline}</Text>}
        {story.chapters.map((chapter, index) => (
          <Text key={chapter.key} variant="caption" tone="dim">
            {index + 1}. {chapter.title}
          </Text>
        ))}
      </Surface>
    );
  }
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.xs }}>
      <Text tone="accent">
        {t(STAGE_LABEL.story)} · {t("create.elapsed", { s: seconds })}
      </Text>
      <Text variant="caption" tone="dim">
        {t("create.storyAheadNote")}
      </Text>
      {ahead.writing.text === "" ? null : <StreamPreview stage="story" text={ahead.writing.text} />}
      <Button variant="destructive" onClick={() => ahead.cancel()}>
        {t("create.storyAheadCancel")}
      </Button>
    </Surface>
  );
}
