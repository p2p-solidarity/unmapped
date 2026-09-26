// A 401 on a saved account token (rev 6 phase 4, D2 "A 401 on a saved hosted token"). `resolveKey`
// falls back to `.env` only for records it cannot read, so a revoked but readable token would shadow
// UNMAPPED_GATEWAY_KEY forever. Main therefore deletes exactly the saved record that was refused —
// and only that one: a newer token saved while the refused call was in flight stays, and a token
// from `.env` is never touched. Keys the player typed for other providers are never deleted.

import type { Result } from "@shared/result";
import type { KeyRecord } from "../inference/keys";

export interface HostedTokenStore {
  read(): Promise<Result<KeyRecord | null>>;
  clear(): Promise<Result<void>>;
}

/** True when the refused token was the saved one and it is gone now. */
export async function forgetRefusedToken(
  refused: { key: string; source: "saved" | "env" },
  store: HostedTokenStore,
): Promise<boolean> {
  if (refused.source !== "saved") return false;
  const saved = await store.read();
  if (!saved.ok || saved.value === null || saved.value.key !== refused.key) return false;
  const cleared = await store.clear();
  return cleared.ok;
}
