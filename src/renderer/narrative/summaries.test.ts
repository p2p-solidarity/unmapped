import type { KarmaEntry } from "@shared/world";
import { describe, expect, it } from "vitest";
import { KARMA_WINDOW, karmaSummary } from "./summaries";

const entry = (over: Partial<KarmaEntry> = {}): KarmaEntry => ({
  at: "2026-01-01T00:00:00.000Z",
  floor: 3,
  npcId: "npc_hana",
  choice: "Offer the lantern",
  action: "trade",
  effect: "she keeps the flame",
  ...over,
});

describe("karmaSummary", () => {
  it("keeps only the last twelve entries, newest last", () => {
    const many = Array.from({ length: 20 }, (_, i) => entry({ floor: i }));
    const lines = karmaSummary(many);
    expect(lines).toHaveLength(KARMA_WINDOW);
    expect(lines[0]).toContain("floor 8");
    expect(lines[KARMA_WINDOW - 1]).toContain("floor 19");
  });
});
