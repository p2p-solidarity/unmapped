// Mirror of the main-process inference state for the UI (config, reachability, sidecar).

import type { InferenceConfig, ProbeResult, SidecarStatus } from "@shared/llm";
import { idle, type Loadable } from "@shared/result";
import { create } from "zustand";

export interface InferenceState {
  config: InferenceConfig | null;
  probe: Loadable<ProbeResult>;
  sidecar: SidecarStatus | null;
  /** Number of in-flight chat requests; the HUD shows a thinking indicator when > 0. */
  inflight: number;

  setConfig(config: InferenceConfig): void;
  setProbe(probe: Loadable<ProbeResult>): void;
  setSidecar(status: SidecarStatus): void;
  beginRequest(): void;
  endRequest(): void;
}

export const useInferenceStore = create<InferenceState>()((set) => ({
  config: null,
  probe: idle(),
  sidecar: null,
  inflight: 0,

  setConfig: (config) => set({ config }),
  setProbe: (probe) => set({ probe }),
  setSidecar: (sidecar) => set({ sidecar }),
  beginRequest: () => set((state) => ({ inflight: state.inflight + 1 })),
  endRequest: () => set((state) => ({ inflight: Math.max(0, state.inflight - 1) })),
}));
