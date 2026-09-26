// A joined world's land on the phone (rev 6 phase 4, D7), as the page's device gives it: the genesis
// pack unpacked and checked, its entry scene and rules, and where this device last stood. Asked for
// once the world's fold is read, again when the fold names another pack, and again when a land that
// had not reached this browser yet (`browser-pack-missing`) can be fetched because the world's
// service answers. Every other refusal stays on screen with its hint (Rule 2).

import { fromResult, type Loadable, loading } from "@shared/result";
import { useEffect, useState } from "react";
import type { PhoneDevice, PhoneLand } from "./phoneDevice";
import type { SharedWorldView } from "./useSharedWorld";

export function usePhoneLand(
  device: PhoneDevice,
  worldId: string,
  view: Loadable<SharedWorldView>,
): Loadable<PhoneLand> {
  const [land, setLand] = useState<Loadable<PhoneLand>>(loading());
  const [attempt, setAttempt] = useState(0);
  // Undefined until the fold is read; null when the world announces no pack.
  const pack = view.status === "ready" ? (view.value.now.pack?.pack ?? null) : undefined;
  const online = view.status === "ready" && view.value.status.link === "online";
  const waiting = land.status === "error" && land.error.code === "browser-pack-missing";

  useEffect(() => {
    if (waiting && online) setAttempt((n) => n + 1);
  }, [waiting, online]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `pack` and `attempt` are what re-ask
  useEffect(() => {
    if (pack === undefined) return;
    let live = true;
    void device.land(worldId).then((result) => {
      if (live) setLand(fromResult(result));
    });
    return () => {
      live = false;
    };
  }, [device, worldId, pack, attempt]);

  return land;
}
