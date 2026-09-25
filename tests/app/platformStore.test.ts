import { toPlatformSpec } from "@renderer/state/platformDrafts";
import { usePlatformStore } from "@renderer/state/platformStore";
import type { PlatformSpec } from "@shared/world";
import { beforeEach, describe, expect, it } from "vitest";

const store = () => usePlatformStore.getState();

const specs: PlatformSpec[] = [
  { x: 2, z: 3, width: 4, depth: 4, y: 1, height: 0.4, tile: "stone", bounce: false },
  { x: 8, z: 9, width: 2, depth: 2, y: 3, height: 0.5, tile: "lava", bounce: true },
];

beforeEach(() => {
  store().clearDrafts();
  store().toggleEditor(false);
});

describe("platform drafts", () => {
  it("starts empty: a new world is not seeded with starter platforms", () => {
    expect(store().drafts).toEqual([]);
    expect(store().selectedId).toBeNull();
  });

  it("selects the draft it just added", () => {
    const added = store().addDraft();
    expect(store().drafts).toHaveLength(1);
    expect(store().selectedId).toBe(added.id);
  });

  it("updates one draft and clamps the new value", () => {
    const added = store().addDraft();
    store().updateDraft(added.id, { name: "Ledge", y: 99 });
    const updated = store().drafts[0];
    expect(updated?.name).toBe("Ledge");
    expect(updated?.y).toBe(6);
    expect(updated?.id).toBe(added.id);
  });

  it("ignores an update for an id that is not a draft", () => {
    const added = store().addDraft();
    store().updateDraft("nope", { name: "Ghost" });
    expect(store().drafts).toHaveLength(1);
    expect(store().drafts[0]?.name).toBe(added.name);
  });

  it("deletes a draft and moves the selection off it", () => {
    const first = store().addDraft();
    const second = store().addDraft();
    store().deleteDraft(second.id);
    expect(store().drafts.map((draft) => draft.id)).toEqual([first.id]);
    store().deleteDraft(first.id);
    expect(store().drafts).toEqual([]);
    expect(store().selectedId).toBeNull();
  });

  it("keeps the selection when another draft is deleted", () => {
    const first = store().addDraft();
    const second = store().addDraft();
    store().select(first.id);
    store().deleteDraft(second.id);
    expect(store().selectedId).toBe(first.id);
  });

  it("loads the platforms of the parsed scene as drafts", () => {
    store().addDraft();
    store().loadFromScene(specs);
    expect(store().drafts).toHaveLength(2);
    expect(store().drafts.map(toPlatformSpec)).toEqual(specs);
    expect(store().selectedId).toBe(store().drafts[0]?.id);
  });

  it("clears every draft on discard", () => {
    store().loadFromScene(specs);
    store().clearDrafts();
    expect(store().drafts).toEqual([]);
    expect(store().selectedId).toBeNull();
  });

  it("mirrors drafts onto the engine's `platforms` alias", () => {
    store().loadFromScene(specs);
    expect(store().platforms).toBe(store().drafts);
    store().clearDrafts();
    expect(store().platforms).toEqual([]);
  });

  it("toggles the editor explicitly and by flip", () => {
    expect(store().editorOpen).toBe(false);
    store().toggleEditor();
    expect(store().editorOpen).toBe(true);
    store().toggleEditor(true);
    expect(store().editorOpen).toBe(true);
    store().toggleEditor(false);
    expect(store().editorOpen).toBe(false);
  });
});
