// The visual platform editor's scratch pad. Everything in here is an UNSAVED DRAFT: world state
// lives only in the world's dotfiles (Rule 9), so nothing is persisted to localStorage and nothing
// is seeded on a new world (Rule 2). "Apply to world" in PlatformEditorModal bakes the drafts into
// world.oui through serializeScene; until then they are translucent previews in the engine.

import type { PlatformSpec } from "@shared/world";
import { create } from "zustand";
import { draftsFromSpecs, makeDraft, normalizeDraft, type Platform } from "./platformDrafts";

export interface PlatformState {
  /** Unsaved editor drafts. Empty until the player adds one or loads the world's platforms. */
  drafts: Platform[];
  /**
   * Mirror of `drafts` under the name the engine contract uses (CLAUDE.md § engine).
   * @deprecated Read `drafts`; this alias exists so the engine keeps compiling during the rename.
   */
  platforms: Platform[];
  selectedId: string | null;
  editorOpen: boolean;

  toggleEditor(open?: boolean): void;
  select(id: string | null): void;
  addDraft(preset?: Partial<Platform>): Platform;
  updateDraft(id: string, patch: Partial<Platform>): void;
  deleteDraft(id: string): void;
  /** Replaces the drafts with the platforms of the currently parsed scene. */
  loadFromScene(platforms: readonly PlatformSpec[]): void;
  clearDrafts(): void;
}

function commit(drafts: Platform[], selectedId: string | null) {
  return { drafts, platforms: drafts, selectedId };
}

export const usePlatformStore = create<PlatformState>()((set, get) => ({
  drafts: [],
  platforms: [],
  selectedId: null,
  editorOpen: false,

  toggleEditor: (open) => set((state) => ({ editorOpen: open ?? !state.editorOpen })),
  select: (selectedId) => set({ selectedId }),

  addDraft: (preset) => {
    const { drafts } = get();
    const draft = makeDraft(preset, drafts.length);
    set(commit([...drafts, draft], draft.id));
    return draft;
  },

  updateDraft: (id, patch) => {
    const { drafts, selectedId } = get();
    set(
      commit(
        drafts.map((draft) => (draft.id === id ? normalizeDraft({ ...draft, ...patch }) : draft)),
        selectedId,
      ),
    );
  },

  deleteDraft: (id) => {
    const { drafts, selectedId } = get();
    const next = drafts.filter((draft) => draft.id !== id);
    set(commit(next, selectedId === id ? (next[0]?.id ?? null) : selectedId));
  },

  loadFromScene: (platforms) => {
    const next = draftsFromSpecs(platforms);
    set(commit(next, next[0]?.id ?? null));
  },

  clearDrafts: () => set(commit([], null)),
}));
