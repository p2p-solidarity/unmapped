// Where the player stands, for the save — read on demand, never published to a store (Rule 4).
//
// The running scene registers a probe over its per-frame refs; the app layer samples it when it
// checkpoints. Unregistering keeps the final sample, so leaving Play can still save where the
// player stood after the canvas is gone.

import type { SavedPosition } from "@shared/cartridge";

type Probe = () => SavedPosition;

let probe: Probe | null = null;
let last: SavedPosition | null = null;

export function registerPlayerProbe(next: Probe): () => void {
  probe = next;
  last = null;
  return () => {
    if (probe !== next) return;
    last = next();
    probe = null;
  };
}

/** The live position, else the one taken when the scene unmounted, else null. */
export function samplePlayer(): SavedPosition | null {
  return probe?.() ?? last;
}

/** Forget the parked sample — a different instance is about to load. */
export function clearPlayerSample(): void {
  last = null;
}
