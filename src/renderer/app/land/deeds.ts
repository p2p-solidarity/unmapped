// Public facts (rev 6 phase 3, D1, D3): a cleared chapter, a crossed place and a finished errand
// become `deed` events of the world's history — the private karma ledger keeps the rest — so the
// world can retell them (rumors, WP7). One deed per author and ref; a repeat is refused by admit
// and harmless. A deed that cannot be written is logged, never thrown: the player's own progress
// (progress.json) already holds what they did.

import { appendToWorld, onHistory, seenHead, writeBlocker } from "@renderer/history";
import type { DeedWhat } from "@shared/history/types";

/** Writes the deed `what` about `ref` (an event id, or `<witness id>:<errand id>`); null: none. */
export function recordDeed(what: DeedWhat, ref: string | null): void {
  if (ref === null || !onHistory() || writeBlocker() !== null) return;
  void appendToWorld({ kind: "deed", body: { what, ref }, seen: seenHead() }).then((written) => {
    if (!written.ok && written.error.code !== "deed-duplicate") {
      console.warn(
        `[world] deed ${what} not written: ${written.error.code} ${written.error.message}`,
      );
    }
  });
}
