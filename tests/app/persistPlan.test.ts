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
