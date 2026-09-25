// Create a game, page 1: what the world is and how it is played. Everything here is the player's
// own words or a choice between things the game can really do; nothing is generated yet.

import { contentLanguage, languageLabel, type StringKey, useT } from "@renderer/i18n";
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
  return [...new Set([contentLanguage(), navigator.language, "zh-TW", "ja-JP", "en-US"])];
}

const STYLES: Array<{ fights: PlayStyle["fights"]; label: StringKey; detail: StringKey }> = [
  { fights: "none", label: "create.styleExplore", detail: "create.styleExploreDetail" },
  { fights: "gun", label: "create.styleGun", detail: "create.styleGunDetail" },
  { fights: "blade", label: "create.styleBlade", detail: "create.styleBladeDetail" },
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
  const t = useT();
  const set = <K extends keyof Idea>(key: K, value: Idea[K]): void =>
    onChange({ ...idea, [key]: value });
  const play = idea.play;
  return (
    <>
      <TextField
        label={t("create.worldName")}
        value={idea.name}
        maxLength={60}
        disabled={busy}
        autoFocus
        onChange={(event) => set("name", event.target.value)}
      />
      <TextField
        label={t("create.intent")}
        value={idea.intent}
        maxLength={400}
        disabled={busy}
        onChange={(event) => set("intent", event.target.value)}
      />
      <TextField
        label={t("create.story")}
        value={idea.story}
        rows={5}
        maxLength={4_000}
        disabled={busy}
        onChange={(event) => set("story", event.target.value)}
      />
      <Text variant="caption" tone="dim">
        {t("create.howPlayed")}
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
              <Text variant="label">{t(style.label)}</Text>
              <Text variant="caption" tone="muted">
                {t(style.detail)}
              </Text>
            </span>
          </Button>
        ))}
      </div>
      {play.fights === "none" ? null : (
        <TextField
          label={t("create.weaponName")}
          value={play.weapon}
          maxLength={40}
          disabled={busy}
          onChange={(event) => set("play", { ...play, weapon: event.target.value })}
        />
      )}
      <Text variant="caption" tone="dim">
        {t("create.languageCaption")}
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
            {`${languageLabel(tag)} · ${tag}`}
          </Button>
        ))}
      </div>
    </>
  );
}
