// Other players' walk, smoothed (rev 6 phase 3, D17). Pure: presence arrives a few times a second
// (at most 4 on change, plus a heartbeat every 2 s), so a figure is drawn where its player stood
// DRAW_DELAY_MS ago, interpolated between the two samples around that moment. Past the newest
// sample it walks on the way it was going for EXTRAPOLATE_MS at most, then holds. A jump of more
// than SNAP_TILES (a door, a teleport) snaps instead of gliding across the land, and a player
// nobody heard from for DROP_MS is gone.
//
// Samples are stamped with their local arrival time; the network bunches arrivals, so each stamp
// is at least MIN_SPACING_MS after the one before. What is drawn never moves faster than
// CATCH_UP_SPEED toward that target, so no correction (a late sample, a bunched pair) jerks the
// figure more than 0.25 tiles a frame at 60 Hz.

export const DRAW_DELAY_MS = 300;
export const EXTRAPOLATE_MS = 200;
export const SNAP_TILES = 8;
export const DROP_MS = 10_000;
/** Tiles a second a drawn figure may move toward its target (0.25 tiles a frame at 60 Hz). */
export const CATCH_UP_SPEED = 15;
export const MIN_SPACING_MS = 100;
/** The longest frame the catch-up counts; a stalled tab resumes without one long leap. */
const MAX_FRAME_MS = 100;
const KEEP = 8;

export interface MotionSample {
  /** Local time (ms) this sample is drawn at, DRAW_DELAY_MS after it is reached. */
  t: number;
  x: number;
  z: number;
  /** Whether the player was walking: a standing player is never walked on past their sample. */
  moving: boolean;
}

export interface MotionTrack {
  /** Oldest first, `t` strictly increasing. */
  samples: readonly MotionSample[];
  /** Where the figure was last drawn, and when. */
  shown: { x: number; z: number; t: number } | null;
  /** Local time the newest sample arrived. */
  heard: number;
}

export interface MotionPoint {
  x: number;
  z: number;
}

const distance = (a: MotionPoint, b: MotionPoint): number => Math.hypot(a.x - b.x, a.z - b.z);

/** Adds a sample that arrived at `now`. A jump of more than SNAP_TILES starts the track afresh. */
export function receiveSample(
  track: MotionTrack | null,
  sample: { x: number; z: number; moving: boolean },
  now: number,
): MotionTrack {
  const last = track?.samples.at(-1);
  const { x, z, moving } = sample;
  if (track === null || last === undefined || distance(last, sample) > SNAP_TILES) {
    return { samples: [{ t: now, x, z, moving }], shown: track?.shown ?? null, heard: now };
  }
  const next: MotionSample = { t: Math.max(now, last.t + MIN_SPACING_MS), x, z, moving };
  return { samples: [...track.samples, next].slice(-KEEP), shown: track.shown, heard: now };
}

/** Where the player stood at `now − DRAW_DELAY_MS`, as the samples tell it. */
export function motionTarget(track: MotionTrack, now: number): MotionPoint | null {
  const { samples } = track;
  const first = samples[0];
  const last = samples.at(-1);
  if (first === undefined || last === undefined) return null;
  const at = now - DRAW_DELAY_MS;
  if (at <= first.t) return { x: first.x, z: first.z };
  if (at < last.t) {
    for (let i = 1; i < samples.length; i += 1) {
      const b = samples[i] as MotionSample;
      if (at >= b.t) continue;
      const a = samples[i - 1] as MotionSample;
      const f = (at - a.t) / (b.t - a.t);
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    }
  }
  const before = samples.at(-2);
  if (!last.moving || before === undefined) return { x: last.x, z: last.z };
  const ahead = Math.min(at - last.t, EXTRAPOLATE_MS);
  const span = last.t - before.t;
  return {
    x: last.x + ((last.x - before.x) / span) * ahead,
    z: last.z + ((last.z - before.z) / span) * ahead,
  };
}

/**
 * The figure for this frame: null once nothing was heard for DROP_MS (the player is gone),
 * otherwise where to draw it and the track to keep for the next frame.
 */
export function advanceMotion(
  track: MotionTrack,
  now: number,
): { track: MotionTrack; at: MotionPoint } | null {
  if (now - track.heard > DROP_MS) return null;
  const target = motionTarget(track, now);
  if (target === null) return null;
  const shown = track.shown;
  let at = target;
  if (shown !== null && distance(shown, target) <= SNAP_TILES) {
    const gap = distance(shown, target);
    const step = (CATCH_UP_SPEED * Math.min(Math.max(0, now - shown.t), MAX_FRAME_MS)) / 1000;
    at =
      gap <= step
        ? target
        : {
            x: shown.x + ((target.x - shown.x) / gap) * step,
            z: shown.z + ((target.z - shown.z) / gap) * step,
          };
  }
  return { track: { ...track, shown: { ...at, t: now } }, at };
}
