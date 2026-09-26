// The generation gateway as screens read it (rev 6 phase 4, D1–D3): where the next chat goes, and
// the account's allowance. Both come from main (`window.seed.gateway`), which alone holds keys and
// tokens; a screen re-reads when the account changes or after a hosted call settles. Nothing on the
// walking path waits for either.

import type { QuotaView } from "@shared/gatewayApi";
import type { RouteView } from "@shared/llm";
import { errored, fromResult, idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useRef, useState } from "react";

/** The route of the saved model setting; `version` re-reads it (a key or the setting changed). */
export function useRoute(version: string): { route: Loadable<RouteView>; reload(): void } {
  const [route, setRoute] = useState<Loadable<RouteView>>(idle());
  const seq = useRef(0);
  const reload = useCallback(() => {
    seq.current += 1;
    const mine = seq.current;
    setRoute(loading());
    void window.seed.gateway.route().then(
      (result) => {
        if (mine === seq.current) setRoute(fromResult(result));
      },
      (error: unknown) => {
        if (mine === seq.current) {
          setRoute(errored({ code: "route-failed", message: String(error) }));
        }
      },
    );
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` is the re-read trigger.
  useEffect(() => {
    reload();
    return window.seed.gateway.onChanged(reload);
  }, [reload, version]);
  return { route, reload };
}

/** The allowance, while `enabled` (signed in): read once, then kept live by `account:quota`. */
export function useQuota(enabled: boolean): Loadable<QuotaView> {
  const [quota, setQuota] = useState<Loadable<QuotaView>>(idle());
  useEffect(() => {
    if (!enabled) {
      setQuota(idle());
      return;
    }
    let alive = true;
    setQuota(loading());
    void window.seed.gateway.quota().then((result) => {
      if (alive) setQuota(fromResult(result));
    });
    const off = window.seed.gateway.onQuota((view) => {
      if (alive) setQuota(ready(view));
    });
    return () => {
      alive = false;
      off();
    };
  }, [enabled]);
  return quota;
}

/** The share of the month's allowance not used or held, as a whole percent (0 with no allowance). */
export function percentLeft(view: QuotaView): number {
  const { granted, used, reserved } = view.quota;
  if (granted <= 0) return 0;
  return Math.max(0, Math.floor(((granted - used - reserved) / granted) * 100));
}
