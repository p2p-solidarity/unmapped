// The card a story gate opens: which chapter this is, what it is about and how far the player has
// got. The chapter itself is never played in here — on the land it stands around the gate, a
// climb or a maze is entered from here. A chapter not written yet can be written from here (one
// model call); without a model the card says why instead of inventing anything.

import { readChapter } from "@renderer/engine2d/chapterLayer";
import { useLandStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import { chapterLeft } from "@shared/chapter";
import type { AppError } from "@shared/result";
import { episodeUnlocked, storyEpisodes } from "@shared/story";
import { type JSX, useEffect, useRef, useState } from "react";
import { CHAPTER_CANCELLED, chapterParts, enterChapterPlace, writeChapter } from "./chapters";

function todo(left: { talk: number; find: number; defeat: number }): string {
  const parts = [
    left.talk > 0 ? `talk to ${left.talk} more` : null,
    left.find > 0 ? `open ${left.find} more` : null,
    left.defeat > 0 ? `defeat ${left.defeat} more` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? "Everything here is done." : `Still to do: ${parts.join(" · ")}`;
}

export function ChapterPanel(): JSX.Element | null {
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
        <Button onClick={close}>Back to the land</Button>
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
          ? `Chapter ${index + 1} of ${plan.episodes.length}`
          : `Chapter ${index + 1} · written by the land`}{" "}
        · {episode.place}
      </Text>
      <Text variant="title" as="h2">
        {episode.title}
      </Text>
      <Text>{episode.brief}</Text>
      {cleared ? <Text tone="success">Cleared — {record?.summary ?? ""}</Text> : null}
      {!unlocked ? (
        <Text tone="accent">
          This gate opens after “{episodes[index - 1]?.title ?? "the chapter before"}” is cleared.
        </Text>
      ) : null}
      {draft !== null && !cleared && stage !== null ? (
        <>
          <Text tone="accent">{draft.goal}</Text>
          <Text variant="caption" tone="muted">
            {todo(chapterLeft(chapterParts(draft), stage))} — everyone and everything of this
            chapter is around this gate.
          </Text>
        </>
      ) : null}
      {stage !== null && stage.kind !== "land" && !cleared ? (
        <Text variant="caption" tone="muted">
          {stage.kind === "side"
            ? "A side-scrolling course: reach its far end to clear the chapter."
            : "A dungeon: find its far end to clear the chapter."}
        </Text>
      ) : null}
      {writing ? <Text tone="accent">Writing this chapter…</Text> : null}
      {error === null ? null : <ErrorBlock error={error} />}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {unlocked && !cleared && stage === null && !writing ? (
          <Button variant="primary" onClick={() => void write()}>
            Write this chapter now
          </Button>
        ) : null}
        {writing ? (
          <Button variant="destructive" onClick={() => (stopped.current = true)}>
            Cancel
          </Button>
        ) : null}
        {unlocked && !cleared && stage?.kind === "land" ? (
          <Button variant="primary" onClick={close}>
            Begin
          </Button>
        ) : null}
        {unlocked && stage !== null && stage.kind !== "land" ? (
          <Button variant="primary" onClick={enter}>
            {cleared ? "Play again" : "Enter"}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={close}>
          Back to the land
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
