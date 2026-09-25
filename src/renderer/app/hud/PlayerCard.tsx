// Left HUD card: where you are (worldStore.floor + the parsed biome), what you have done (karma),
// what you carry, and what this floor asks of you (scene.quests).
//
// There is no avatar portrait or class name here: the engine has no class system, so showing one
// would be a gauge with nothing behind it (Rule 2). A real player identity arrives with
// PlayerProfile once the capability modules say a game needs one (plan.md §0.4).

import { useEngineStore, useRunStore, useSessionStore, useWorldStore } from "@renderer/state";
import { colors, font, radius, StatePanel, Surface, space, Text } from "@renderer/ui";
import { formatSeedCode } from "@shared/seedCode";
import type { JSX } from "react";
import { LandStatus } from "./LandStatus";
import type { HudSummary } from "./summary";

function QuestList(): JSX.Element {
  const scene = useWorldStore((state) => state.scene);
  return (
    <StatePanel state={scene} idleText="No floor loaded." loadingText="Writing this floor…">
      {(graph) =>
        graph.quests.length === 0 ? (
          <Text variant="caption" tone="dim">
            No active quests on this floor.
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
            {summary.worldName ?? "No world loaded"}
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
                {`FLOOR ${floor}`}
              </Text>
            </div>
          )}
        </div>
        {chunk === null || seed === undefined ? null : (
          <Readout label="SEED" value={formatSeedCode(seed)} accent />
        )}
        {chunk === null ? null : <Readout label="LAND" value={`${chunk.cx} · ${chunk.cz}`} />}
        <LandStatus />
        <Readout label="KARMA" value={`${summary.karmaCount} entries`} accent />
        <Readout label="CARRIED" value={`${summary.items} items · ${summary.materials} mats`} />
      </div>

      {summary.lastChoice === null ? null : (
        <Text variant="caption" tone="dim" style={{ marginTop: 2 }}>
          {`Last choice: ${summary.lastChoice}`}
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
          {summary.biome === null ? "Scene not parsed" : "Biome"}
        </Text>
        {summary.biome === null ? null : (
          <Text variant="caption" tone="accent" mono>
            {summary.biome.toUpperCase()}
          </Text>
        )}
      </div>

      <QuestList />
    </Surface>
  );
}
