// One place decides whether the engine may read the keyboard. Anything that owns text or a modal
// (console, dialogue, altar, a pending change proposal), any blocking operation
// (`session.busy`), and any screen that is not a playable world locks it.

import {
  type Screen,
  useEncounterStore,
  useEngineStore,
  useRunStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import type { RunOutcome } from "@shared/progression";
import { useEffect } from "react";

/**
 * Whether a decided fight ends play on this floor. Defeat always does. A cleared floor only does
 * when there is nowhere left to go: with stairs or a next scene still ahead, clearing it is the
 * objective met, and locking the keys would strand the player next to the exit.
 */
export function runBlocksPlay(outcome: RunOutcome, exits: number): boolean {
  return outcome === "defeated" || (outcome === "cleared" && exits === 0);
}

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
  /** True while the run-over overlay is up: the fight is decided, the keys are not yours. */
  runEnded: boolean;
  /** True while a `real_time_with_pause` cartridge is paused. */
  paused: boolean;
  /** True while the mechanics tweaker owns the keyboard. */
  tweakOpen: boolean;
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
    input.runEnded ||
    input.paused ||
    input.tweakOpen ||
    !input.sceneReady
  );
}

export function useInputLock(): void {
  const screen = useSessionStore((state) => state.screen);
  const consoleOpen = useSessionStore((state) => state.consoleOpen);
  const dialogueOpen = useSessionStore((state) => state.dialogue !== null);
  // The door at home is a modal like the altar: it owns the keys while it is open.
  const altarOpen = useSessionStore(
    (state) => state.altarOpen || state.doorOpen || state.notesOpen || state.episodeOpen !== null,
  );
  const busy = useSessionStore((state) => state.busy);
  const floorFailed = useSessionStore((state) => state.floorFailure !== null);
  const endingOpen = useSessionStore((state) => state.ending !== null);
  const proposalOpen = useSessionStore((state) => state.changeProposals.length > 0);
  const exits = useWorldStore((state) =>
    state.scene.status === "ready" ? state.scene.value.exits.length : 0,
  );
  const runEnded = useRunStore((state) => runBlocksPlay(state.outcome, exits));
  const paused = useEncounterStore((state) => state.paused);
  const tweakOpen = useSessionStore((state) => state.tweakOpen);
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
    runEnded,
    paused,
    tweakOpen,
    sceneReady,
  });

  useEffect(() => {
    useEngineStore.getState().setInputLocked(locked);
  }, [locked]);
}
