// The gateway's clocks (rev 6 phase 4), as in the world service. `now()` is wall time plus the
// offset `POST /v1/test/advance` adds in test mode: it stamps ledger lines, picks the quota period,
// dates cost records and ages tokens, so a test that skips a month moves all of them together.
// `real()` is monotonic and drives what must not jump: challenges, pairing codes and rate windows.
// `wall()` is the plain wall clock, for what another party signed with its own (webhook times).

export interface GatewayClock {
  now(): number;
  real(): number;
  wall(): number;
}

export class SystemClock implements GatewayClock {
  private offsetMs = 0;

  now(): number {
    return Date.now() + this.offsetMs;
  }

  real(): number {
    return performance.now();
  }

  wall(): number {
    return Date.now();
  }

  /** Test mode only: moves `now()` forward; returns the total offset in days. */
  advance(days: number): number {
    this.offsetMs += Math.round(days * 86_400_000);
    return this.offsetMs / 86_400_000;
  }
}

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}

/** "YYYY-MM-DD" of a UTC instant. */
export function dayOf(ms: number): string {
  return isoAt(ms).slice(0, 10);
}
