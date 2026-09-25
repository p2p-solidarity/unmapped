import { type AwarenessStates, toPeerInfo } from "@renderer/net/peers";
import { describe, expect, it } from "vitest";

function states(entries: [number, Record<string, unknown>][]): AwarenessStates {
  return new Map(entries);
}

describe("toPeerInfo", () => {
  it("maps awareness states and drops the local client", () => {
    const peers = toPeerInfo(
      states([
        [7, { name: "player-AB2C", floor: 3 }],
        [2, { name: "player-QZ44", floor: 1 }],
      ]),
      7,
    );
    expect(peers).toEqual([{ clientId: 2, name: "player-QZ44", floor: 1 }]);
  });

  it("sorts by client id so the list does not jump around", () => {
    const peers = toPeerInfo(
      states([
        [9, { name: "c", floor: 1 }],
        [3, { name: "a", floor: 2 }],
        [5, { name: "b", floor: 3 }],
      ]),
      1,
    );
    expect(peers.map((p) => p.clientId)).toEqual([3, 5, 9]);
  });

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

  it("returns an empty list when nobody else is present", () => {
    expect(toPeerInfo(states([[1, { name: "me", floor: 1 }]]), 1)).toEqual([]);
  });
});
