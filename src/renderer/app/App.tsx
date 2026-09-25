// Root of the renderer: screen routing, the global keyboard, and the four cross-cutting hooks
// (inference sync, input lock, world hot-reload, world persistence).

import { GenesisScreen, useInferenceSync } from "@renderer/narrative";
import { useSessionStore } from "@renderer/state";
import { useEffect, useMemo, useRef } from "react";
import { hotkeyAction, isTypingTarget } from "./hotkeys";
import { type InferenceSync, InferenceSyncContext } from "./inferenceSync";
import { PlayScreen } from "./PlayScreen";
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
        altarOpen: state.altarOpen,
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
    case "genesis":
      return (
        <GenesisScreen
          onCreated={(meta) => {
            void openInstance(meta.instanceId);
          }}
          onCancel={() => setScreen("worlds")}
        />
      );
    case "play":
      return <PlayScreen />;
    case "workspace":
      return <WorkspaceScreen />;
  }
}

export function App() {
  const sync = useInferenceSync();
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

  return (
    <InferenceSyncContext.Provider value={syncValue}>
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <Screens />
      </div>
      <Toasts />
    </InferenceSyncContext.Provider>
  );
}
