// The running world: canvas underneath, HUD above it, modals above that. The floor transition is
// session state (`busy` + `floorFailure`), so the same value drives this overlay and the input lock.

import { GameCanvas } from "@renderer/engine";
import { useT } from "@renderer/i18n";
import { AltarPanel, DialogueCard } from "@renderer/narrative";
import { useRunStore, useSessionStore, useWorldStore } from "@renderer/state";
import { Button, colors, ErrorBlock, StatePanel, Surface, space, Text, zIndex } from "@renderer/ui";
import type { ReactNode } from "react";
import { useFloorAdvance } from "./advanceFloor";
import { ChangeProposalPanel } from "./ChangeProposalPanel";
import { Console } from "./Console";
import { Hud } from "./Hud";
import { DoorPanel } from "./land/DoorPanel";
import { useErrandArrivals } from "./land/errands";
import { NotePanel } from "./land/NotePanel";
import { useWitness } from "./land/witness";
import { TweakPanel } from "./TweakPanel";
import { runBlocksPlay } from "./useInputLock";
import { hydrateInstance } from "./useInstanceLoader";
import { useInteractions } from "./useInteractions";
import { usePositionAutosave } from "./usePositionAutosave";

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
  const runOutcome = useRunStore((state) => state.outcome);
  const runScore = useRunStore((state) => state.score);
  const runKills = useRunStore((state) => state.kills);
  const resetRun = useRunStore((state) => state.reset);
  const { advance, retry, stay, cancel, descend } = useFloorAdvance();
  const t = useT();
  const inDepths = useSessionStore(
    (state) => state.activeInstance?.instance.save.endless !== undefined,
  );
  const legacy = useWorldStore((state) => state.origin?.kind === "legacy");

  useInteractions({ onAdvanceFloor: advance, onDescend: descend });
  usePositionAutosave();
  useWitness();
  useErrandArrivals();

  // Losing on a generated floor: it regenerates identically from the save, so retrying is honest.
  const retryFloor = (): void => {
    const active = useSessionStore.getState().activeInstance;
    if (active !== null) hydrateInstance(active);
    resetRun();
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      <GameCanvas />
      <Hud />
      <DialogueCard />
      <AltarPanel />
      <ChangeProposalPanel />
      <DoorPanel />
      <NotePanel />
      <TweakPanel />
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
          {legacy ? (
            <>
              <Text variant="body" tone="muted">
                The main process is generating and validating this scene before it appears.
              </Text>
              <Button variant="ghost" onClick={cancel}>
                Cancel generation
              </Button>
            </>
          ) : null}
        </OverlayCard>
      )}

      {/* A cleared floor with stairs still ahead is an objective met, not the end of play. */}
      {!runBlocksPlay(runOutcome, scene.status === "ready" ? scene.value.exits.length : 0) ||
      busy !== null ? null : (
        <OverlayCard>
          <Text variant="label" tone={runOutcome === "cleared" ? "accent" : "danger"}>
            {runOutcome === "cleared" ? "RUN CLEARED" : "RUN OVER"}
          </Text>
          <Text variant="title" as="h2">
            {runOutcome === "cleared" ? "這一局清乾淨了" : "你倒下了"}
          </Text>
          <Text variant="body">{`${runKills} kills · score ${runScore}`}</Text>
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
            {inDepths ? (
              <Button variant="ghost" onClick={retryFloor}>
                {t("retryFloor")}
              </Button>
            ) : (
              <Button variant="ghost" onClick={resetRun}>
                Keep looking around
              </Button>
            )}
          </div>
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
          {ending.depths ? (
            <Text variant="caption" tone="muted">
              {t("depthsNote")}
            </Text>
          ) : null}
          <div style={{ display: "flex", gap: space.sm }}>
            {ending.depths ? (
              <Button variant="primary" onClick={descend}>
                {t("enterDepths")}
              </Button>
            ) : null}
            <Button
              variant={ending.depths ? "secondary" : "primary"}
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
