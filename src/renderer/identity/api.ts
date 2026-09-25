// Narrow accessor for the preload bridge. Keeps every caller on the Result path instead of
// throwing when the module is loaded outside Electron (vitest, a plain browser tab).

import type { SeedApi } from "@shared/ipc";
import { err, ok, type Result } from "@shared/result";

export function seedApi(): Result<SeedApi> {
  const api: SeedApi | undefined = typeof window === "undefined" ? undefined : window.seed;
  if (api === undefined) {
    return err(
      "preload-unavailable",
      "window.seed is not available in this runtime.",
      "This flow only works inside the Electron app, where preload exposes window.seed.",
    );
  }
  return ok(api);
}
