// The service's two clocks (rev 6 phase 3, D10). `now()` is the receipt clock: wall time plus the
// offset `POST /v1/test/advance` adds in test mode. It stamps rt, times beats, judges invite expiry
// and keys the daily quotas, so all of those move together when a test skips 90 days. `real()` is
// monotonic and drives what must not jump: leases, rate windows and the auth deadline.

import { DAY_MS } from "@shared/history/ids";

export interface Clock {
  /** Receipt time in ms (wall clock + test offset). */
  now(): number;
  /** Monotonic ms for leases and rate windows. */
  real(): number;
}

export class ServiceClock implements Clock {
  private offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  real(): number {
    return performance.now();
  }

  /** Test mode only: moves the receipt clock forward; returns the total offset in days. */
  advance(days: number): number {
    this.offsetMs += Math.round(days * DAY_MS);
    return this.offsetMs / DAY_MS;
  }
}

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** A counter over one-second windows (frames, presence, stream deltas). */
export class RateWindow {
  private start = Number.NEGATIVE_INFINITY;
  private count = 0;
  /** When the last "too fast" refusal for this window was sent (one per window). */
  private warned = false;

  /** Counts one hit at `realMs`; false when it is over `limit` in the current second. */
  hit(realMs: number, limit: number): boolean {
    if (realMs - this.start >= 1_000) {
      this.start = realMs;
      this.count = 0;
      this.warned = false;
    }
    this.count += 1;
    return this.count <= limit;
  }

  /** True the first time it is asked in a window that went over: send one refusal, not many. */
  warnOnce(): boolean {
    if (this.warned) return false;
    this.warned = true;
    return true;
  }
}
