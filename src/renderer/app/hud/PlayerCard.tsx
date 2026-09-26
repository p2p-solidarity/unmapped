// Left HUD card. On open land it reads like a sentence: the world's name (its ENS name first when
// it has one) and one goal — what to do right now (./Goal) — plus a land line only when something
// is happening where the player stands (./LandStatus). Nothing else: no seed, coordinates or
// counters (a new player needs none of them; F12 still has the details).
//
// A bounded legacy scene keeps its old card: the floor badge, the parsed biome, what the player
// carries and what this floor asks of them (scene.quests).
//
// There is no avatar portrait or class name here: the engine has no class system, so showing one
// would be a gauge with nothing behind it (Rule 2).

import { useT } from "@renderer/i18n";
import { useRunStore, useWorldStore } from "@renderer/state";
import { colors, radius, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { EnsTitle } from "./EnsChip";
import { Goal } from "./Goal";
import { LandStatus } from "./LandStatus";
import { useOpenLand } from "./openLand";
import type { HudSummary } from "./summary";

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

/** The old card of a bounded scene: floor, biome, what is carried, the floor's quests. */
function BoundedDetails({ summary }: { summary: HudSummary }): JSX.Element {
  // An endless cartridge regenerates in place, so its depth is the run's, not the save's.
  const runFloor = useRunStore((state) => state.floor);
  const floor = Math.max(summary.floor, runFloor);
  const biome = summary.biome;
  const t = useT();
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Text variant="caption" tone="muted">
          {t(biome === null ? "hud.sceneNotParsed" : "hud.biome")}
          {biome === null ? "" : ` · ${t(`hud.biome_${biome}`)}`}
        </Text>
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
      </div>
      <Text variant="caption" tone="muted">
        {`${t("hud.readCarried")} · ${t("hud.carried", {
          items: summary.items,
          mats: summary.materials,
        })}`}
      </Text>
      <QuestList />
    </>
  );
}

export function PlayerCard({ summary }: { summary: HudSummary }): JSX.Element {
  // Inside a place the world is still open land: the goal says how to finish the place.
  const openLand = useOpenLand();
  const t = useT();

  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        pointerEvents: "auto",
        minWidth: 280,
        maxWidth: 380,
        borderLeft: `3px solid ${colors.accent}`,
        gap: space.sm,
      }}
    >
      <EnsTitle shown={openLand} worldName={summary.worldName ?? t("hud.noWorldLoaded")} />
      {openLand ? (
        <>
          <Goal />
          <LandStatus />
        </>
      ) : (
        <BoundedDetails summary={summary} />
      )}
    </Surface>
  );
}
