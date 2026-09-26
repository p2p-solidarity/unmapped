// `window.seed` for the browser proof (rev 6 phase 4, D7). The desktop's preload bridges every
// namespace to main; here only `world` exists, run in the page (./worlds). Every other namespace —
// and any a later build adds — answers `not-on-this-client` (./unavailable), so the renderer code
// the page shares with the desktop gets an error value, never a missing object.

import type { SeedApi } from "@shared/ipc";
import type { WorldApi } from "@shared/worldApi";
import { desktopOnly } from "./unavailable";

export function browserSeed(world: WorldApi): SeedApi {
  const others = new Map<string, unknown>();
  return new Proxy({} as SeedApi, {
    get(_target, namespace) {
      if (namespace === "world") return world;
      if (typeof namespace !== "string" || namespace === "then") return undefined;
      let one = others.get(namespace);
      if (one === undefined) {
        one = desktopOnly<object>();
        others.set(namespace, one);
      }
      return one;
    },
  });
}
