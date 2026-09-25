// Hydrates the inference store on mount: config → sidecar status → probe, then keeps the sidecar
// status live. Every screen that shows model state mounts this once; `refreshProbe` is for the
// "Retry connection" affordances.

import { useInferenceStore } from "@renderer/state/inferenceStore";
import { fromResult, loading } from "@shared/result";
import { useCallback, useEffect } from "react";

/** While the provider is unreachable, look again this often — a failed boot probe must not stick. */
const RETRY_MS = 15_000;

export interface InferenceSync {
  /** Re-runs the provider probe and pushes loading → ready/error into the store. */
  refreshProbe(): Promise<void>;
}

export function useInferenceSync(): InferenceSync {
  const refreshProbe = useCallback(async () => {
    useInferenceStore.getState().setProbe(loading());
    const result = await window.seed.inference.probe();
    useInferenceStore.getState().setProbe(fromResult(result));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = window.seed.inference.onSidecar((status) => {
      if (!cancelled) useInferenceStore.getState().setSidecar(status);
    });

    void (async () => {
      const config = await window.seed.inference.getConfig();
      if (cancelled) return;
      useInferenceStore.getState().setConfig(config);
      const status = await window.seed.inference.sidecarStatus();
      if (cancelled) return;
      useInferenceStore.getState().setSidecar(status);
      await refreshProbe();
    })();

    // Quietly re-probe while unreachable: no loading flicker, the result simply replaces the old one.
    const retry = setInterval(() => {
      const { config, probe } = useInferenceStore.getState();
      if (config === null || probe.status === "loading") return;
      if (probe.status === "ready" && probe.value.reachable) return;
      void window.seed.inference.probe().then((result) => {
        if (!cancelled) useInferenceStore.getState().setProbe(fromResult(result));
      });
    }, RETRY_MS);

    return () => {
      cancelled = true;
      clearInterval(retry);
      unsubscribe();
    };
  }, [refreshProbe]);

  return { refreshProbe };
}
