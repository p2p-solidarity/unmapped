import {
  makeKarmaEntry,
  parseKarmaJsonl,
  parseKarmaLine,
  serializeKarmaJsonl,
} from "@renderer/app/karmaFile";
import type { KarmaEntry } from "@shared/world";
import { describe, expect, it } from "vitest";

const entry: KarmaEntry = {
  at: "2026-09-26T10:00:00.000Z",
  floor: 2,
  npcId: "aoi",
  choice: "Ask about the well",
  action: "talk",
  effect: "She points at the ridge",
};

describe("karma.jsonl", () => {
  it("round-trips entries through serialize → parse", () => {
    const entries = [entry, { ...entry, npcId: null, action: "floor" as const, floor: 3 }];
    const text = serializeKarmaJsonl(entries);
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").filter((line) => line.length > 0)).toHaveLength(2);
    expect(parseKarmaJsonl(text)).toEqual({ entries, skipped: 0 });
  });

  it("serializes an empty ledger as an empty file", () => {
    expect(serializeKarmaJsonl([])).toBe("");
    expect(parseKarmaJsonl("")).toEqual({ entries: [], skipped: 0 });
  });

  it("skips and counts lines a human broke, keeping the good ones", () => {
    const text = [
      JSON.stringify(entry),
      "{ not json",
      "",
      "   ",
      JSON.stringify({ ...entry, action: "dance" }),
      JSON.stringify({ ...entry, floor: "two" }),
      JSON.stringify([1, 2, 3]),
      JSON.stringify({ ...entry, choice: "Leave", action: "leave" }),
    ].join("\n");
    const parsed = parseKarmaJsonl(text);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[1]?.action).toBe("leave");
    expect(parsed.skipped).toBe(4);
  });

  it("accepts every action the world vocabulary allows", () => {
    for (const action of [
      "talk",
      "fight",
      "trade",
      "open_exit",
      "craft",
      "leave",
      "wish",
      "genesis",
      "floor",
    ]) {
      expect(parseKarmaLine(JSON.stringify({ ...entry, action }))).not.toBeNull();
    }
    expect(parseKarmaLine(JSON.stringify({ ...entry, action: "ascend" }))).toBeNull();
  });

  it("requires npcId to be a string or null, never undefined", () => {
    const { npcId: _omitted, ...withoutNpc } = entry;
    expect(parseKarmaLine(JSON.stringify(withoutNpc))).toBeNull();
    expect(parseKarmaLine(JSON.stringify({ ...entry, npcId: null }))).not.toBeNull();
    expect(parseKarmaLine(JSON.stringify({ ...entry, npcId: 7 }))).toBeNull();
  });

  it("makeKarmaEntry fills at/npcId without inventing anything else", () => {
    const made = makeKarmaEntry({
      floor: 1,
      action: "trade",
      choice: "opened chest-1",
      effect: "rope",
    });
    expect(made.npcId).toBeNull();
    expect(made.floor).toBe(1);
    expect(made.effect).toBe("rope");
    expect(Number.isNaN(new Date(made.at).getTime())).toBe(false);
  });
});
