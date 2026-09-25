// Bottom dock + the "press E" prompt. The prompt text is resolved by the engine (nearbyPrompt);
// the dock is pure chrome — every button toggles state that already exists.

import { useEngineStore, useSessionStore } from "@renderer/state";
import { Button, colors, font, radius, space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { nearbyPrompt } from "../prompts";

const dockButton = { fontSize: font.size.caption, padding: `${space.xs}px ${space.md}px` };

export function NearbyPrompt(): JSX.Element | null {
  const nearby = useEngineStore((state) => state.nearby);
  const prompt = nearbyPrompt(nearby);
  if (prompt === null) return null;
  return (
    <div
      style={{
        padding: `${space.sm}px ${space.xl}px`,
        background: colors.bgOverlay,
        border: `1px solid ${colors.accent}`,
        borderRadius: radius.md,
        display: "flex",
        alignItems: "center",
        gap: space.md,
      }}
    >
      <kbd
        style={{
          fontFamily: font.mono,
          fontSize: font.size.caption,
          padding: "2px 8px",
          background: colors.accent,
          color: colors.accentInk,
          borderRadius: radius.sm,
          fontWeight: font.weight.bold,
        }}
      >
        E
      </kbd>
      <Text variant="bodyLarge" tone="accent" style={{ letterSpacing: 1 }}>
        {prompt}
      </Text>
    </div>
  );
}

export function ActionDock(): JSX.Element {
  const toggleConsole = useSessionStore((state) => state.toggleConsole);
  const toggleTweak = useSessionStore((state) => state.toggleTweak);
  const setScreen = useSessionStore((state) => state.setScreen);
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const look = useEngineStore((state) => state.landLook);
  // Open land has one camera but two looks; every other scene's kit holds its camera.
  const openLand = useEngineStore((state) => state.chunk !== null);

  return (
    <div
      style={{
        display: "flex",
        gap: space.xs,
        padding: "6px 10px",
        background: colors.bgOverlay,
        borderRadius: radius.lg,
        border: `1px solid ${colors.accent}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 16px ${colors.accentSoft}`,
      }}
    >
      <Button
        variant="ghost"
        onClick={() => {
          if (document.pointerLockElement !== null) document.exitPointerLock();
          toggleConsole(false);
          setScreen("worlds");
        }}
        style={dockButton}
      >
        ← 主頁
      </Button>
      <Button variant="secondary" onClick={() => toggleTweak()} style={dockButton}>
        調整機制
      </Button>
      <Button variant="secondary" onClick={() => toggleConsole()} hotkey="F12" style={dockButton}>
        Console / 終端
      </Button>
      {openLand ? (
        <Button
          variant="secondary"
          hotkey="N"
          onClick={() => {
            if (document.pointerLockElement !== null) document.exitPointerLock();
            useSessionStore.getState().toggleNotes(true);
          }}
          style={dockButton}
        >
          手記 Notes
        </Button>
      ) : null}
      {openLand ? (
        <Button
          variant="secondary"
          hotkey="V"
          onClick={() => {
            const engine = useEngineStore.getState();
            engine.setLandLook(engine.landLook === "hd2d" ? "pixel" : "hd2d");
          }}
          style={dockButton}
        >
          {`Look: ${look === "hd2d" ? "HD-2D" : "16-bit"}`}
        </Button>
      ) : (
        <Button variant="secondary" disabled style={dockButton}>
          {`Cam: ${cameraMode.toUpperCase()} · scene locked`}
        </Button>
      )}
    </div>
  );
}
