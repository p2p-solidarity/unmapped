// What Play shows of this save's ENS name (`<save>.<cartridge>.<root>`, else the world's
// `<cartridge>.<root>`): one read of `market.saveName` for the HUD chip, and a tiny emitter so the
// chapter offer can hand the chip a fresher view (after a clear, after a signature) instead of the
// chip polling Sepolia. Nothing here is stored; the chain and the save on disk are the truth.

import { storedMarketPasskey } from "@renderer/identity";
import type { SaveNameView } from "@shared/market";
import type { Result } from "@shared/result";

/** This save's name view, asked as the stored passkey's account (or nobody, before one is linked). */
export function readSaveEns(instanceId: string): Promise<Result<SaveNameView>> {
  return window.seed.market.saveName(instanceId, null, storedMarketPasskey()?.key ?? null);
}

/** A fresh view for one save, or null: "read it again yourself". */
export interface SaveEnsNews {
  instanceId: string;
  view: Result<SaveNameView>;
}

const listeners = new Set<(news: SaveEnsNews | null) => void>();

/** Tells the chip to show `news` (a view someone already read) or, with null, to read again. */
export function refreshSaveEns(news: SaveEnsNews | null = null): void {
  for (const listener of listeners) listener(news);
}

export function onSaveEnsRefresh(listener: (news: SaveEnsNews | null) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export type ChipName =
  /** This save's own name: it records this checkpoint, or it is the player's at an earlier one. */
  | { kind: "save"; name: string; state: "current" | "outdated"; progress: string | null }
  /** The world's cartridge name; this run has none of its own yet. */
  | { kind: "world"; name: string }
  | { kind: "none" };

/**
 * What the chip names. A save name someone else holds (`taken`) is not this run's name — the
 * default label collided — so the chip falls back to the world's name rather than show theirs.
 */
export function chipName(view: SaveNameView): ChipName {
  const save = view.save;
  if (save !== null && (save.state === "current" || save.state === "outdated")) {
    return { kind: "save", name: save.name, state: save.state, progress: save.progress };
  }
  const named = view.cartridge.state !== "free" && view.cartridge.state !== "taken";
  return named ? { kind: "world", name: view.cartridge.name } : { kind: "none" };
}
