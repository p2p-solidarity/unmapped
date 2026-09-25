// Hydrates the inference store on mount: config → sidecar status → probe, then keeps the sidecar
// status live. Every screen that shows model state mounts this once; `refreshProbe` is for the
// "Retry connection" affordances. Any change of provider (Settings → Model or the console) probes
// the new one at once, so a reading from the previous provider never stays on screen.

import { useInferenceStore } from "@renderer/state/inferenceStore";
import { fromResult, loading } from "@shared/result";
import { useCallback, useEffect } from "react";

/** While the provider is unreachable, look again this often — a failed boot probe must not stick. */
const RETRY_MS = 15_000;

export interface InferenceSync {
  /** Re-runs the provider probe and pushes loading → ready/error into the store. */
  refreshProbe(): Promise<void>;
}

/** Only the newest probe may write: an answer about the previous provider arrives too late. */
let probeSeq = 0;

async function probeInto(quiet: boolean): Promise<void> {
  probeSeq += 1;
  const mine = probeSeq;
  if (!quiet) useInferenceStore.getState().setProbe(loading());
  const result = await window.seed.inference.probe();
  if (mine === probeSeq) useInferenceStore.getState().setProbe(fromResult(result));
}

export function useInferenceSync(): InferenceSync {
  const refreshProbe = useCallback(() => probeInto(false), []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.seed.inference.onSidecar((status) => {
      if (!cancelled) useInferenceStore.getState().setSidecar(status);
    });
    const unwatch = useInferenceStore.subscribe((state, previous) => {
      if (previous.config !== null && state.config !== previous.config) void probeInto(false);
    });

    void (async () => {
      const config = await window.seed.inference.getConfig();
      if (cancelled) return;
      useInferenceStore.getState().setConfig(config);
      const status = await window.seed.inference.sidecarStatus();
      if (cancelled) return;
      useInferenceStore.getState().setSidecar(status);
      await probeInto(false);
    })();

    // Quietly re-probe while unreachable: no loading flicker, the result simply replaces the old one.
    const retry = setInterval(() => {
      const { config, probe } = useInferenceStore.getState();
      if (cancelled || config === null || probe.status === "loading") return;
      if (probe.status === "ready" && probe.value.reachable) return;
      void probeInto(true);
    }, RETRY_MS);

    return () => {
      cancelled = true;
      clearInterval(retry);
      unwatch();
      unsubscribe();
    };
  }, []);

  return { refreshProbe };
}
