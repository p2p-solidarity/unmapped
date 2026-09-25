// Create a game, page 2: what the model proposed, before anything is published. The bible is
// shown as written; the chapters can be renamed, rewritten, re-kinded, removed or added in the
// player's own words, and the map shows where each gate will stand (placed by the host, never
// by the model). Building is the only step that publishes.

import { type StringKey, type Translate, useT } from "@renderer/i18n";
import type { WorldPlan } from "@renderer/narrative/newWorld";
import type { PlayStyle } from "@renderer/narrative/openLandCartridge";
import { Button, Surface, space, Text, TextField } from "@renderer/ui";
import { PLAY_KINDS, type PlayKind } from "@shared/chapter";
import { episodePlaces, STORY_LIMITS, type StoryEpisode, type StoryPlan } from "@shared/story";
import type { JSX } from "react";
import { ChapterMap } from "./ChapterMap";

const KIND_LABEL: Record<PlayKind, StringKey> = {
  meet: "create.kindMeet",
  search: "create.kindSearch",
  fight: "create.kindFight",
  climb: "create.kindClimb",
  maze: "create.kindMaze",
};

const KIND_HINT: Record<PlayKind, StringKey> = {
  meet: "create.kindHintMeet",
  search: "create.kindHintSearch",
  fight: "create.kindHintFight",
  climb: "create.kindHintClimb",
  maze: "create.kindHintMaze",
};

/** Ids and gates follow the order: renumbered and re-placed after every add or remove. */
export function renumber(
  episodes: readonly Omit<StoryEpisode, "id" | "cx" | "cz">[],
): StoryEpisode[] {
  const places = episodePlaces(episodes.length);
  return episodes.map((episode, index) => ({
    ...episode,
    id: `e${index + 1}`,
    ...(places[index] ?? { cx: 1, cz: 0 }),
  }));
}

function rulesLine(play: PlayStyle, t: Translate): string {
  if (play.fights === "none") return t("create.rulesPeaceful");
  const weapon =
    play.weapon.trim() || t(play.fights === "gun" ? "create.defaultGun" : "create.defaultBlade");
  return t("create.rulesFighting", { weapon });
}

export function PlanStep({
  name,
  plan,
  play,
  onStory,
  busy,
}: {
  name: string;
  plan: WorldPlan;
  play: PlayStyle;
  onStory(story: StoryPlan): void;
  busy: boolean;
}): JSX.Element {
  const t = useT();
  const story = plan.story;
  const kinds = PLAY_KINDS.filter((kind) => play.fights !== "none" || kind !== "fight");
  const edit = (index: number, patch: Partial<StoryEpisode>): void => {
    if (story === null) return;
    onStory({
      ...story,
      episodes: story.episodes.map((one, at) => (at === index ? { ...one, ...patch } : one)),
    });
  };
  const setEpisodes = (episodes: Omit<StoryEpisode, "id" | "cx" | "cz">[]): void => {
    if (story !== null) onStory({ ...story, episodes: renumber(episodes) });
  };

  return (
    <div style={{ display: "flex", gap: space.lg, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ flex: "2 1 380px", display: "flex", flexDirection: "column", gap: space.sm }}>
        <Text variant="title" as="h2">
          {name}
        </Text>
        {story === null ? (
          <Text tone="muted">{t("create.noStory")}</Text>
        ) : (
          <>
            <Text tone="accent">{story.logline}</Text>
            {story.episodes.map((episode, index) => (
              <Surface key={episode.id} variant="inset" padding="md" style={{ gap: space.xs }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm }}>
                  <Text variant="caption" tone="dim">
                    {t("create.chapterN", { n: index + 1 })}
                  </Text>
                  {story.episodes.length > STORY_LIMITS.minEpisodes ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEpisodes(story.episodes.filter((_, at) => at !== index))}
                    >
                      {t("common.remove")}
                    </Button>
                  ) : null}
                </div>
                <TextField
                  label={t("create.chapterTitle")}
                  value={episode.title}
                  maxLength={STORY_LIMITS.titleChars}
                  disabled={busy}
                  onChange={(event) => edit(index, { title: event.target.value })}
                />
                <TextField
                  label={t("create.chapterWhere")}
                  value={episode.place}
                  maxLength={STORY_LIMITS.placeChars}
                  disabled={busy}
                  onChange={(event) => edit(index, { place: event.target.value })}
                />
                <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
                  {kinds.map((kind) => (
                    <Button
                      key={kind}
                      variant="chip"
                      active={episode.kind === kind}
                      disabled={busy}
                      onClick={() => edit(index, { kind })}
                    >
                      {t(KIND_LABEL[kind])}
                    </Button>
                  ))}
                </div>
                <Text variant="caption" tone="dim">
                  {(PLAY_KINDS as readonly string[]).includes(episode.kind)
                    ? t(KIND_HINT[episode.kind as PlayKind])
                    : t("create.kindHintOther", { kind: episode.kind })}
                </Text>
                <TextField
                  label={t("create.chapterBrief")}
                  value={episode.brief}
                  rows={3}
                  maxLength={STORY_LIMITS.briefChars}
                  disabled={busy}
                  onChange={(event) => edit(index, { brief: event.target.value })}
                />
              </Surface>
            ))}
            {story.episodes.length < STORY_LIMITS.maxEpisodes ? (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  setEpisodes([
                    ...story.episodes,
                    { title: "", place: "", kind: "meet", brief: "" },
                  ])
                }
              >
                {t("create.addChapter")}
              </Button>
            ) : null}
          </>
        )}
      </div>
      <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: space.sm }}>
        {story === null ? null : (
          <>
            <Text variant="caption" tone="dim">
              {t("create.gatesCaption")}
            </Text>
            <ChapterMap episodes={story.episodes} />
          </>
        )}
        <Text variant="caption" tone="dim">
          {t("create.rules")}
        </Text>
        <Text variant="caption">{rulesLine(play, t)}</Text>
        <Text variant="caption" tone="dim">
          {t("create.bibleCaption")}
        </Text>
        <Surface variant="inset" padding="md" style={{ gap: space.sm }}>
          <Text variant="caption" style={{ whiteSpace: "pre-wrap" }}>
            {plan.bible.core}
          </Text>
          <Text variant="caption" tone="muted" style={{ whiteSpace: "pre-wrap" }}>
            {plan.bible.style}
          </Text>
        </Surface>
      </div>
    </div>
  );
}
