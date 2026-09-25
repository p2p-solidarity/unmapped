// One place decides whether the engine may read the keyboard. Anything that owns text or a modal
// (console, dialogue, altar, the character sheet, the platform editor), any blocking operation
// (`session.busy`), and any screen that is not a playable world locks it.

import {
  type Screen,
  useCharacterStore,
  useEngineStore,
  usePlatformStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { useEffect } from "react";

export interface LockInput {
  screen: Screen;
  consoleOpen: boolean;
  dialogueOpen: boolean;
  altarOpen: boolean;
  /** Label of a blocking operation, or null. */
  busy: string | null;
  /** True while the "floor was not written" overlay waits for Retry / Stay. */
  floorFailed: boolean;
  /** True while the cartridge's finale overlay is shown. */
  endingOpen: boolean;
  /** True while a model-authored change waits for an explicit player decision. */
  proposalOpen: boolean;
  editorOpen: boolean;
  customizing: boolean;
  sceneReady: boolean;
}

/** Pure so the lock rule is unit-tested instead of being re-derived in every overlay. */
export function derivedLock(input: LockInput): boolean {
  if (input.screen !== "play") return true;
  return (
    input.consoleOpen ||
    input.dialogueOpen ||
    input.altarOpen ||
    input.busy !== null ||
    input.floorFailed ||
    input.endingOpen ||
    input.proposalOpen ||
    input.editorOpen ||
    input.customizing ||
    !input.sceneReady
  );
}

export function useInputLock(): void {
  const screen = useSessionStore((state) => state.screen);
  const consoleOpen = useSessionStore((state) => state.consoleOpen);
  const dialogueOpen = useSessionStore((state) => state.dialogue !== null);
  const altarOpen = useSessionStore((state) => state.altarOpen);
  const busy = useSessionStore((state) => state.busy);
  const floorFailed = useSessionStore((state) => state.floorFailure !== null);
  const endingOpen = useSessionStore((state) => state.ending !== null);
  const proposalOpen = useSessionStore((state) => state.changeProposals.length > 0);
  const editorOpen = usePlatformStore((state) => state.editorOpen);
  const customizing = useCharacterStore((state) => state.isCustomizing);
  const sceneReady = useWorldStore((state) => state.scene.status === "ready");

  const locked = derivedLock({
    screen,
    consoleOpen,
    dialogueOpen,
    altarOpen,
    busy,
    floorFailed,
    endingOpen,
    proposalOpen,
    editorOpen,
    customizing,
    sceneReady,
  });

  useEffect(() => {
    useEngineStore.getState().setInputLocked(locked);
  }, [locked]);
}
