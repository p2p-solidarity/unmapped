// What this guards (Rule 0: invariants over many seeds, which a two-machine E2E samples only once).
// Other players of a shared world are drawn from presence frames that arrive a few times a second,
// bunched and delayed by the network; `remoteMotion` turns them into a walk.
//
// 1. A teleport (a jump of more than SNAP_TILES between samples) glides across the land instead of
//    snapping to where the player now is.
// 2. A late or lost sample walks the figure on for ever: extrapolation must stop EXTRAPOLATE_MS past
//    the newest sample, and a player who stopped is never walked on past where they stopped.
// 3. A player who vanished without a word (a crash, a dropped socket) stands on the land for ever:
//    nothing heard for DROP_MS drops them.
// 4. Jitter jerks the figure: bunched arrivals, lost samples and the correction after an
//    extrapolation must never move a figure more than 0.3 tiles in one 60 Hz frame (the presence
//    E2E's bound), over many seeds of walks at sprint speed — except on a snap.
// 5. The smoothing drifts: once the player stands still, the figure ends exactly where they stand.

import { describe, expect, it } from "vitest";
import {
  advanceMotion,
  DRAW_DELAY_MS,
  DROP_MS,
  EXTRAPOLATE_MS,
  type MotionTrack,
  motionTarget,
  receiveSample,
  SNAP_TILES,
} from "../../src/renderer/engine2d/remoteMotion";

const FRAME_MS = 1000 / 60;

/** A small deterministic generator (mulberry32). */
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

function track(samples: [number, number, number, boolean][]): MotionTrack {
  let out: MotionTrack | null = null;
  for (const [t, x, z, moving] of samples) out = receiveSample(out, { x, z, moving }, t);
  if (out === null) throw new Error("no samples");
  return out;
}

describe("remote motion", () => {
  it("snaps across a jump of more than SNAP_TILES instead of gliding (1)", () => {
    let t: MotionTrack = track([
      [0, 0, 0, true],
      [250, 1, 0, true],
    ]);
    let drawn = advanceMotion(t, 600);
    if (drawn === null) throw new Error("dropped");
    t = drawn.track;
    t = receiveSample(t, { x: 1 + SNAP_TILES + 0.5, z: 0, moving: false }, 700);
    drawn = advanceMotion(t, 700 + FRAME_MS);
    expect(drawn?.at).toEqual({ x: 1 + SNAP_TILES + 0.5, z: 0 });
    // A jump just under the limit is walked, never jumped in one frame.
    let near: MotionTrack = track([[0, 0, 0, false]]);
    near = advanceMotion(near, 500)?.track ?? near;
    near = receiveSample(near, { x: SNAP_TILES - 0.5, z: 0, moving: false }, 500);
    const step = advanceMotion(near, 500 + FRAME_MS);
    expect(step?.at.x).toBeLessThan(0.3);
  });

  it("walks on at most EXTRAPOLATE_MS past the newest sample, and never after a stop (2)", () => {
    // Walking east at 4 tiles/s, then silence.
    const walking = track([
      [0, 0, 0, true],
      [250, 1, 0, true],
      [500, 2, 0, true],
    ]);
    const far = motionTarget(walking, 500 + DRAW_DELAY_MS + 5000);
    expect(far?.x).toBeCloseTo(2 + 4 * (EXTRAPOLATE_MS / 1000), 6);
    const stopped = track([
      [0, 0, 0, true],
      [250, 1, 0, true],
      [500, 1.4, 0, false],
    ]);
    expect(motionTarget(stopped, 500 + DRAW_DELAY_MS + 150)).toEqual({ x: 1.4, z: 0 });
  });

  it("drops a player nobody heard from for DROP_MS (3)", () => {
    const t = track([[0, 3, 3, false]]);
    expect(advanceMotion(t, DROP_MS - 1)).not.toBeNull();
    expect(advanceMotion(t, DROP_MS + 1)).toBeNull();
  });

  it("never moves a figure more than 0.3 tiles in a 60 Hz frame, over many seeds (4, 5)", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = random(seed);
      const speed = 2 + next() * 5; // up to the sprint speed, 7 tiles/s
      let heading = next() * Math.PI * 2;
      let x = next() * 64 - 32;
      let z = next() * 64 - 32;
      let sentAt = 0;
      let moving = true;
      let lost = 0;
      const arrivals: { at: number; x: number; z: number; moving: boolean }[] = [];
      // 6 s of walking with turns and pauses, sent every 250 ms (+ send jitter), then standing.
      for (let t = 0; t <= 8000; t += 250 + next() * 40) {
        const dt = (t - sentAt) / 1000;
        sentAt = t;
        if (t < 6000) {
          if (next() < 0.2) heading += (next() - 0.5) * 2.5;
          moving = next() > 0.1;
          if (moving) {
            x += Math.cos(heading) * speed * dt;
            z += Math.sin(heading) * speed * dt;
          }
        } else moving = false;
        // The network: delay 20–200 ms, and one sample in eight never arrives (at most two in a
        // row: three lost at sprint speed is a gap a snap is right to cut).
        if (lost < 2 && next() < 0.125) {
          lost += 1;
          continue;
        }
        lost = 0;
        arrivals.push({ at: t + 20 + next() * 180, x, z, moving });
      }
      arrivals.sort((a, b) => a.at - b.at);
      let t: MotionTrack | null = null;
      let shown: { x: number; z: number } | null = null;
      let clock = arrivals[0]?.at ?? 0;
      let index = 0;
      while (clock < 9500) {
        while (index < arrivals.length && (arrivals[index]?.at ?? Infinity) <= clock) {
          const a = arrivals[index++];
          if (a !== undefined) t = receiveSample(t, a, a.at);
        }
        if (t !== null) {
          const drawn = advanceMotion(t, clock);
          if (drawn === null) throw new Error(`seed ${seed}: dropped while walking`);
          t = drawn.track;
          if (shown !== null) {
            const step = Math.hypot(drawn.at.x - shown.x, drawn.at.z - shown.z);
            expect(step, `seed ${seed} at ${clock.toFixed(0)} ms`).toBeLessThanOrEqual(0.3);
          }
          shown = drawn.at;
        }
        clock += FRAME_MS * (0.9 + next() * 0.2);
      }
      // Standing still since 6 s: drawn exactly where they stand (5).
      expect(shown?.x, `seed ${seed}`).toBeCloseTo(x, 6);
      expect(shown?.z, `seed ${seed}`).toBeCloseTo(z, 6);
    }
  });
});
