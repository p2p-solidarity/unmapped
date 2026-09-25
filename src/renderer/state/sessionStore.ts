// Screen routing + transient UI state for the running session.

import type { AppError, Loadable } from "@shared/result";
import { idle } from "@shared/result";
import type { DialogueGraph, ItemSpec } from "@shared/world";
import { create } from "zustand";

export type Screen = "worlds" | "genesis" | "play" | "workspace";

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
}

export interface SessionState {
  screen: Screen;
  ending: CartridgeEnding | null;
  consoleOpen: boolean;
  /** Active NPC encounter; null when no dialogue card is on screen. */
  dialogue: Loadable<DialogueGraph> | null;
  dialogueNpcId: string | null;
  /** Active altar (wish) session; null when closed. */
  altarOpen: boolean;
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

  setScreen(screen: Screen): void;
  setEnding(ending: CartridgeEnding | null): void;
  toggleConsole(open?: boolean): void;
  openDialogue(npcId: string): void;
  setDialogue(state: Loadable<DialogueGraph>): void;
  closeDialogue(): void;
  openAltar(): void;
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
}

let toastSeq = 0;

export const useSessionStore = create<SessionState>()((set) => ({
  screen: "worlds",
  ending: null,
  consoleOpen: false,
  dialogue: null,
  dialogueNpcId: null,
  altarOpen: false,
  altarResult: idle(),
  unlock: null,
  toasts: [],
  busy: null,
  floorFailure: null,
  roomCode: null,
  peerCount: 0,
  activeWorkspaceId: null,

  // Leaving the play screen drops the finale overlay with it.
  setScreen: (screen) => set(screen === "play" ? { screen } : { screen, ending: null }),
  setEnding: (ending) => set({ ending }),
  toggleConsole: (open) => set((state) => ({ consoleOpen: open ?? !state.consoleOpen })),
  openDialogue: (npcId) => set({ dialogueNpcId: npcId, dialogue: { status: "loading" } }),
  setDialogue: (dialogue) => set({ dialogue }),
  closeDialogue: () => set({ dialogue: null, dialogueNpcId: null }),
  openAltar: () => set({ altarOpen: true, altarResult: idle() }),
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
}));
