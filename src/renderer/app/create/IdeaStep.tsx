// Create a game, page 1: what the world is and how it is played. Everything here is the player's
// own words or a choice between things the game can really do; nothing is generated yet.

import type { PlayStyle } from "@renderer/narrative/openLandCartridge";
import { Button, space, Text, TextField } from "@renderer/ui";
import type { JSX } from "react";

export interface Idea {
  name: string;
  intent: string;
  story: string;
  language: string;
  play: PlayStyle;
}

export function languages(): string[] {
  return [...new Set([navigator.language, "zh-TW", "ja-JP", "en-US"])];
}

const STYLES: Array<{ fights: PlayStyle["fights"]; label: string; detail: string }> = [
  {
    fights: "none",
    label: "Explore",
    detail:
      "Walk, meet people, find things. Nobody fights; chapters are meetings, searches, climbs and mazes.",
  },
  {
    fights: "gun",
    label: "Adventure · gun",
    detail: "Monsters on the land and in chapters; you shoot the way you face.",
  },
  {
    fights: "blade",
    label: "Adventure · blade",
    detail: "Monsters on the land and in chapters; you fight up close.",
  },
];

export function IdeaStep({
  idea,
  onChange,
  busy,
}: {
  idea: Idea;
  onChange(next: Idea): void;
  busy: boolean;
}): JSX.Element {
  const set = <K extends keyof Idea>(key: K, value: Idea[K]): void =>
    onChange({ ...idea, [key]: value });
  const play = idea.play;
  return (
    <>
      <TextField
        label="World name"
        value={idea.name}
        maxLength={60}
        disabled={busy}
        autoFocus
        onChange={(event) => set("name", event.target.value)}
      />
      <TextField
        label="In one sentence, what is this land?"
        value={idea.intent}
        maxLength={400}
        disabled={busy}
        onChange={(event) => set("intent", event.target.value)}
      />
      <TextField
        label="Your story (optional): who you are, what happens, how it ends — it becomes chapters on the map"
        value={idea.story}
        rows={5}
        maxLength={4_000}
        disabled={busy}
        onChange={(event) => set("story", event.target.value)}
      />
      <Text variant="caption" tone="dim">
        How is it played?
      </Text>
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        {STYLES.map((style) => (
          <Button
            key={style.fights}
            variant="tile"
            active={play.fights === style.fights}
            disabled={busy}
            onClick={() => set("play", { ...play, fights: style.fights })}
            style={{ flex: "1 1 180px" }}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
              <Text variant="label">{style.label}</Text>
              <Text variant="caption" tone="muted">
                {style.detail}
              </Text>
            </span>
          </Button>
        ))}
      </div>
      {play.fights === "none" ? null : (
        <TextField
          label="Your weapon's name (optional)"
          value={play.weapon}
          maxLength={40}
          disabled={busy}
          onChange={(event) => set("play", { ...play, weapon: event.target.value })}
        />
      )}
      <Text variant="caption" tone="dim">
        Language — everything the world says is written in it
      </Text>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
        {languages().map((tag) => (
          <Button
            key={tag}
            variant="chip"
            active={idea.language === tag}
            disabled={busy}
            onClick={() => set("language", tag)}
          >
            {tag}
          </Button>
        ))}
      </div>
    </>
  );
}
