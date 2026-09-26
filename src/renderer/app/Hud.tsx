// Heads-up display: The Seed VRMMO aesthetic, but every readout is a store value (Rule 2).
// Layout only — the three cards live in ./hud, the numbers in ./hud/summary.ts.

import { type StringKey, useT } from "@renderer/i18n";
import { padControlsHint, useInputDevice } from "@renderer/input";
import {
  useEncounterStore,
  useEngineStore,
  useInferenceStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { colors, radius, space, Text, zIndex } from "@renderer/ui";
import { type JSX, useMemo } from "react";
import { ActionDock, NearbyPrompt } from "./hud/ActionDock";
import { PlayerCard } from "./hud/PlayerCard";
import { Reticle } from "./hud/Reticle";
import { SystemPanel } from "./hud/SystemPanel";
import { type HudSummary, hudSummary } from "./hud/summary";
import { TurnPanel } from "./hud/TurnPanel";
import { TogetherLayer } from "./land/TogetherPanel";

function useHudSummary(): HudSummary {
  const meta = useWorldStore((state) => state.meta);
  const floor = useWorldStore((state) => state.floor);
  const karma = useWorldStore((state) => state.karma);
  const inventory = useWorldStore((state) => state.inventory);
  const scene = useWorldStore((state) => state.scene);
  const roomCode = useSessionStore((state) => state.roomCode);
  const peerCount = useSessionStore((state) => state.peerCount);
  const config = useInferenceStore((state) => state.config);
  const probe = useInferenceStore((state) => state.probe);
  const inflight = useInferenceStore((state) => state.inflight);

  return useMemo(
    () =>
      hudSummary(
        { meta, floor, karma, inventory, scene },
        { roomCode, peerCount },
        { config, probe, inflight },
      ),
    [meta, floor, karma, inventory, scene, roomCode, peerCount, config, probe, inflight],
  );
}

export function Hud(): JSX.Element {
  const summary = useHudSummary();
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const armed = useEncounterStore((state) => state.weapon !== null);
  const openLand = useEngineStore((state) => state.chunk !== null);
  const t = useT();
  // Touch shows the pad's glyphs too: the on-screen touch pad is laid out like one.
  const pad = useInputDevice() !== "keys";
  const line: StringKey = openLand
    ? cameraMode === "topdown"
      ? armed
        ? "hud.controlsLandArmed"
        : "hud.controlsLand"
      : "hud.controlsLand3d"
    : cameraMode === "fps"
      ? armed
        ? "hud.controlsFpsArmed"
        : "hud.controlsFps"
      : cameraMode === "side"
        ? "hud.controlsSide"
        : cameraMode === "topdown"
          ? "hud.controlsTopdown"
          : "hud.controlsTps";
  const controls = t(pad ? padControlsHint(line) : line);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: zIndex.hud,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: space.md,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: space.md,
        }}
      >
        <PlayerCard summary={summary} />
        <TurnPanel />
        <SystemPanel summary={summary} />
      </div>

      {cameraMode === "fps" ? <Reticle /> : null}

      {/* Read-only: the prompt and key hints must not catch a click meant as a shot. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: space.sm,
          pointerEvents: "none",
        }}
      >
        <NearbyPrompt />
        <div
          style={{
            display: "flex",
            gap: space.md,
            padding: "4px 14px",
            background: colors.bgOverlay,
            borderRadius: radius.pill,
            border: `1px solid ${colors.surfaceBorder}`,
          }}
        >
          <Text variant="caption" tone="dim">
            {controls}
          </Text>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
        <ActionDock />
      </div>
      <TogetherLayer />
    </div>
  );
}
