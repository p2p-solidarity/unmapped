// What this guards (Rule 0: untrusted input from peers). Presence frames come from other players
// through the world's service, which relays what a client sends after its own checks; main reads
// the frame with `readFromService` and the renderer reads the event again with `readPresence`
// before anything is drawn (D17).
//
// 1. An oversized frame (over FRAME_MAX_BYTES) is parsed instead of refused whole.
// 2. A presence with an extra field, a non-finite or out-of-range coordinate, an unknown facing or
//    emote, a negative or fractional emote counter, or a place id the protocol does not have is
//    drawn (a peer could smuggle data, or put a figure where no tile is).
// 3. A presence for another world, or with a malformed author key, is drawn in this world.
// 4. A player leaving (`p: null`) is refused instead of taking them off the land.

import { describe, expect, it } from "vitest";
import { readPresence } from "../../src/renderer/net/worldPresence";
import { FRAME_MAX_BYTES, type Presence, readFromService } from "../../src/shared/worldProtocol";

const WORLD = `h${"a".repeat(52)}`;
const OTHER = `h${"b".repeat(52)}`;
const KEY = `k${"c".repeat(52)}`;

const good: Presence = {
  x: 12.5,
  z: -3.25,
  facing: "east",
  moving: true,
  place: null,
  emote: { kind: "wave", n: 3 },
};

describe("presence from peers", () => {
  it("refuses an oversized frame whole (1)", () => {
    const frame = JSON.stringify({
      t: "presence",
      world: WORLD,
      from: KEY,
      p: { ...good, pad: "x".repeat(FRAME_MAX_BYTES) },
    });
    const read = readFromService(frame);
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe("frame-too-large");
  });

  it("reads a well-formed presence and a leave (4)", () => {
    expect(readPresence({ world: WORLD, from: KEY, p: good }, WORLD)).toEqual({
      from: KEY,
      p: good,
    });
    expect(readPresence({ world: WORLD, from: KEY, p: null }, WORLD)).toEqual({
      from: KEY,
      p: null,
    });
  });

  it("refuses a malformed presence (2)", () => {
    const bad: unknown[] = [
      { ...good, extra: 1 },
      { ...good, x: Number.NaN },
      { ...good, x: Number.POSITIVE_INFINITY },
      { ...good, z: 9e9 },
      { ...good, facing: "up" },
      { ...good, moving: "yes" },
      { ...good, place: "../../etc" },
      { ...good, place: "p1234" },
      { ...good, emote: { kind: "dance", n: 1 } },
      { ...good, emote: { kind: "wave", n: -1 } },
      { ...good, emote: { kind: "wave", n: 1.5 } },
      { ...good, emote: { kind: "wave", n: 1, text: "hi" } },
      { x: 1, z: 1 },
      "x=1",
      42,
    ];
    for (const p of bad) {
      expect(readPresence({ world: WORLD, from: KEY, p }, WORLD), JSON.stringify(p)).toBeNull();
    }
    // Main refuses the same frames before they ever reach the renderer.
    for (const p of bad) {
      const frame = JSON.stringify({ t: "presence", world: WORLD, from: KEY, p });
      expect(readFromService(frame).ok, JSON.stringify(p)).toBe(false);
    }
  });

  it("refuses a presence for another world or from a malformed key (3)", () => {
    expect(readPresence({ world: OTHER, from: KEY, p: good }, WORLD)).toBeNull();
    expect(readPresence({ world: WORLD, from: "kshort", p: good }, WORLD)).toBeNull();
    expect(readPresence({ world: WORLD, from: 7, p: good }, WORLD)).toBeNull();
    expect(readPresence(null, WORLD)).toBeNull();
  });
});
