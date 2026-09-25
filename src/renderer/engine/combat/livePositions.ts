// The seam between the fight's per-frame state and what draws or moves it: where each hostile
// stands this instant (for <Monster> to follow) and the push a blow gave the player (for <Player>,
// or the land's walker, to apply through its own collision). Plain mutable objects read every
// frame — never a store (Rule 4).

import { type HostileState, type Point, shownAt } from "./hostiles";

/** Seconds over which a push plays out, so a knockback reads as a shove rather than a jump. */
const SHOVE_SECONDS = 0.12;

let shown: ReadonlyMap<string, HostileState> | null = null;

/** Publishes the live hostile states of the mounted 3D fight; the returned function withdraws them. */
export function showHostiles(states: ReadonlyMap<string, HostileState>): () => void {
  shown = states;
  return () => {
    if (shown === states) shown = null;
  };
}

/** Where to draw hostile `id` now, or null when the fight has not moved it (turns, no fight). */
export function hostileShownAt(id: string): Point | null {
  const state = shown?.get(id);
  return state === undefined ? null : shownAt(state);
}

export interface Shove {
  push(dx: number, dz: number): void;
  /** The share of the pending push to apply over the next `delta` seconds. */
  take(delta: number): Point;
  drop(): void;
}

export function createShove(): Shove {
  const pending = { x: 0, z: 0 };
  return {
    push(dx, dz) {
      pending.x += dx;
      pending.z += dz;
    },
    take(delta) {
      const share = Math.min(1, Math.max(0, delta) / SHOVE_SECONDS);
      const step = { x: pending.x * share, z: pending.z * share };
      pending.x -= step.x;
      pending.z -= step.z;
      if (Math.hypot(pending.x, pending.z) < 1e-3) {
        pending.x = 0;
        pending.z = 0;
      }
      return step;
    },
    drop() {
      pending.x = 0;
      pending.z = 0;
    },
  };
}

/** The 3D player's pending push (one <Player> is mounted at a time). */
export const playerShove = createShove();
