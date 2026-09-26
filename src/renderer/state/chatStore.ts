// What friends said on the continent this player is on (docs/plans/simplify-together.md → Chat).
// Memory only: at most CHAT_KEEP lines, emptied when the continent is left, never saved, never in a
// history or on the continent's document. Lines from others arrive through the gate (net/
// continentGate.ts) already cleaned; this player's own lines are echoed here when sent.

import { create } from "zustand";

/** Lines kept; older ones fall off. */
export const CHAT_KEEP = 50;

export interface ChatLine {
  id: number;
  /** Who said it, as that world's awareness named it; null shows as "a friend". */
  name: string | null;
  /** This player's own line. */
  mine: boolean;
  text: string;
  /** When it arrived here (Date.now()). */
  at: number;
}

export interface ChatState {
  lines: ChatLine[];
  push(line: Omit<ChatLine, "id">): void;
  clear(): void;
}

let nextId = 1;

export const useChatStore = create<ChatState>()((set) => ({
  lines: [],
  push: (line) => {
    const id = nextId;
    nextId += 1;
    set((state) => ({ lines: [...state.lines, { ...line, id }].slice(-CHAT_KEEP) }));
  },
  clear: () => set((state) => (state.lines.length === 0 ? state : { lines: [] })),
}));
