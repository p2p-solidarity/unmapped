// The Market section's state: the passkey signer (usePasskeySigner — prepare → sign → the gas
// station) plus the live view of worlds, auctions, pools and the player's account, polled every
// block. Only what to show and what to sign reach the renderer; no wallet, no key, no RPC.

import type { MarketView } from "@shared/market";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useRef, useState } from "react";
import { type PasskeySigner, usePasskeySigner } from "./usePasskeySigner";

export type { MarketBusy } from "./usePasskeySigner";

export interface MarketState extends PasskeySigner {
  view: Loadable<MarketView>;
  refresh(): Promise<void>;
}

const BLOCK_MS = 12_000;

export function useMarket(): MarketState {
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const signer = usePasskeySigner(() => refreshRef.current());
  const [view, setView] = useState<Loadable<MarketView>>(idle());
  const loaded = useRef(false);
  const key = signer.passkey?.key ?? null;

  const refresh = useCallback(async () => {
    if (!loaded.current) setView(loading());
    const result = await window.seed.market.view(key);
    if (result.ok) {
      loaded.current = true;
      setView(ready(result.value));
    } else if (!loaded.current) {
      setView(errored(result.error));
    }
  }, [key]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), BLOCK_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { ...signer, view, refresh };
}
