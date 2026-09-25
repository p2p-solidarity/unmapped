// The running world: canvas underneath, HUD above it, modals above that. The floor transition is
// session state (`busy` + `floorFailure`), so the same value drives this overlay and the input lock.

import { GameCanvas } from "@renderer/engine";
import { AltarPanel, DialogueCard } from "@renderer/narrative";
import { useSessionStore, useWorldStore } from "@renderer/state";
import { Button, colors, ErrorBlock, StatePanel, Surface, space, Text, zIndex } from "@renderer/ui";
import type { ReactNode } from "react";
import { useFloorAdvance } from "./advanceFloor";
import { CharacterSelectModal } from "./CharacterSelectModal";
import { Console } from "./Console";
import { Hud } from "./Hud";
import { PlatformEditorModal } from "./PlatformEditorModal";
import { useInteractions } from "./useInteractions";

function CenterOverlay({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: space.xl,
        background: colors.bgOverlay,
        zIndex: zIndex.overlay,
      }}
    >
      {children}
    </div>
  );
}

function OverlayCard({ children }: { children: ReactNode }) {
  return (
    <CenterOverlay>
      <Surface variant="card" padding="xl" style={{ maxWidth: 560, width: "100%" }}>
        {children}
      </Surface>
    </CenterOverlay>
  );
}

export function PlayScreen() {
  const consoleOpen = useSessionStore((state) => state.consoleOpen);
  const toggleConsole = useSessionStore((state) => state.toggleConsole);
  const busy = useSessionStore((state) => state.busy);
  const failure = useSessionStore((state) => state.floorFailure);
  const ending = useSessionStore((state) => state.ending);
  const setEnding = useSessionStore((state) => state.setEnding);
  const setScreen = useSessionStore((state) => state.setScreen);
  const scene = useWorldStore((state) => state.scene);
  const { advance, retry, stay } = useFloorAdvance();

  useInteractions({ onAdvanceFloor: advance });

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      <GameCanvas />
      <Hud />
      <PlatformEditorModal />
      <CharacterSelectModal />
      <DialogueCard />
      <AltarPanel />
      {consoleOpen ? <Console /> : null}

      {scene.status === "ready" ? null : (
        <OverlayCard>
          {scene.status === "error" ? (
            <>
              <Text variant="title" as="h2">
                world.oui did not parse
              </Text>
              <ErrorBlock error={scene.error} />
              <Button variant="primary" onClick={() => toggleConsole(true)} hotkey="F12">
                Open console
              </Button>
            </>
          ) : (
            <StatePanel
              state={scene}
              idleText="No world is loaded."
              loadingText="Loading this floor…"
            >
              {() => null}
            </StatePanel>
          )}
        </OverlayCard>
      )}

      {busy === null ? null : (
        <OverlayCard>
          <Text variant="title" as="h2">
            {busy}
          </Text>
          <Text variant="body" tone="muted">
            The model is writing this floor in OpenUI Lang…
          </Text>
        </OverlayCard>
      )}

      {ending === null || busy !== null ? null : (
        <OverlayCard>
          <Text variant="label" tone="accent">
            CARTRIDGE COMPLETE
          </Text>
          <Text variant="title" as="h2">
            {ending.name}
          </Text>
          <Text variant="body">{ending.finale}</Text>
          <div style={{ display: "flex", gap: space.sm }}>
            <Button
              variant="primary"
              onClick={() => {
                if (document.pointerLockElement !== null) document.exitPointerLock();
                setScreen("worlds");
              }}
            >
              Back to library
            </Button>
            <Button variant="ghost" onClick={() => setEnding(null)}>
              Stay in the finale
            </Button>
          </div>
        </OverlayCard>
      )}

      {failure === null || busy !== null ? null : (
        <OverlayCard>
          <Text variant="title" as="h2">
            {`Floor ${failure.floor} was not written`}
          </Text>
          <ErrorBlock error={failure.error} />
          <div style={{ display: "flex", gap: space.sm }}>
            <Button variant="primary" onClick={retry}>
              Retry
            </Button>
            <Button variant="ghost" onClick={stay}>
              Stay on this floor
            </Button>
          </div>
        </OverlayCard>
      )}
    </div>
  );
}
