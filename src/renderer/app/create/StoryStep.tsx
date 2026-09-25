import { type StringKey, useT } from "@renderer/i18n";
import { Button, Surface, space, Text, TextField } from "@renderer/ui";
import { PLAY_KINDS, type PlayKind } from "@shared/chapter";
import type { DraftChapter, DraftStory } from "@shared/createDraft";
import { episodePlaces, STORY_LIMITS } from "@shared/story";
import { type JSX, useState } from "react";
import { ChapterMap } from "./ChapterMap";

const LABEL: Record<PlayKind, StringKey> = {
  meet: "create.kindMeet",
  search: "create.kindSearch",
  fight: "create.kindFight",
  climb: "create.kindClimb",
  maze: "create.kindMaze",
};

function ChapterCard({
  one,
  index,
  count,
  combat,
  busy,
  onEdit,
  onRewrite,
  onRemove,
  onMove,
}: {
  one: DraftChapter;
  index: number;
  count: number;
  combat: boolean;
  busy: boolean;
  onEdit(index: number, patch: Partial<DraftChapter>): void;
  onRewrite(index: number, note: string): void;
  onRemove(index: number): void;
  onMove(index: number, delta: number): void;
}): JSX.Element {
  const t = useT();
  const [note, setNote] = useState("");
  const kinds = PLAY_KINDS.filter((kind) => combat || kind !== "fight");
  return (
    <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
      <div style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}>
        <Text variant="label">{t("create.chapterN", { n: index + 1 })}</Text>
        <Button variant="ghost" disabled={busy || index === 0} onClick={() => onMove(index, -1)}>
          ↑
        </Button>
        <Button
          variant="ghost"
          disabled={busy || index === count - 1}
          onClick={() => onMove(index, 1)}
        >
          ↓
        </Button>
        <Button
          variant="chip"
          active={one.locked}
          disabled={busy}
          onClick={() => onEdit(index, { locked: !one.locked })}
        >
          {t(one.locked ? "create.unlockChapter" : "create.lockChapter")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || count <= STORY_LIMITS.minEpisodes}
          onClick={() => onRemove(index)}
        >
          {t("create.removeChapter")}
        </Button>
      </div>
      <TextField
        label={t("create.chapterTitle")}
        value={one.title}
        maxLength={STORY_LIMITS.titleChars}
        disabled={busy}
        onChange={(event) => onEdit(index, { title: event.target.value, edited: true })}
      />
      <TextField
        label={t("create.chapterWhere")}
        value={one.place}
        maxLength={STORY_LIMITS.placeChars}
        disabled={busy}
        onChange={(event) => onEdit(index, { place: event.target.value, edited: true })}
      />
      <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
        {kinds.map((kind) => (
          <Button
            key={kind}
            variant="chip"
            active={one.kind === kind}
            disabled={busy}
            onClick={() => onEdit(index, { kind, edited: true })}
          >
            {t(LABEL[kind])}
          </Button>
        ))}
      </div>
      <TextField
        label={t("create.chapterBrief")}
        rows={3}
        value={one.brief}
        maxLength={STORY_LIMITS.briefChars}
        disabled={busy}
        onChange={(event) => onEdit(index, { brief: event.target.value, edited: true })}
      />
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 250px" }}>
          <TextField
            label={t("create.chapterNote")}
            value={note}
            maxLength={300}
            disabled={busy}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button disabled={busy || one.locked} onClick={() => onRewrite(index, note)}>
          {t("create.rewriteChapter")}
        </Button>
      </div>
    </Surface>
  );
}

export function StoryStep({
  story,
  combat,
  busy,
  onLogline,
  onEdit,
  onRewrite,
  onInsert,
  onRemove,
  onMove,
  onRevise,
}: {
  story: DraftStory;
  combat: boolean;
  busy: boolean;
  onLogline(value: string): void;
  onEdit(index: number, patch: Partial<DraftChapter>): void;
  onRewrite(index: number, note: string): void;
  onInsert(index: number): void;
  onRemove(index: number): void;
  onMove(index: number, delta: number): void;
  onRevise(note: string): void;
}): JSX.Element {
  const t = useT();
  const [note, setNote] = useState("");
  const places = episodePlaces(story.chapters.length);
  const mapped = story.chapters.map((chapter, index) => ({
    ...chapter,
    id: `e${index + 1}`,
    ...(places[index] ?? { cx: 1, cz: 0 }),
  }));
  return (
    <div style={{ display: "flex", gap: space.lg, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "2 1 420px", display: "flex", flexDirection: "column", gap: space.md }}>
        <Text variant="title" as="h2">
          {t("create.storyReview")}
        </Text>
        <Text tone="muted">{t("create.storyReviewNote")}</Text>
        <TextField
          label={t("create.logline")}
          value={story.logline}
          maxLength={STORY_LIMITS.loglineChars}
          disabled={busy}
          onChange={(event) => onLogline(event.target.value)}
        />
        {story.chapters.map((one, index) => (
          <div key={one.key} style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
            {story.chapters.length < STORY_LIMITS.maxEpisodes && (
              <Button variant="ghost" disabled={busy} onClick={() => onInsert(index)}>
                {t("create.insertChapter")}
              </Button>
            )}
            <ChapterCard
              one={one}
              index={index}
              count={story.chapters.length}
              combat={combat}
              busy={busy}
              onEdit={onEdit}
              onRewrite={onRewrite}
              onRemove={onRemove}
              onMove={onMove}
            />
          </div>
        ))}
        {story.chapters.length < STORY_LIMITS.maxEpisodes && (
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onInsert(story.chapters.length)}
          >
            {t("create.insertChapter")}
          </Button>
        )}
      </div>
      <div style={{ flex: "1 1 250px", display: "flex", flexDirection: "column", gap: space.md }}>
        <Text variant="caption" tone="dim">
          {t("create.gatesCaption")}
        </Text>
        <ChapterMap episodes={mapped} />
        <TextField
          label={t("create.storyNote")}
          value={note}
          maxLength={300}
          rows={3}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button
          disabled={busy || story.chapters.every((one) => one.locked)}
          onClick={() => onRevise(note)}
        >
          {t("create.rewriteUnlocked")}
        </Button>
      </div>
    </div>
  );
}
