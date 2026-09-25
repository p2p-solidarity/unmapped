// Bottom dock + the "press E" prompt. The prompt text is resolved by the engine (nearbyPrompt);
// the dock is pure chrome — every button toggles state that already exists.

import { nextCameraMode } from "@renderer/engine/Player";
import {
  useCharacterStore,
  useEngineStore,
  usePlatformStore,
  useSessionStore,
} from "@renderer/state";
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
  const setIsCustomizing = useCharacterStore((state) => state.setIsCustomizing);
  const toggleEditor = usePlatformStore((state) => state.toggleEditor);
  const draftCount = usePlatformStore((state) => state.drafts.length);
  const toggleConsole = useSessionStore((state) => state.toggleConsole);
  const setScreen = useSessionStore((state) => state.setScreen);
  const cameraMode = useEngineStore((state) => state.cameraMode);
  const setCameraMode = useEngineStore((state) => state.setCameraMode);

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
      <Button variant="secondary" onClick={() => setIsCustomizing(true)} style={dockButton}>
        Avatar Class / 職業
      </Button>
      <Button variant="primary" onClick={() => toggleEditor()} style={dockButton}>
        {draftCount === 0
          ? "Platform Editor / 平台編輯"
          : `Platform Editor · ${draftCount} draft${draftCount === 1 ? "" : "s"}`}
      </Button>
      <Button variant="secondary" onClick={() => toggleConsole()} hotkey="F12" style={dockButton}>
        Console / 終端
      </Button>
      <Button
        variant="secondary"
        onClick={() => setCameraMode(nextCameraMode(cameraMode))}
        hotkey="C"
        style={dockButton}
      >
        {`Cam: ${cameraMode.toUpperCase()}`}
      </Button>
    </div>
  );
}
