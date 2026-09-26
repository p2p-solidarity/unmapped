// What this guards (Rule 0: a race that loses data, over many seeds; the together E2E sees one
// stream). A claimant's model text reaches every viewer as frames the service appends into the text
// a late viewer receives (D16), so the relay must never lose, repeat or reorder a piece of it.
//
// 1. A delta lost, repeated or reordered: the frames' texts in `k` order must concatenate to exactly
//    the start of the text the model wrote, whatever the timing of deltas and however slowly sends
//    resolve; with sends that keep up, to all of it as of the last delta sent.
// 2. `k` not rising strictly in the order frames are handed to main, or two sends in flight at once
//    (IPC could then reorder them, and the service drops a frame whose k is not above the last).
// 3. A frame larger than the per-frame cap, or a stream larger than the service's lease cap: the
//    service would refuse it, and main treats a refusal as the world's link being refused.
// 4. More than one frame per interval (the service drops deltas over 20/s).
// 5. A repair round (the text starting again) spliced into the middle of the last round or lost:
//    the wire holds the earlier round, a line break, then the new round.
// 6. A frame sent after the generation ended: the witness is appended by then, the service has
//    ended the lease, and the frame is refused (`stream-no-lease`) — so no timer may send, "done"
//    sends nothing, and "abort" sends one end frame only when nothing else is on its way.
// 7. A failed or throwing send reaching the model call (`delta` / `end` must never throw), or the
//    relay sending on after it.
// 8. A surrogate pair split between two frames or at the cap.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStreamBatcher,
  RELAY_MS,
  ROUND_BREAK,
  type StreamRelay,
} from "../../src/renderer/app/land/together";
import type { Result } from "../../src/shared/result";
import type { StreamFrame } from "../../src/shared/worldApi";

type Frame = Omit<StreamFrame, "sid">;

function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Harness {
  relay: StreamRelay;
  frames: { frame: Frame; at: number }[];
  ended: string[];
  maxInFlight: () => number;
}

function harness(
  options: {
    delay?: () => number;
    fail?: (frame: Frame, index: number) => Result<void> | "throw" | null;
    frameChars?: number;
    totalChars?: number;
  } = {},
): Harness {
  const frames: Harness["frames"] = [];
  const ended: string[] = [];
  let inFlight = 0;
  let most = 0;
  const relay = createStreamBatcher({
    send: (frame) => {
      const verdict = options.fail?.(frame, frames.length) ?? null;
      frames.push({ frame, at: Date.now() });
      if (verdict === "throw") throw new Error("IPC gone");
      inFlight += 1;
      most = Math.max(most, inFlight);
      return new Promise((resolve) => {
        setTimeout(() => {
          inFlight -= 1;
          resolve(verdict ?? { ok: true, value: undefined });
        }, options.delay?.() ?? 5);
      });
    },
    ended: (outcome) => ended.push(outcome),
    now: () => Date.now(),
    ...(options.frameChars === undefined ? {} : { frameChars: options.frameChars }),
    ...(options.totalChars === undefined ? {} : { totalChars: options.totalChars }),
  });
  return { relay, frames, ended, maxInFlight: () => most };
}

const wire = (h: Harness): string => h.frames.map(({ frame }) => frame.text ?? "").join("");

/** Model text with CJK and emoji, so a cut can land inside a surrogate pair. */
function words(next: () => number, length: number): string {
  const pieces = ["a", "Z", "\n", '"', "寫", "的", "😀", "🌾", "x = NPC(", "), "];
  let out = "";
  while (out.length < length) out += pieces[Math.floor(next() * pieces.length)];
  return out;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the together relay", () => {
  it("sends a gapless prefix, k rising, one send at a time, one per interval (1, 2, 4)", async () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const next = random(seed);
      const slow = seed % 2 === 0;
      const h = harness({ delay: () => (slow ? next() * 400 : next() * 20) });
      const text = words(next, 400 + Math.floor(next() * 4000));
      let at = 0;
      let lastSentWith = "";
      while (at < text.length) {
        at = Math.min(text.length, at + 1 + Math.floor(next() * 24));
        const before = h.frames.length;
        h.relay.delta(text.slice(0, at));
        if (h.frames.length > before) lastSentWith = text.slice(0, at);
        await vi.advanceTimersByTimeAsync(next() * (slow ? 60 : 160));
      }
      h.relay.end("done");
      await vi.runAllTimersAsync();
      const sent = wire(h);
      expect(text.startsWith(sent), `seed ${seed}`).toBe(true);
      // A frame always carries everything written up to the delta that sent it (the lone half of
      // a surrogate pair waits for the next one).
      expect(lastSentWith.length - sent.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      expect(h.frames.map(({ frame }) => frame.k)).toEqual(h.frames.map((_, index) => index));
      expect(h.maxInFlight(), `seed ${seed}`).toBe(1);
      for (let i = 1; i < h.frames.length; i += 1) {
        const gap = (h.frames[i]?.at ?? 0) - (h.frames[i - 1]?.at ?? 0);
        expect(gap, `seed ${seed} frame ${i}`).toBeGreaterThanOrEqual(RELAY_MS);
      }
      expect(h.ended).toEqual(["done"]);
    }
  });

  it("keeps every frame under the frame cap and the stream under the lease cap (3, 8)", async () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const next = random(seed);
      const h = harness({ frameChars: 64, totalChars: 1000 });
      const text = words(next, 5000);
      for (let at = 5; at <= text.length; at += 5 + Math.floor(next() * 60)) {
        h.relay.delta(text.slice(0, at));
        await vi.advanceTimersByTimeAsync(RELAY_MS);
      }
      for (let i = 0; i < 40; i += 1) {
        h.relay.delta(text);
        await vi.advanceTimersByTimeAsync(RELAY_MS);
      }
      h.relay.end("done");
      await vi.runAllTimersAsync();
      const sent = wire(h);
      expect(sent.length, `seed ${seed}`).toBeLessThanOrEqual(1000);
      expect(sent.length, `seed ${seed}`).toBeGreaterThanOrEqual(999);
      expect(text.startsWith(sent), `seed ${seed}`).toBe(true);
      for (const { frame } of h.frames) {
        const piece = frame.text ?? "";
        expect(piece.length).toBeLessThanOrEqual(64);
        const last = piece.charCodeAt(piece.length - 1);
        expect(last >= 0xd800 && last <= 0xdbff, `seed ${seed}: split pair`).toBe(false);
      }
    }
  });

  it("appends a repair round after a line break, never inside the last one (5)", async () => {
    const h = harness();
    for (const text of [
      'root = Chunk("Ka',
      'root = Chunk("Kasumi", [a])',
      "root = Chunk(",
      'root = Chunk("Kasumi Crossing", [a])',
    ]) {
      h.relay.delta(text);
      await vi.advanceTimersByTimeAsync(RELAY_MS * 2);
    }
    h.relay.end("done");
    await vi.runAllTimersAsync();
    expect(wire(h)).toBe(
      `root = Chunk("Kasumi", [a])${ROUND_BREAK}root = Chunk("Kasumi Crossing", [a])`,
    );
  });

  it("sends nothing once the generation ended but one abort frame when idle (6)", async () => {
    const done = harness();
    done.relay.delta("root = Chunk(");
    // Inside the interval: kept back, and no timer may send it after the end.
    await vi.advanceTimersByTimeAsync(RELAY_MS / 3);
    done.relay.delta('root = Chunk("Late words", [])');
    done.relay.end("done");
    done.relay.delta('root = Chunk("Later still", [])');
    await vi.runAllTimersAsync();
    expect(done.frames.map(({ frame }) => frame)).toEqual([{ k: 0, text: "root = Chunk(" }]);
    expect(done.ended).toEqual(["done"]);

    const idle = harness();
    idle.relay.delta("root = Chunk(");
    await vi.advanceTimersByTimeAsync(RELAY_MS * 3);
    idle.relay.end("abort");
    idle.relay.end("done");
    await vi.runAllTimersAsync();
    expect(idle.frames.map(({ frame }) => frame)).toEqual([
      { k: 0, text: "root = Chunk(" },
      { k: 1, end: "abort" },
    ]);
    expect(idle.ended).toEqual(["abort"]);

    // A frame still on its way: the abort is left to the release, so it cannot overtake it.
    const busy = harness({ delay: () => 1000 });
    busy.relay.delta("root = Chunk(");
    busy.relay.end("abort");
    await vi.runAllTimersAsync();
    expect(busy.frames.length).toBe(1);
    expect(busy.ended).toEqual(["abort"]);
  });

  it("stops on a failed or throwing send and never throws into the call (7)", async () => {
    const refused = harness({
      fail: (_frame, index) =>
        index === 2 ? { ok: false, error: { code: "claim-offline", message: "gone" } } : null,
    });
    const thrown = harness({ fail: (_frame, index) => (index === 1 ? "throw" : null) });
    for (const h of [refused, thrown]) {
      let text = "";
      for (let i = 0; i < 20; i += 1) {
        text += `line ${i}\n`;
        expect(() => h.relay.delta(text)).not.toThrow();
        await vi.advanceTimersByTimeAsync(RELAY_MS);
      }
      expect(() => h.relay.end("abort")).not.toThrow();
      await vi.runAllTimersAsync();
      expect(h.ended).toEqual(["abort"]);
    }
    expect(refused.frames.length).toBe(3);
    expect(thrown.frames.length).toBe(2);
  });
});
