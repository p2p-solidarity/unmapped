// Right HUD card: one plain line, only when it matters right now — the AI is not set up or cannot be
// reached (with where to fix it: Settings → Model), something is being written, friends on this
// land (the continent line), or friends in a legacy room. With nothing to say there is no card at
// all. The machinery itself (provider, model, probe, latency, FPS, tokens, usage) is in F12.

import { errorLine, useT } from "@renderer/i18n";
import { type ContinentStatus, useContinentStore } from "@renderer/state";
import { colors, Surface, Text } from "@renderer/ui";
import type { JSX } from "react";
import type { HudSummary } from "./summary";

function ModelLine({ summary }: { summary: HudSummary }): JSX.Element | null {
  const t = useT();
  const { state, thinking } = summary.inference;
  if (state === "unconfigured") {
    return (
      <Text variant="body" tone="danger">
        {t("hud.modelMissing")}
      </Text>
    );
  }
  if (state === "offline" || state === "error") {
    return (
      <Text variant="body" tone="danger">
        {t("hud.modelOffline")}
      </Text>
    );
  }
  return thinking > 0 ? (
    <Text variant="caption" tone="accent">
      {t("hud.writingNow")}
    </Text>
  ) : null;
}

function ContinentLine({ status }: { status: ContinentStatus }): JSX.Element | null {
  const t = useT();
  if (status.kind === "off") return null;
  if (status.kind === "error") {
    return (
      <Text variant="caption" tone="danger">
        {t("continent.hudError", { code: status.code, reason: errorLine(status.error) })}
      </Text>
    );
  }
  return (
    <Text variant="caption" tone={status.kind === "live" ? "success" : "muted"}>
      {status.kind === "live"
        ? t("continent.hudLive", { code: status.code, n: status.peers })
        : t("continent.hudConnecting", { code: status.code })}
    </Text>
  );
}

export function SystemPanel({ summary }: { summary: HudSummary }): JSX.Element | null {
  const t = useT();
  const continent = useContinentStore((state) => state.status);
  const { state, thinking } = summary.inference;
  const model =
    state === "unconfigured" || state === "offline" || state === "error" || thinking > 0;
  if (!model && continent.kind === "off" && summary.peers === null) return null;
  return (
    <Surface
      variant="overlay"
      padding="sm"
      style={{
        pointerEvents: "auto",
        alignItems: "flex-end",
        maxWidth: 340,
        borderRight: `3px solid ${colors.accent}`,
        gap: 4,
      }}
    >
      <ModelLine summary={summary} />
      <ContinentLine status={continent} />
      {summary.peers === null ? null : (
        <Text variant="caption" tone="muted">
          {t("hud.peers", { n: summary.peers })}
        </Text>
      )}
    </Surface>
  );
}
