// Left HUD card: who you are (characterStore), where you are (worldStore.floor + the parsed
// biome), what you have done (karma) and what this floor asks of you (scene.quests).

import { ASSETS } from "@renderer/assets";
import { type CharacterClassId, useCharacterStore, useWorldStore } from "@renderer/state";
import { colors, font, radius, StatePanel, Surface, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import type { HudSummary } from "./summary";

export const CLASS_NAMES: Record<CharacterClassId, string> = {
  swordsman: "Dual Blade Swordsman",
  mage: "Aether Mage Caster",
  gunner: "Cyber Gunner Ranger",
  paladin: "Rune Paladin Guardian",
};

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
  const classId = useCharacterStore((state) => state.classId);
  const setIsCustomizing = useCharacterStore((state) => state.setIsCustomizing);
  const className = CLASS_NAMES[classId];

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
      <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setIsCustomizing(true)}
          title="Click to customize avatar and class"
          style={{
            position: "relative",
            width: 52,
            height: 52,
            borderRadius: "50%",
            padding: 0,
            border: `2px solid ${colors.accent}`,
            boxShadow: `0 0 12px ${colors.accentSoft}`,
            cursor: "pointer",
            overflow: "hidden",
            background: colors.bg,
            flexShrink: 0,
          }}
        >
          <img
            src={ASSETS.classes[classId]}
            alt={className}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text variant="label" tone="accent" style={{ fontWeight: font.weight.bold }}>
              {className}
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
                {`FLOOR ${summary.floor}`}
              </Text>
            </div>
          </div>
          <Readout label="KARMA" value={`${summary.karmaCount} entries`} accent />
          <Readout label="CARRIED" value={`${summary.items} items · ${summary.materials} mats`} />
        </div>
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
          {summary.worldName ?? "No world loaded"}
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
