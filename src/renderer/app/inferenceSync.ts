// `useInferenceSync()` is mounted exactly once (App). Screens that need to re-probe the provider
// reach it through this context instead of starting a second subscription.

import { createContext, useCallback, useContext } from "react";

export interface InferenceSync {
  refreshProbe(): void;
}

export const InferenceSyncContext = createContext<InferenceSync | null>(null);

/** Outside the provider (tests, isolated renders) this is a no-op rather than a crash. */
export function useRefreshProbe(): () => void {
  const sync = useContext(InferenceSyncContext);
  return useCallback(() => {
    sync?.refreshProbe();
  }, [sync]);
}
