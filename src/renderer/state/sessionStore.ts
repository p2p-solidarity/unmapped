// Screen routing + transient UI state for the running session.

import type { ResolvedInstance } from "@shared/cartridge";
import type { ChangeProposal } from "@shared/effects";
import type { PlayerProfile } from "@shared/player";
import type { AppError, Loadable } from "@shared/result";
import { idle } from "@shared/result";
import type { DialogueGraph, ItemSpec } from "@shared/world";
import { create } from "zustand";

/**
 * `seed` is New Game: a new land of the one game. `create` (a whole new game written by the model)
 * and `remix` (the full authoring flow) are advanced entries.
 */
export type Screen = "worlds" | "seed" | "create" | "remix" | "play" | "workspace" | "works";

export interface Toast {
  id: number;
  tone: "info" | "success" | "danger";
  text: string;
}

/** A floor the model could not write. The player chooses Retry or Stay; nothing is invented. */
export interface FloorFailure {
  /** Exit label that was being descended into; retrying re-uses it. */
  to: string;
  floor: number;
  error: AppError;
}

/** The cartridge was completed from its terminal scene; PlayScreen shows the finale. */
export interface CartridgeEnding {
  /** Cartridge name (UI chrome). */
  name: string;
  /** The story's finale text, in the player's language. */
  finale: string;
  /** The cartridge has a walkable scene, so generated floors can continue below the ending. */
  depths: boolean;
}

export interface SessionState {
  screen: Screen;
  ending: CartridgeEnding | null;
  consoleOpen: boolean;
  /** Active NPC encounter; null when no dialogue card is on screen. */
  dialogue: Loadable<DialogueGraph> | null;
  dialogueNpcId: string | null;
  /**
   * The words were written when the place was witnessed. Such a dialogue is read, never
   * generated or resolved by a model (plan.md §1.4); `dialogueSpeaker` is who says it.
   */
  dialogueWitnessed: boolean;
  dialogueSpeaker: string | null;
  /** Active altar (wish) session; null when closed. */
  altarOpen: boolean;
  /** True while the mechanics tweaker is open. */
  tweakOpen: boolean;
  /** True while the door at home is open (open land). */
  doorOpen: boolean;
  /** True while the notes of the chunk underfoot are open (open land). */
  notesOpen: boolean;
  /** Id of the story episode whose gate is open (its world is played in a panel); null when shut. */
  episodeOpen: string | null;
  altarResult: Loadable<ItemSpec>;
  /** Identity: which key unlocked saves this session. */
  unlock: { method: "prf" | "keychain"; credentialId: string | null } | null;
  toasts: Toast[];
  /** Label of a blocking operation that owns the screen ("Weaving floor 3…"); null when free. */
  busy: string | null;
  floorFailure: FloorFailure | null;
  /** Join code of the active room, or null when playing solo. Published by src/renderer/net. */
  roomCode: string | null;
  /** Peers present in that room. Only meaningful while `roomCode !== null`. */
  peerCount: number;
  activeWorkspaceId: string | null;
  changeProposals: ChangeProposal[];
  /** Last main-verified instance. Runtime sessions may only use this exact pin. */
  activeInstance: ResolvedInstance | null;
  playerProfile: PlayerProfile | null;
  networkRole: "solo" | "host" | "peer";

  setScreen(screen: Screen): void;
  setEnding(ending: CartridgeEnding | null): void;
  toggleConsole(open?: boolean): void;
  openDialogue(npcId: string): void;
  /** Opens a stored dialogue; it is already ready or already an error — nothing is loading. */
  showWitnessedDialogue(npcId: string, speaker: string, dialogue: Loadable<DialogueGraph>): void;
  setDialogue(state: Loadable<DialogueGraph>): void;
  closeDialogue(): void;
  openAltar(): void;
  toggleTweak(open?: boolean): void;
  openDoor(): void;
  closeDoor(): void;
  openEpisode(id: string): void;
  closeEpisode(): void;
  toggleNotes(open?: boolean): void;
  closeTweak(): void;
  setAltarResult(state: Loadable<ItemSpec>): void;
  closeAltar(): void;
  setUnlock(unlock: SessionState["unlock"]): void;
  toast(tone: Toast["tone"], text: string): void;
  dismissToast(id: number): void;
  setBusy(label: string | null): void;
  setFloorFailure(failure: FloorFailure | null): void;
  setRoomCode(code: string | null): void;
  setPeerCount(count: number): void;
  openWorkspace(workspaceId: string): void;
  addChangeProposal(proposal: ChangeProposal): void;
  removeChangeProposal(proposalId: string): void;
  clearChangeProposals(): void;
  setActiveInstance(instance: ResolvedInstance | null): void;
  setPlayerProfile(profile: PlayerProfile | null): void;
  setNetworkRole(role: SessionState["networkRole"]): void;
}

let toastSeq = 0;

export const useSessionStore = create<SessionState>()((set) => ({
  screen: "worlds",
  ending: null,
  consoleOpen: false,
  dialogue: null,
  dialogueNpcId: null,
  dialogueWitnessed: false,
  dialogueSpeaker: null,
  altarOpen: false,
  tweakOpen: false,
  doorOpen: false,
  episodeOpen: null,
  notesOpen: false,
  altarResult: idle(),
  unlock: null,
  toasts: [],
  busy: null,
  floorFailure: null,
  roomCode: null,
  peerCount: 0,
  activeWorkspaceId: null,
  changeProposals: [],
  activeInstance: null,
  playerProfile: null,
  networkRole: "solo",

  // Leaving the play screen drops the finale overlay with it.
  // Leaving Play drops the finale overlay and any unapproved proposals with it.
  setScreen: (screen) =>
    set(
      screen === "play"
        ? { screen }
        : {
            screen,
            ending: null,
            changeProposals: [],
            doorOpen: false,
            notesOpen: false,
            episodeOpen: null,
          },
    ),
  setEnding: (ending) => set({ ending }),
  toggleConsole: (open) => set((state) => ({ consoleOpen: open ?? !state.consoleOpen })),
  openDialogue: (npcId) =>
    set({
      dialogueNpcId: npcId,
      dialogue: { status: "loading" },
      dialogueWitnessed: false,
      dialogueSpeaker: null,
    }),
  showWitnessedDialogue: (npcId, speaker, dialogue) =>
    set({ dialogueNpcId: npcId, dialogue, dialogueWitnessed: true, dialogueSpeaker: speaker }),
  setDialogue: (dialogue) => set({ dialogue }),
  closeDialogue: () =>
    set({ dialogue: null, dialogueNpcId: null, dialogueWitnessed: false, dialogueSpeaker: null }),
  openAltar: () => set({ altarOpen: true, altarResult: idle() }),
  toggleTweak: (open) => set((state) => ({ tweakOpen: open ?? !state.tweakOpen })),
  closeTweak: () => set({ tweakOpen: false }),
  openDoor: () => set({ doorOpen: true }),
  closeDoor: () => set({ doorOpen: false }),
  openEpisode: (episodeOpen) => set({ episodeOpen }),
  closeEpisode: () => set({ episodeOpen: null }),
  toggleNotes: (open) => set((state) => ({ notesOpen: open ?? !state.notesOpen })),
  setAltarResult: (altarResult) => set({ altarResult }),
  closeAltar: () => set({ altarOpen: false, altarResult: idle() }),
  setUnlock: (unlock) => set({ unlock }),
  toast: (tone, text) =>
    set((state) => ({ toasts: [...state.toasts, { id: ++toastSeq, tone, text }] })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  setBusy: (busy) => set({ busy }),
  setFloorFailure: (floorFailure) => set({ floorFailure }),
  // Leaving a room clears the peer count with it: a stale "3 peers" is fake data (Rule 2).
  setRoomCode: (roomCode) => set(roomCode === null ? { roomCode, peerCount: 0 } : { roomCode }),
  setPeerCount: (peerCount) => set({ peerCount: Math.max(0, Math.trunc(peerCount)) }),
  openWorkspace: (activeWorkspaceId) => set({ activeWorkspaceId, screen: "workspace" }),
  addChangeProposal: (proposal) =>
    set((state) => ({ changeProposals: [...state.changeProposals, proposal] })),
  removeChangeProposal: (proposalId) =>
    set((state) => ({
      changeProposals: state.changeProposals.filter(
        (proposal) => proposal.proposalId !== proposalId,
      ),
    })),
  clearChangeProposals: () => set({ changeProposals: [] }),
  setActiveInstance: (activeInstance) => set({ activeInstance }),
  setPlayerProfile: (playerProfile) => set({ playerProfile }),
  setNetworkRole: (networkRole) => set({ networkRole }),
}));
