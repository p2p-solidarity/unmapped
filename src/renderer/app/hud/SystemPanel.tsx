// Right HUD card: the state of the machinery behind the world — which model is answering, whether
// it is reachable, whether it is thinking right now, who else is in the room, and the frame rate.
// Every value comes from a store; nothing here is decorative.

import { ASSETS } from "@renderer/assets";
import { useEngineStore } from "@renderer/state";
import { colors, radius, Surface, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import type { HudSummary, InferenceSummary, ProviderState } from "./summary";

const DOT: Record<ProviderState, string> = {
  unconfigured: colors.textDim,
  unprobed: colors.textDim,
  probing: colors.gold,
  online: colors.success,
  offline: colors.danger,
  error: colors.danger,
};

const STATE_LABEL: Record<ProviderState, string> = {
  unconfigured: "NO PROVIDER",
  unprobed: "NOT PROBED",
  probing: "PROBING…",
  online: "ONLINE",
  offline: "UNREACHABLE",
  error: "PROBE FAILED",
};

function Dot({ color }: { color: string }): JSX.Element {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        boxShadow: `0 0 8px ${color}`,
      }}
    />
  );
}

function FpsCaption(): JSX.Element {
  const fps = useEngineStore((state) => state.fps);
  return (
    <Text variant="caption" tone="dim" mono>
      {fps > 0 ? `${Math.round(fps)} FPS` : "— FPS"}
    </Text>
  );
}

function ThinkingBadge({ thinking }: { thinking: number }): JSX.Element | null {
  if (thinking === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 8px",
        background: colors.accentSoft,
        borderRadius: radius.pill,
        border: `1px solid ${colors.accent}`,
      }}
    >
      <Dot color={colors.accent} />
      <Text variant="caption" tone="accent">
        {thinking === 1 ? "Neural Inference…" : `Neural Stream (${thinking})`}
      </Text>
    </div>
  );
}

function ProviderLine({ inference }: { inference: InferenceSummary }): JSX.Element {
  const model = inference.model;
  const provider = inference.provider;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Dot color={DOT[inference.state]} />
        <Text variant="caption" tone="accent" mono style={{ letterSpacing: 0.5 }}>
          {STATE_LABEL[inference.state]}
        </Text>
      </div>
      <Text variant="caption" tone="muted" mono>
        {provider === null
          ? "no inference config"
          : `${provider}${model === null ? "" : ` · ${model}`}`}
      </Text>
      {inference.detail === null ? null : (
        <Text variant="caption" tone="dim" mono>
          {inference.detail}
        </Text>
      )}
    </div>
  );
}

export function SystemPanel({ summary }: { summary: HudSummary }): JSX.Element {
  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        pointerEvents: "auto",
        alignItems: "flex-end",
        borderRight: `3px solid ${colors.accent}`,
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <ProviderLine inference={summary.inference} />
        <img
          src={ASSETS.seedCore}
          alt="Seed Core"
          style={{
            width: 38,
            height: 38,
            borderRadius: radius.md,
            border: `1px solid ${colors.accent}`,
            boxShadow: `0 0 10px ${colors.accentSoft}`,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <ThinkingBadge thinking={summary.inference.thinking} />
        {summary.peers === null ? null : (
          <Text variant="caption" tone="muted" mono>
            {`${summary.peers} peer${summary.peers === 1 ? "" : "s"}`}
          </Text>
        )}
        <FpsCaption />
      </div>
    </Surface>
  );
}
