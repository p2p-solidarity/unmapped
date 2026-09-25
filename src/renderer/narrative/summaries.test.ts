import type { Inventory, ItemSpec, KarmaEntry } from "@shared/world";
import { describe, expect, it } from "vitest";
import { inventorySummary, KARMA_WINDOW, karmaSummary } from "./summaries";

const entry = (over: Partial<KarmaEntry> = {}): KarmaEntry => ({
  at: "2026-01-01T00:00:00.000Z",
  floor: 3,
  npcId: "npc_hana",
  choice: "Offer the lantern",
  action: "trade",
  effect: "she keeps the flame",
  ...over,
});

const item = (over: Partial<ItemSpec> = {}): ItemSpec => ({
  id: "it_1",
  name: "Tide Rapier",
  kind: "rapier",
  power: 42,
  perk: "cuts through fog",
  curse: null,
  meshDna: ["blade_curved"],
  archetype: ["water"],
  flavor: "cold to hold",
  ...over,
});

describe("karmaSummary", () => {
  it("renders one line per entry", () => {
    expect(karmaSummary([entry()])).toEqual([
      "floor 3 · trade with npc_hana: Offer the lantern → she keeps the flame",
    ]);
  });

  it("omits the NPC when there is none", () => {
    expect(karmaSummary([entry({ npcId: null, action: "wish" })])[0]).toBe(
      "floor 3 · wish: Offer the lantern → she keeps the flame",
    );
  });

  it("omits the arrow when the effect is empty", () => {
    expect(karmaSummary([entry({ effect: "  " })])[0]).toBe(
      "floor 3 · trade with npc_hana: Offer the lantern",
    );
  });

  it("keeps only the last twelve entries, newest last", () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ floor: i }));
    const lines = karmaSummary(many);
    expect(lines).toHaveLength(KARMA_WINDOW);
    expect(lines[0]).toContain("floor 8");
    expect(lines[KARMA_WINDOW - 1]).toContain("floor 19");
  });

  it("returns nothing for a fresh world", () => {
    expect(karmaSummary([])).toEqual([]);
  });
});

describe("inventorySummary", () => {
  it("lists items with kind and power, then materials", () => {
    const inventory: Inventory = { items: [item()], materials: ["ash", "ash", "quartz"] };
    expect(inventorySummary(inventory)).toEqual([
      "Tide Rapier (rapier, power 42)",
      "material: ash x2",
      "material: quartz",
    ]);
  });

  it("surfaces a curse so the model can build on it", () => {
    const inventory: Inventory = { items: [item({ curse: "thirsts at dusk" })], materials: [] };
    expect(inventorySummary(inventory)[0]).toBe(
      "Tide Rapier (rapier, power 42, cursed: thirsts at dusk)",
    );
  });

  it("is empty for empty hands", () => {
    expect(inventorySummary({ items: [], materials: [] })).toEqual([]);
  });
});
