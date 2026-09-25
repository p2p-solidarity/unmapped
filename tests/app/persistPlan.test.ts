import { derivedLock, type LockInput } from "@renderer/app/useInputLock";
import { type PersistSlice, persistPlan } from "@renderer/app/usePersistWorld";
import type { Inventory, KarmaEntry, WorldMeta } from "@shared/world";
import { describe, expect, it } from "vitest";

const meta: WorldMeta = {
  id: "w1",
  name: "Hollow Spire",
  archetype: "delve",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  floor: 1,
  mutation: null,
  flags: {},
  mods: [],
};

const karma: KarmaEntry[] = [];
const inventory: Inventory = { items: [], materials: [] };

function slice(overrides: Partial<PersistSlice> = {}): PersistSlice {
  return { meta, karma, inventory, floor: 1, hydrating: false, ...overrides };
}

const NOTHING = { karma: false, inventory: false, meta: false };

describe("persistPlan", () => {
  it("writes nothing when nothing changed", () => {
    expect(persistPlan(slice(), slice())).toEqual(NOTHING);
  });

  it("writes karma.jsonl when the ledger changed", () => {
    const next = slice({ karma: [...karma] });
    expect(persistPlan(next, slice())).toEqual({ ...NOTHING, karma: true });
  });

  it("writes inventory.json when the inventory changed", () => {
    const next = slice({ inventory: { items: [], materials: ["ore"] } });
    expect(persistPlan(next, slice())).toEqual({ ...NOTHING, inventory: true });
  });

  it("writes meta.json when the floor changed", () => {
    expect(persistPlan(slice({ floor: 2 }), slice())).toEqual({ ...NOTHING, meta: true });
  });

  it("writes nothing while the store is hydrating from the dotfiles", () => {
    const loaded = slice({ hydrating: true, karma: [...karma], floor: 4 });
    expect(persistPlan(loaded, slice())).toEqual(NOTHING);
    // …and not on the transition that clears the flag either.
    expect(persistPlan(slice({ karma: loaded.karma, floor: 4 }), loaded)).toEqual(NOTHING);
  });

  it("writes nothing when a world is opened, closed or swapped", () => {
    expect(persistPlan(slice({ floor: 9 }), slice({ meta: null }))).toEqual(NOTHING);
    expect(persistPlan(slice({ meta: null }), slice())).toEqual(NOTHING);
    expect(persistPlan(slice({ floor: 9 }), slice({ meta: { ...meta, id: "w2" } }))).toEqual(
      NOTHING,
    );
  });
});

function lock(overrides: Partial<LockInput> = {}): LockInput {
  return {
    screen: "play",
    consoleOpen: false,
    dialogueOpen: false,
    altarOpen: false,
    busy: null,
    floorFailed: false,
    endingOpen: false,
    editorOpen: false,
    customizing: false,
    sceneReady: true,
    ...overrides,
  };
}

describe("derivedLock", () => {
  it("leaves the keyboard to the engine on a playable floor", () => {
    expect(derivedLock(lock())).toBe(false);
  });

  it("locks on every screen that is not the running world", () => {
    for (const screen of ["worlds", "genesis"] as const) {
      expect(derivedLock(lock({ screen }))).toBe(true);
    }
  });

  it("locks while an overlay owns the input", () => {
    expect(derivedLock(lock({ consoleOpen: true }))).toBe(true);
    expect(derivedLock(lock({ dialogueOpen: true }))).toBe(true);
    expect(derivedLock(lock({ altarOpen: true }))).toBe(true);
    expect(derivedLock(lock({ editorOpen: true }))).toBe(true);
    expect(derivedLock(lock({ customizing: true }))).toBe(true);
  });

  it("locks while a floor is being written and while its failure is on screen", () => {
    expect(derivedLock(lock({ busy: "Weaving floor 3…" }))).toBe(true);
    expect(derivedLock(lock({ floorFailed: true }))).toBe(true);
  });

  it("locks while there is no parsed scene to walk on", () => {
    expect(derivedLock(lock({ sceneReady: false }))).toBe(true);
  });
});
