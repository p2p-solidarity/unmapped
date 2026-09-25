// The New Game hang: a bridge call that throws (an Electron main/preload older than the UI) used
// to leave the authoring store on "loading" forever. It must land in `error` with a hint, and a
// stale pointer to an unreadable draft must fall back to a fresh one instead of a dead end.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@renderer/net", () => ({ playerName: () => "tester" }));

const { useAuthoringStore } = await import("@renderer/state/authoringStore");

const memory = new Map<string, string>();
const snapshot = { workspaceId: "create-fresh", formatVersion: 1 };

function bridge(workspaces: Record<string, unknown>): void {
  (globalThis as Record<string, unknown>).window = { seed: { workspaces } };
}

beforeEach(() => {
  memory.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key),
  };
  useAuthoringStore.setState({ status: "idle", snapshot: null, error: null });
});

describe("authoring store hydrate", () => {
  it("turns a throwing bridge into an error with a hint instead of loading forever", async () => {
    bridge({
      createAuthoring: () => {
        throw new TypeError("createAuthoring is not a function");
      },
    });
    await useAuthoringStore.getState().hydrate();
    const state = useAuthoringStore.getState();
    expect(state.status).toBe("error");
    expect(state.error?.hint).toMatch(/bun run dev/);
  });

  it("replaces a stale pointer with a fresh draft", async () => {
    memory.set("aether.activeAuthoringWorkspace", "create-gone");
    const createAuthoring = vi.fn(async () => ({ ok: true, value: snapshot }));
    bridge({
      readAuthoring: async () => ({
        ok: false,
        error: { code: "authoring-read-failed", message: "ENOENT" },
      }),
      createAuthoring,
    });
    await useAuthoringStore.getState().hydrate();
    expect(createAuthoring).toHaveBeenCalledOnce();
    expect(useAuthoringStore.getState().status).toBe("ready");
    expect(memory.get("aether.activeAuthoringWorkspace")).toBe("create-fresh");
  });
});
