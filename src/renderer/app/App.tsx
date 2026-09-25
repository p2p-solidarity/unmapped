// Root of the renderer: screen routing, the global keyboard, and the four cross-cutting hooks
// (inference sync, input lock, world hot-reload, world persistence).

import { CreateScreen, useInferenceSync } from "@renderer/narrative";
import { useLandSync } from "@renderer/net/landSync";
import { useActiveRoom } from "@renderer/net/lifecycle";
import { leaveActiveRoom, useRoomSync } from "@renderer/net/sync";
import { useSessionStore } from "@renderer/state";
import { WorksScreen } from "@renderer/works";
import { useEffect, useMemo, useRef } from "react";
import { hotkeyAction, isTypingTarget } from "./hotkeys";
import { type InferenceSync, InferenceSyncContext } from "./inferenceSync";
import { NewWorldScreen } from "./NewWorldScreen";
import { PlayScreen } from "./PlayScreen";
import { SeedScreen } from "./SeedScreen";
import { Toasts } from "./Toasts";
import { useInputLock } from "./useInputLock";
import { openInstance } from "./useInstanceLoader";
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
          state.altarOpen || state.doorOpen || state.notesOpen || state.episodeOpen !== null,
        dialogueOpen: state.dialogue !== null,
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
          state.closeDoor();
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
  const setScreen = useSessionStore((state) => state.setScreen);

  switch (screen) {
    case "worlds":
      return <WorldsScreen />;
    case "seed":
      return <SeedScreen />;
    case "create":
      return <NewWorldScreen />;
    case "remix":
      return (
        <CreateScreen
          onCancel={() => setScreen("worlds")}
          onCreated={(meta) => {
            void openInstance(meta.instanceId);
          }}
        />
      );
    case "play":
      return <PlayScreen />;
    case "workspace":
      return <WorkspaceScreen />;
    case "works":
      return <WorksScreen />;
  }
}

function useLeaveRoomAfterPlay(): void {
  const screen = useSessionStore((state) => state.screen);
  const previous = useRef(screen);
  useEffect(() => {
    const wasPlaying = previous.current === "play";
    previous.current = screen;
    if (!wasPlaying || screen === "play") return;
    void leaveActiveRoom().then((result) => {
      if (result.ok) return;
      const session = useSessionStore.getState();
      session.toast("danger", `Could not leave the hosted room: ${result.error.message}`);
      session.setScreen("play");
    });
  }, [screen]);
}

export function App() {
  const sync = useInferenceSync();
  const activeRoom = useActiveRoom();
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
  useWorldSync();
  usePersistWorld();
  useRoomSync(activeRoom);
  useLandSync(activeRoom);
  useLeaveRoomAfterPlay();

  return (
    <InferenceSyncContext.Provider value={syncValue}>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Screens />
      </div>
      <Toasts />
    </InferenceSyncContext.Provider>
  );
}
