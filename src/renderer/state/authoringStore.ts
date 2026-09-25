import { playerName } from "@renderer/net";
import { type AppError, fail, toError } from "@shared/result";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
import { create } from "zustand";

const ACTIVE_AUTHORING_KEY = "aether.activeAuthoringWorkspace";
let writeQueue: Promise<void> = Promise.resolve();

function readPointer(): string | null {
  try {
    return localStorage.getItem(ACTIVE_AUTHORING_KEY);
  } catch {
    return null;
  }
}

function writePointer(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(ACTIVE_AUTHORING_KEY);
    else localStorage.setItem(ACTIVE_AUTHORING_KEY, id);
  } catch {
    // Storage blocked: the draft still works for this session, it just is not resumed next launch.
  }
}

export interface AuthoringState {
  status: "idle" | "loading" | "ready" | "error";
  snapshot: AuthoringSnapshot | null;
  error: AppError | null;
  hydrate(): Promise<void>;
  update(change: (current: AuthoringSnapshot) => AuthoringSnapshot): Promise<void>;
  clear(): void;
}

export const useAuthoringStore = create<AuthoringState>()((set, get) => ({
  status: "idle",
  snapshot: null,
  error: null,

  hydrate: async () => {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading", error: null });
    try {
      const active = readPointer();
      let result =
        active === null
          ? await window.seed.workspaces.createAuthoring({ name: "", author: playerName() })
          : await window.seed.workspaces.readAuthoring(active);
      // A pointer to a draft that no longer reads (deleted, or written by an older schema) must
      // not brick New Game: forget it and start a fresh draft instead of showing a dead end.
      if (!result.ok && active !== null) {
        writePointer(null);
        result = await window.seed.workspaces.createAuthoring({ name: "", author: playerName() });
      }
      if (!result.ok) {
        set({ status: "error", error: result.error, snapshot: null });
        return;
      }
      writePointer(result.value.workspaceId);
      set({ status: "ready", snapshot: result.value, error: null });
    } catch (error) {
      // A throw here means the bridge itself is missing a channel — almost always a main/preload
      // bundle older than this renderer. Say so, instead of spinning on "Loading…" forever.
      set({
        status: "error",
        snapshot: null,
        error: {
          ...toError(error, "authoring-bridge-failed"),
          hint: "The app's main process is older than its UI. Quit every Unwritten Land window and run `bun run dev` again.",
        },
      });
    }
  },

  update: async (change) => {
    const current = get().snapshot;
    if (current === null) return;
    const next = change(current);
    set({ snapshot: next, status: "ready", error: null });
    writeQueue = writeQueue.then(async () => {
      // A rejected link would poison every later save in the chain, so a throw becomes an error.
      const saved = await window.seed.workspaces
        .writeAuthoring(next)
        .catch((error: unknown) => fail(toError(error, "authoring-write-failed")));
      if (!saved.ok) {
        set({ status: "error", error: saved.error });
        return;
      }
      // A later optimistic edit may already be on screen. Only apply the server timestamp when
      // this is still the latest snapshot, otherwise that edit would be silently rolled back.
      if (get().snapshot === next) set({ snapshot: saved.value, status: "ready", error: null });
    });
    await writeQueue;
  },

  clear: () => {
    writePointer(null);
    set({ status: "idle", snapshot: null, error: null });
  },
}));
