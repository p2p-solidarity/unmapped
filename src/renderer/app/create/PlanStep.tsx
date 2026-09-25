// Create a game, page 2: what the model proposed, before anything is published. The bible is
// shown as written; the chapters can be renamed, rewritten, re-kinded, removed or added in the
// player's own words, and the map shows where each gate will stand (placed by the host, never
// by the model). Building is the only step that publishes.

import type { WorldPlan } from "@renderer/narrative/newWorld";
import type { PlayStyle } from "@renderer/narrative/openLandCartridge";
import { Button, Surface, space, Text, TextField } from "@renderer/ui";
import { PLAY_KINDS, type PlayKind } from "@shared/chapter";
import { episodePlaces, STORY_LIMITS, type StoryEpisode, type StoryPlan } from "@shared/story";
import type { JSX } from "react";
import { ChapterMap } from "./ChapterMap";

const KIND_HINT: Record<PlayKind, string> = {
  meet: "people to talk to, on the land",
  search: "things to find, on the land",
  fight: "foes to beat, on the land",
  climb: "a side-scrolling course",
  maze: "a dungeon",
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

function rulesLine(play: PlayStyle): string {
  if (play.fights === "none")
    return "No fighting: chapters are meetings, searches, climbs and mazes.";
  const weapon = play.weapon.trim() || (play.fights === "gun" ? "a gun" : "a blade");
  return `Fighting on: you start with ${weapon}; you 100 HP, monsters 30 HP + 10 per level.`;
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
          <Text tone="muted">
            No story was given, so this world has no chapters: it is open land to walk. Go back and
            write a story to get chapters on the map.
          </Text>
        ) : (
          <>
            <Text tone="accent">{story.logline}</Text>
            {story.episodes.map((episode, index) => (
              <Surface key={episode.id} variant="inset" padding="md" style={{ gap: space.xs }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: space.sm }}>
                  <Text variant="caption" tone="dim">
                    {`Chapter ${index + 1}`}
                  </Text>
                  {story.episodes.length > STORY_LIMITS.minEpisodes ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setEpisodes(story.episodes.filter((_, at) => at !== index))}
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <TextField
                  label="Title"
                  value={episode.title}
                  maxLength={STORY_LIMITS.titleChars}
                  disabled={busy}
                  onChange={(event) => edit(index, { title: event.target.value })}
                />
                <TextField
                  label="Where"
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
                      {kind}
                    </Button>
                  ))}
                </div>
                <Text variant="caption" tone="dim">
                  {(PLAY_KINDS as readonly string[]).includes(episode.kind)
                    ? KIND_HINT[episode.kind as PlayKind]
                    : `“${episode.kind}” — played on the land unless it reads as a climb or a maze`}
                </Text>
                <TextField
                  label="What happens"
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
                Add a chapter you write yourself
              </Button>
            ) : null}
          </>
        )}
      </div>
      <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: space.sm }}>
        {story === null ? null : (
          <>
            <Text variant="caption" tone="dim">
              Where the gates stand
            </Text>
            <ChapterMap episodes={story.episodes} />
          </>
        )}
        <Text variant="caption" tone="dim">
          Rules
        </Text>
        <Text variant="caption">{rulesLine(play)}</Text>
        <Text variant="caption" tone="dim">
          The world, as the model wrote it
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
