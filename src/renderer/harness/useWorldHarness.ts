// The React view of the world harness. Mount it once, high in the tree that owns a loaded world
// (PlayScreen): the id of the loaded world is the only thing that decides which harness exists, so
// switching worlds disposes the old context — its mod fibers with it — and builds a new one.

import type { Harness } from "@harness";
import { useWorldStore } from "@renderer/state/worldStore";
import { useEffect, useSyncExternalStore } from "react";
import {
  disposeWorldHarness,
  getWorldHarness,
  mountWorldHarness,
  subscribeWorldHarness,
} from "./worldHarness";

export function useWorldHarness(): Harness | null {
  const worldId = useWorldStore((state) => state.meta?.id ?? null);

  useEffect(() => {
    if (worldId === null) {
      void disposeWorldHarness();
      return;
    }
    mountWorldHarness(worldId);
    return () => {
      void disposeWorldHarness();
    };
  }, [worldId]);

  return useSyncExternalStore(subscribeWorldHarness, getWorldHarness, getWorldHarness);
}
