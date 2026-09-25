// The card a story gate opens: which chapter this is, what it is about and how far the player has
// got. The chapter itself is never played in here — on the land it stands around the gate, a
// climb or a maze is entered from here. A chapter not written yet can be written from here (one
// model call); one already being written ahead is adopted, never asked for again, and closing the
// card leaves it running. Without a model the card says why instead of inventing anything.

import { readChapter } from "@renderer/engine2d/chapterLayer";
import { type Translate, useT } from "@renderer/i18n";
import { useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { chapterLeft } from "@shared/chapter";
import type { AppError } from "@shared/result";
import { episodeUnlocked, storyEpisodes } from "@shared/story";
import { type JSX, useEffect, useState } from "react";
import { startChapterJob, stopChapterJob, useChapterJobs } from "./chapterJobs";
import { CHAPTER_CANCELLED, chapterParts, enterChapterPlace } from "./chapters";

function todo(t: Translate, left: { talk: number; find: number; defeat: number }): string {
  const parts = [
    left.talk > 0 ? t("land.todoTalk", { n: left.talk }) : null,
    left.find > 0 ? t("land.todoFind", { n: left.find }) : null,
    left.defeat > 0 ? t("land.todoDefeat", { n: left.defeat }) : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? t("land.todoNone") : t("land.todoLeft", { list: parts.join(" · ") });
}

export function ChapterPanel(): JSX.Element | null {
  const t = useT();
  const episodeId = useSessionStore((state) => state.episodeOpen);
  const close = useSessionStore((state) => state.closeEpisode);
  const plan = useSessionStore((state) => state.activeInstance?.cartridge.story ?? null);
  const progress = useLandStore((state) => state.progress);
  const jobs = useChapterJobs();
  const [error, setError] = useState<AppError | null>(null);

  // A closed card forgets what went wrong on it; a chapter being written keeps being written.
  useEffect(() => {
    if (episodeId === null) setError(null);
  }, [episodeId]);

  if (episodeId === null) return null;
  const episodes = plan === null ? [] : storyEpisodes(plan, progress?.storyMore);
  const index = episodes.findIndex((entry) => entry.id === episodeId);
  const episode = episodes[index];
  if (plan === null || progress === null || episode === undefined) {
    return (
      <Card>
        <ErrorBlock
          error={{ code: "chapter-missing", message: "This world has no such chapter." }}
        />
        <Button onClick={close}>{t("land.backToLand")}</Button>
      </Card>
    );
  }
  const record = progress.episodes?.[episode.id] ?? null;
  const stage = record?.stage ?? null;
  const cleared = record?.cleared === true;
  const unlocked = episodeUnlocked(episodes, progress.episodes ?? {}, episode.id);
  const draft = stage?.kind === "land" ? readChapter(stage.source) : null;
  const instanceId = useLandStore.getState().instanceId;
  // The write in flight: this chapter's (adopted as it is), or another's (this one waits for it).
  const job = jobs.job;
  const writing = job?.instanceId === instanceId && job.episodeId === episode.id;
  const busyElsewhere = job !== null && !writing;
  const failure =
    jobs.failure?.instanceId === instanceId &&
    jobs.failure.episodeId === episode.id &&
    jobs.failure.error.code !== CHAPTER_CANCELLED
      ? jobs.failure.error
      : null;
  const shown = error ?? failure;

  const write = (): void => {
    setError(null);
    startChapterJob(episode);
  };

  const enter = (): void => {
    const entered = enterChapterPlace(episode);
    if (entered.ok) close();
    else setError(entered.error);
  };

  return (
    <Card>
      <Text variant="caption" tone="muted">
        {index < plan.episodes.length
          ? t("land.chapterOf", { n: index + 1, total: plan.episodes.length })
          : t("land.chapterByLand", { n: index + 1 })}{" "}
        · {episode.place}
      </Text>
      <Text variant="title" as="h2">
        {episode.title}
      </Text>
      <Text>{episode.brief}</Text>
      {cleared ? (
        <Text tone="success">{t("land.cleared", { summary: record?.summary ?? "" })}</Text>
      ) : null}
      {!unlocked ? (
        <Text tone="accent">
          {t("land.gateLocked", {
            title: episodes[index - 1]?.title ?? t("land.chapterBefore"),
          })}
        </Text>
      ) : null}
      {draft !== null && !cleared && stage !== null ? (
        <>
          <Text tone="accent">{draft.goal}</Text>
          <Text variant="caption" tone="muted">
            {t("land.chapterAround", { todo: todo(t, chapterLeft(chapterParts(draft), stage)) })}
          </Text>
        </>
      ) : null}
      {stage !== null && stage.kind !== "land" && !cleared ? (
        <Text variant="caption" tone="muted">
          {stage.kind === "side" ? t("land.chapterSide") : t("land.chapterDungeon")}
        </Text>
      ) : null}
      {writing ? (
        <Text tone="accent">
          {job?.stopping === true ? t("works.stopping") : t("land.chapterWriting")}
        </Text>
      ) : null}
      {shown === null ? null : <ErrorBlock error={shown} />}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {unlocked && !cleared && stage === null && !writing ? (
          <Button variant="primary" disabled={busyElsewhere} onClick={write}>
            {t("land.chapterWrite")}
          </Button>
        ) : null}
        {writing ? (
          <Button
            variant="destructive"
            disabled={job?.stopping === true}
            onClick={() => stopChapterJob("cancel")}
          >
            {t("common.cancel")}
          </Button>
        ) : null}
        {unlocked && !cleared && stage?.kind === "land" ? (
          <Button variant="primary" onClick={close}>
            {t("land.begin")}
          </Button>
        ) : null}
        {unlocked && stage !== null && stage.kind !== "land" ? (
          <Button variant="primary" onClick={enter}>
            {cleared ? t("land.playAgain") : t("land.enter")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={close}>
          {t("land.backToLand")}
        </Button>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      data-layer="chapter"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 110,
        display: "flex",
        justifyContent: "center",
        zIndex: 40,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="card"
        padding="lg"
        style={{ width: "min(640px, 94%)", gap: space.sm, pointerEvents: "auto" }}
      >
        {children}
      </Surface>
    </div>
  );
}
