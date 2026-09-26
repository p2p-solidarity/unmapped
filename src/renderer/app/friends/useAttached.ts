// Whether the open save's world is shared through a world service (rev 6 phase 3, D12): its history
// says so first, else main's badge. Such a world invites friends with an invite link, never a join
// code, so the invite block says so instead of offering the button.

import { refreshWorldBadges, worldAttached } from "@renderer/net/continentActions";
import { useLandStore } from "@renderer/state";
import { useEffect, useState } from "react";
import { useOpenWorld } from "../land/together";

export function useAttached(): boolean {
  const instanceId = useLandStore((state) => state.instanceId);
  // Read so the answer is re-derived whenever the land's history reports the world.
  useOpenWorld();
  const [, reread] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: another save opening re-reads the badges
  useEffect(() => {
    let live = true;
    void refreshWorldBadges().then(() => {
      if (live) reread((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [instanceId]);
  return instanceId !== null && worldAttached(instanceId);
}
