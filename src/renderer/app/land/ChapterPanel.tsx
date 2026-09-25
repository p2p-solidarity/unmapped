// The card a story gate opens: which chapter this is, what it is about and how far the player has
// got. The chapter itself is never played in here — on the land it stands around the gate, a
// climb or a maze is entered from here. A chapter not written yet can be written from here (one
// model call); without a model the card says why instead of inventing anything.

import { readChapter } from "@renderer/engine2d/chapterLayer";
import { type Translate, useT } from "@renderer/i18n";
import { useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { chapterLeft } from "@shared/chapter";
import type { AppError } from "@shared/result";
import { episodeUnlocked, storyEpisodes } from "@shared/story";
import { type JSX, useEffect, useRef, useState } from "react";
import { CHAPTER_CANCELLED, chapterParts, enterChapterPlace, writeChapter } from "./chapters";

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
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const stopped = useRef(false);

  // However the card closes, a chapter still being written is dropped with it.
  useEffect(() => {
    if (episodeId !== null) return;
    stopped.current = true;
    setWriting(false);
    setError(null);
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

  const write = async (): Promise<void> => {
    stopped.current = false;
    setWriting(true);
    setError(null);
    const written = await writeChapter(episode, () => stopped.current);
    if (stopped.current) return;
    setWriting(false);
    if (!written.ok && written.error.code !== CHAPTER_CANCELLED) setError(written.error);
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
      {writing ? <Text tone="accent">{t("land.chapterWriting")}</Text> : null}
      {error === null ? null : <ErrorBlock error={error} />}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {unlocked && !cleared && stage === null && !writing ? (
          <Button variant="primary" onClick={() => void write()}>
            {t("land.chapterWrite")}
          </Button>
        ) : null}
        {writing ? (
          <Button variant="destructive" onClick={() => (stopped.current = true)}>
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
