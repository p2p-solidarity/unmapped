// Root of the renderer: screen routing, the global keyboard and gamepad, and the four cross-cutting
// hooks (inference sync, input lock, world hot-reload, world persistence).

import { TitleDiorama } from "@renderer/hd2d";
import { errorLine, translate } from "@renderer/i18n";
import { useGamepad } from "@renderer/input";
import { useInferenceSync } from "@renderer/narrative";
import { setActiveContinent, useActiveContinent } from "@renderer/net/continent";
import { useContinentSync } from "@renderer/net/continentSync";
import { useActiveRoom } from "@renderer/net/lifecycle";
import { leaveActiveRoom, useRoomSync } from "@renderer/net/sync";
import { useContinentStore, useSessionStore } from "@renderer/state";
import { WorksScreen } from "@renderer/works";
import { useEffect, useMemo, useRef } from "react";
import { CreateGameScreen } from "./create/CreateGameScreen";
import { hotkeyAction, isTypingTarget } from "./hotkeys";
import { type InferenceSync, InferenceSyncContext } from "./inferenceSync";
import { LibraryScreen } from "./library/LibraryScreen";
import { PlayScreen } from "./PlayScreen";
import { Toasts } from "./Toasts";
import { useInputLock } from "./useInputLock";
import { usePersistWorld } from "./usePersistWorld";
import { useWorldSync } from "./useWorldLoader";
import { WorkspaceScreen } from "./WorkspaceScreen";
import { WorldsScreen } from "./WorldsScreen";

function useGlobalKeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const state = useSessionStore.getState();
      const action = hotkeyAction(event.code, {
        screen: state.screen,
        consoleOpen: state.consoleOpen,
        altarOpen:
          state.altarOpen ||
          state.tweakOpen ||
          state.doorOpen ||
          state.notesOpen ||
          state.episodeOpen !== null ||
          useContinentStore.getState().doorCard !== null,
        dialogueOpen: state.dialogue !== null,
        proposalOpen: state.changeProposals.length > 0,
        typing: isTypingTarget(event.target),
      });
      if (action === null) return;
      event.preventDefault();
      switch (action) {
        case "toggle-console":
          state.toggleConsole();
          return;
        case "close-console":
          state.toggleConsole(false);
          return;
        case "close-altar":
          state.closeAltar();
          state.closeTweak();
          state.closeDoor();
          useContinentStore.getState().openDoorCard(null);
          state.toggleNotes(false);
          state.closeEpisode();
          return;
        case "close-dialogue":
          state.closeDialogue();
          return;
        case "exit-play":
          if (document.pointerLockElement !== null) document.exitPointerLock();
          state.setScreen("worlds");
          return;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function Screens() {
  const screen = useSessionStore((state) => state.screen);

  switch (screen) {
    case "worlds":
      return <WorldsScreen />;
    case "library":
      return <LibraryScreen />;
    case "create":
      return <CreateGameScreen />;
    case "play":
      return <PlayScreen />;
    case "workspace":
      return <WorkspaceScreen />;
    case "works":
      return <WorksScreen />;
  }
}

/** Menus stand over one living land, kept across menu changes so its drift never restarts. */
const LIVE_BACKDROP: ReadonlySet<string> = new Set(["worlds", "library", "create", "workspace"]);

function MenuBackdrop() {
  const screen = useSessionStore((state) => state.screen);
  if (!LIVE_BACKDROP.has(screen)) return null;
  return (
    <div className="g-backdrop" aria-hidden="true">
      <TitleDiorama seedText="unwritten-land:title:318" />
    </div>
  );
}

function useLeaveRoomAfterPlay(): void {
  const screen = useSessionStore((state) => state.screen);
  const previous = useRef(screen);
  useEffect(() => {
    const wasPlaying = previous.current === "play";
    previous.current = screen;
    if (!wasPlaying || screen === "play") return;
    // The world goes back to the shelf, so it leaves the continent it was merged into.
    setActiveContinent(null);
    void leaveActiveRoom().then((result) => {
      if (result.ok) return;
      const session = useSessionStore.getState();
      session.toast(
        "danger",
        translate("title.leaveRoomFailed", { reason: errorLine(result.error) }),
      );
      session.setScreen("play");
    });
  }, [screen]);
}

export function App() {
  const sync = useInferenceSync();
  const activeRoom = useActiveRoom();
  const activeContinent = useActiveContinent();
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  }, [sync]);
  // Stable identity so consumers of the context do not re-render on every App render.
  const syncValue = useMemo<InferenceSync>(
    () => ({
      refreshProbe: () => {
        void syncRef.current.refreshProbe();
      },
    }),
    [],
  );

  useInputLock();
  useGlobalKeys();
  // One pad poller for every screen: it plays the land as keys and drives menus by focus.
  useGamepad();
  useWorldSync();
  usePersistWorld();
  useRoomSync(activeRoom);
  useContinentSync(activeContinent);
  useLeaveRoomAfterPlay();

  return (
    <InferenceSyncContext.Provider value={syncValue}>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <MenuBackdrop />
        <Screens />
      </div>
      <Toasts />
    </InferenceSyncContext.Provider>
  );
}
