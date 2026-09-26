// Heads-up display: every readout is a store value (Rule 2), and only what the player needs now is
// shown — the world and its goal (left), a line about the AI or friends when it matters (right), the
// "press E" prompt, a short key row and the dock. Layout only — the cards live in ./hud, the numbers
// in ./hud/summary.ts. The first time Play opens on this device, How to play (./hud/HowToPlay)
// stands over it; the dock's button opens it again.

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
import { type JSX, useMemo, useState } from "react";
import { ActionDock, NearbyPrompt } from "./hud/ActionDock";
import { HowToPlay, howToPlaySeen } from "./hud/HowToPlay";
import { useOpenLand } from "./hud/openLand";
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
  const landWorld = useOpenLand();
  const story = useSessionStore(
    (state) => (state.activeInstance?.cartridge.story ?? null) !== null,
  );
  const [help, setHelp] = useState(() => !howToPlaySeen());
  // Shown over a drawn world only: while it loads, the loading card is what the player reads.
  const sceneReady = useWorldStore((state) => state.scene.status === "ready");
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
        {/* Holds the right edge when the card has nothing to say, so the turn panel stays put. */}
        <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
          <SystemPanel summary={summary} />
        </div>
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
        <ActionDock onHelp={() => setHelp(true)} />
      </div>
      <TogetherLayer />
      {help && sceneReady ? (
        <HowToPlay story={story} openLand={landWorld} onClose={() => setHelp(false)} />
      ) : null}
    </div>
  );
}
