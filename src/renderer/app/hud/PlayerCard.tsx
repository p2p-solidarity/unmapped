// Left HUD card: where you are (worldStore.floor + the parsed biome), what you have done (karma),
// what you carry, and what this floor asks of you (scene.quests).
//
// There is no avatar portrait or class name here: the engine has no class system, so showing one
// would be a gauge with nothing behind it (Rule 2). A real player identity arrives with
// PlayerProfile once the capability modules say a game needs one (plan.md §0.4).

import { readChapter } from "@renderer/engine2d/chapterLayer";
import { useT } from "@renderer/i18n";
import {
  useEngineStore,
  useLandStore,
  useRunStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { colors, font, radius, StatePanel, Surface, space, Text } from "@renderer/ui";
import { chapterLeft } from "@shared/chapter";
import { formatSeedCode } from "@shared/seedCode";
import { nextEpisode, STORY_CAP, storyEpisodes } from "@shared/story";
import type { JSX } from "react";
import { chapterParts } from "../land/chapters";
import { LandStatus } from "./LandStatus";
import type { HudSummary } from "./summary";

/**
 * The story this world was made from: how far along it is and which gate is next. Once the land
 * has written chapters past the authored episodes, the count is of chapters, not of a fixed plan.
 */
function StoryLine(): JSX.Element | null {
  const plan = useSessionStore((state) => state.activeInstance?.cartridge.story ?? null);
  const episodes = useLandStore((state) => state.progress?.episodes ?? null);
  const more = useLandStore((state) => state.progress?.storyMore);
  const t = useT();
  if (plan === null) return null;
  const all = storyEpisodes(plan, more);
  const done = all.filter((episode) => episodes?.[episode.id]?.cleared === true).length;
  const next = nextEpisode(all, episodes ?? {});
  const count =
    all.length === plan.episodes.length
      ? t("hud.storyCount", { done, total: all.length })
      : t("hud.chapterCount", { n: Math.min(done + 1, all.length), done });
  const tail =
    next !== null
      ? t("hud.storyNext", { title: next.title, place: next.place })
      : all.length >= STORY_CAP
        ? t("hud.storyLast")
        : t("hud.storyUnwritten");
  const stage = next === null ? null : (episodes?.[next.id]?.stage ?? null);
  const draft = stage?.kind === "land" ? readChapter(stage.source) : null;
  const left = draft === null || stage === null ? null : chapterLeft(chapterParts(draft), stage);
  return (
    <>
      <Text variant="caption" tone="accent">
        {`${count} · ${tail}`}
      </Text>
      {/* The chapter being played around its gate: its goal and what it still asks for. */}
      {draft === null || left === null ? null : (
        <Text variant="caption" tone="muted">
          {draft.goal}
          {` · ${t("hud.chapterLeft", { talk: left.talk, find: left.find })}`}
          {draft.monsters.length > 0 ? ` · ${t("hud.chapterDefeat", { defeat: left.defeat })}` : ""}
        </Text>
      )}
    </>
  );
}

function QuestList(): JSX.Element {
  const scene = useWorldStore((state) => state.scene);
  const t = useT();
  return (
    <StatePanel state={scene} idleText={t("hud.noFloorLoaded")} loadingText={t("hud.writingFloor")}>
      {(graph) =>
        graph.quests.length === 0 ? (
          <Text variant="caption" tone="dim">
            {t("hud.noQuests")}
          </Text>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: space.xs, marginTop: 4 }}>
            {graph.quests.map((quest) => (
              <div key={quest.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: colors.accent,
                  }}
                />
                <Text variant="caption" tone="muted">
                  {quest.text}
                </Text>
              </div>
            ))}
          </div>
        )
      }
    </StatePanel>
  );
}

function Readout({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
      <Text variant="caption" tone="dim" mono style={{ fontSize: 10, letterSpacing: 0.6 }}>
        {label}
      </Text>
      <Text variant="caption" tone={accent ? "accent" : "muted"} mono>
        {value}
      </Text>
    </div>
  );
}

export function PlayerCard({ summary }: { summary: HudSummary }): JSX.Element {
  // An endless cartridge regenerates in place, so its depth is the run's, not the save's.
  const runFloor = useRunStore((state) => state.floor);
  const floor = Math.max(summary.floor, runFloor);
  // Only set while the scene plays on open land; a bounded scene has no coordinates to show.
  const chunk = useEngineStore((state) => state.chunk);
  // Which land of the one game this is; shared with a friend, it is the same land for them.
  const seed = useSessionStore((state) => state.activeInstance?.instance.save.seed);
  const t = useT();

  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        pointerEvents: "auto",
        minWidth: 320,
        maxWidth: 380,
        borderLeft: `3px solid ${colors.accent}`,
        gap: space.xs,
      }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Text variant="label" tone="accent" style={{ fontWeight: font.weight.bold }}>
            {summary.worldName ?? t("hud.noWorldLoaded")}
          </Text>
          {/* Open land has no tower and no floors: where you are is the LAND readout below. */}
          {chunk !== null ? null : (
            <div
              style={{
                padding: "1px 6px",
                background: colors.accentSoft,
                borderRadius: radius.pill,
                border: `1px solid ${colors.accent}`,
              }}
            >
              <Text variant="caption" tone="accent" mono>
                {t("hud.floorBadge", { floor })}
              </Text>
            </div>
          )}
        </div>
        {chunk === null || seed === undefined ? null : (
          <Readout label={t("hud.readSeed")} value={formatSeedCode(seed)} accent />
        )}
        {chunk === null ? null : (
          <Readout label={t("hud.readLand")} value={`${chunk.cx} · ${chunk.cz}`} />
        )}
        <LandStatus />
        <Readout
          label={t("hud.readKarma")}
          value={t("hud.karmaEntries", { n: summary.karmaCount })}
          accent
        />
        <Readout
          label={t("hud.readCarried")}
          value={t("hud.carried", { items: summary.items, mats: summary.materials })}
        />
      </div>

      {summary.lastChoice === null ? null : (
        <Text variant="caption" tone="dim" style={{ marginTop: 2 }}>
          {t("hud.lastChoice", { choice: summary.lastChoice })}
        </Text>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 4,
          paddingTop: 4,
          borderTop: `1px solid ${colors.surfaceBorder}`,
        }}
      >
        <Text variant="caption" tone="muted">
          {t(summary.biome === null ? "hud.sceneNotParsed" : "hud.biome")}
        </Text>
        {summary.biome === null ? null : (
          <Text variant="caption" tone="accent" mono>
            {summary.biome.toUpperCase()}
          </Text>
        )}
      </div>

      <StoryLine />
      <QuestList />
    </Surface>
  );
}
