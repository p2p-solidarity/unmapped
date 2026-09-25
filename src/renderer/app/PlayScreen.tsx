// The running world: canvas underneath, HUD above it, modals above that. The floor transition is
// session state (`busy` + `floorFailure`), so the same value drives this overlay and the input lock.

import { GameCanvas } from "@renderer/engine";
import { isOpenLand2D, LandView2D } from "@renderer/engine2d";
import { useT } from "@renderer/i18n";
import { AltarPanel, DialogueCard } from "@renderer/narrative";
import { useRunStore, useSessionStore, useWorldStore } from "@renderer/state";
import { Button, colors, ErrorBlock, StatePanel, Surface, space, Text, zIndex } from "@renderer/ui";
import { EpisodePrefetch } from "@renderer/works";
import type { ReactNode } from "react";
import { useFloorAdvance } from "./advanceFloor";
import { ChangeProposalPanel } from "./ChangeProposalPanel";
import { Console } from "./Console";
import { Hud } from "./Hud";
import { ChapterPanel } from "./land/ChapterPanel";
import { chapterFelled } from "./land/chapters";
import { DoorPanel } from "./land/DoorPanel";
import { useErrandArrivals } from "./land/errands";
import { ForeignDoorCard } from "./land/ForeignDoorCard";
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
  const gameplayRules = useWorldStore((state) => state.gameplayRules);
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
  const hasStory = useSessionStore(
    (state) => (state.activeInstance?.cartridge.story ?? null) !== null,
  );
  const use2DLand = scene.status === "ready" && isOpenLand2D(scene.value, gameplayRules);
  const place = useSessionStore((state) => state.place);
  const instanceId = useSessionStore(
    (state) => state.activeInstance?.instance.meta.instanceId ?? null,
  );

  useInteractions({ onAdvanceFloor: advance, onDescend: descend });
  usePositionAutosave();
  useWitness();
  useErrandArrivals();

  // Losing on a generated floor: it regenerates identically from the save, so retrying is honest.
  const retryFloor = (): void => {
    // Falling inside a place sends the player back out to its entrance on the land.
    useSessionStore.getState().leavePlace();
    const active = useSessionStore.getState().activeInstance;
    if (active !== null) hydrateInstance(active);
    resetRun();
  };

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}>
      {place !== null ? (
        <GameCanvas key={`place:${place.id}`} graph={place.graph} rules={place.rules} />
      ) : use2DLand && scene.status === "ready" ? (
        <LandView2D
          // Another save (a new version of the same cartridge) is another walk: remount, so the
          // player starts where that save stands rather than where the last one left off.
          key={`${instanceId ?? "none"}:${scene.value.contract?.sceneId ?? scene.value.name}`}
          rawGraph={scene.value}
          onFelled={chapterFelled}
          gameplayRules={gameplayRules}
        />
      ) : (
        <GameCanvas />
      )}
      <Hud />
      <DialogueCard />
      <AltarPanel />
      <ChangeProposalPanel />
      <DoorPanel />
      <ForeignDoorCard />
      <ChapterPanel />
      {hasStory ? <EpisodePrefetch /> : null}
      <NotePanel />
      <TweakPanel />
      {consoleOpen ? <Console /> : null}

      {scene.status === "ready" ? null : (
        <OverlayCard>
          {scene.status === "error" ? (
            <>
              <Text variant="title" as="h2">
                {t("hud.sceneDidNotParse")}
              </Text>
              <ErrorBlock error={scene.error} />
              <Button variant="primary" onClick={() => toggleConsole(true)} hotkey="F12">
                {t("hud.openConsole")}
              </Button>
            </>
          ) : (
            <StatePanel
              state={scene}
              idleText={t("hud.noWorld")}
              loadingText={t("hud.loadingFloor")}
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
                {t("hud.generatingNote")}
              </Text>
              <Button variant="ghost" onClick={cancel}>
                {t("hud.cancelGeneration")}
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
            {t(runOutcome === "cleared" ? "hud.runCleared" : "hud.runOver")}
          </Text>
          <Text variant="title" as="h2">
            {t(runOutcome === "cleared" ? "hud.runClearedTitle" : "hud.runOverTitle")}
          </Text>
          <Text variant="body">{t("hud.runStats", { kills: runKills, score: runScore })}</Text>
          <div style={{ display: "flex", gap: space.sm }}>
            <Button
              variant="primary"
              onClick={() => {
                if (document.pointerLockElement !== null) document.exitPointerLock();
                setScreen("worlds");
              }}
            >
              {t("hud.backToLibrary")}
            </Button>
            {inDepths ? (
              <Button variant="ghost" onClick={retryFloor}>
                {t("depths.retryFloor")}
              </Button>
            ) : (
              <Button variant="ghost" onClick={resetRun}>
                {t("hud.keepLooking")}
              </Button>
            )}
          </div>
        </OverlayCard>
      )}

      {ending === null || busy !== null ? null : (
        <OverlayCard>
          <Text variant="label" tone="accent">
            {t("hud.cartridgeComplete")}
          </Text>
          <Text variant="title" as="h2">
            {ending.name}
          </Text>
          <Text variant="body">{ending.finale}</Text>
          {ending.depths ? (
            <Text variant="caption" tone="muted">
              {t("depths.depthsNote")}
            </Text>
          ) : null}
          <div style={{ display: "flex", gap: space.sm }}>
            {ending.depths ? (
              <Button variant="primary" onClick={descend}>
                {t("depths.enterDepths")}
              </Button>
            ) : null}
            <Button
              variant={ending.depths ? "secondary" : "primary"}
              onClick={() => {
                if (document.pointerLockElement !== null) document.exitPointerLock();
                setScreen("worlds");
              }}
            >
              {t("hud.backToLibrary")}
            </Button>
            <Button variant="ghost" onClick={() => setEnding(null)}>
              {t("hud.stayFinale")}
            </Button>
          </div>
        </OverlayCard>
      )}

      {failure === null || busy !== null ? null : (
        <OverlayCard>
          <Text variant="title" as="h2">
            {t("hud.floorNotWritten", { floor: failure.floor })}
          </Text>
          <ErrorBlock error={failure.error} />
          <div style={{ display: "flex", gap: space.sm }}>
            <Button variant="primary" onClick={retry}>
              {t("common.retry")}
            </Button>
            <Button variant="ghost" onClick={stay}>
              {t("hud.stayFloor")}
            </Button>
          </div>
        </OverlayCard>
      )}
    </div>
  );
}
