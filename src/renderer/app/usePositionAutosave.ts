// Open land remembers where the player stood. Walking is per-frame state, so it is sampled here on
// a slow clock and written through the ordinary instance checkpoint — only after the player has
// actually moved, once more when they leave Play, and when the window hides or is closed (so the
// last few seconds before quitting are kept too; a killed process can still lose them).

import { useSessionStore } from "@renderer/state";
import type { SavedPosition } from "@shared/cartridge";
import { useEffect } from "react";
import { checkpointCurrentInstance, currentPosition } from "./usePersistWorld";

const SAMPLE_MS = 5_000;
/** Tiles the player must have walked before another write is worth it. */
const MIN_TRAVEL = 2;

function travelled(from: SavedPosition, to: SavedPosition): boolean {
  return Math.hypot(to.x - from.x, to.z - from.z) >= MIN_TRAVEL;
}

function write(): void {
  void checkpointCurrentInstance().then((result) => {
    if (!result.ok) {
      useSessionStore
        .getState()
        .toast("danger", `save.json could not be saved: ${result.error.message}`);
    }
  });
}

export function usePositionAutosave(): void {
  useEffect(() => {
    // The first sample is where the player loaded in; it is the baseline, not a change.
    let saved: SavedPosition | null = null;
    const tick = (): void => {
      const now = currentPosition();
      if (now === null) return;
      if (saved === null) {
        saved = now;
        return;
      }
      if (!travelled(saved, now)) return;
      saved = now;
      write();
    };
    const timer = setInterval(tick, SAMPLE_MS);
    // Leaving the window is not leaving Play: keep any step since the last sample.
    const flush = (): void => {
      const now = currentPosition();
      if (now === null || saved === null) return;
      if (Math.hypot(now.x - saved.x, now.z - saved.z) < 0.05) return;
      saved = now;
      write();
    };
    const onHidden = (): void => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHidden);
      const now = currentPosition();
      if (now !== null && (saved === null || travelled(saved, now))) write();
    };
  }, []);
}
