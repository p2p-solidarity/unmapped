import { type AwarenessStates, toPeerInfo } from "@renderer/net/peers";
import { describe, expect, it } from "vitest";

function states(entries: [number, Record<string, unknown>][]): AwarenessStates {
  return new Map(entries);
}

describe("toPeerInfo", () => {
  it("skips states without a usable name or floor instead of inventing one", () => {
    const peers = toPeerInfo(
      states([
        [2, {}],
        [3, { name: "   ", floor: 1 }],
        [4, { name: "ok", floor: Number.NaN }],
        [5, { name: "ok", floor: "2" }],
        [6, { name: 42, floor: 2 }],
        [7, { name: "real", floor: 0 }],
      ]),
      1,
    );
    expect(peers).toEqual([{ clientId: 7, name: "real", floor: 0 }]);
  });
});
