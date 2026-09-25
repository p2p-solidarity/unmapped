// Which world a model call belongs to, and what it cost so far. The screen that owns a world sets
// its scope (Play: the save; Create: the draft; the AI world workshop: its draft) and every call
// started while it is set is tagged with it — the scope is read when the request is sent, so a
// call that finishes after the player left is still counted where it started. Main records the
// numbers; this module only tags calls and reads totals back (@shared/usage).

import {
  fromResult,
  idle,
  type Loadable,
  loading as loadingState,
  type Result,
} from "@shared/result";
import {
  type UsagePurpose,
  type UsageScope,
  type UsageSummary,
  type UsageTag,
  usageScopeKey,
} from "@shared/usage";
import { useEffect, useState } from "react";

let current: UsageScope | null = null;

/**
 * Sets the world new calls belong to; the returned cleanup clears it if it is still this one. The
 * screens that own a world never show at once, so nothing has to be restored underneath.
 */
export function setUsageScope(scope: UsageScope | null): () => void {
  current = scope;
  return () => {
    if (current === scope) current = null;
  };
}

export function usageScope(): UsageScope | null {
  return current;
}

/** Owns the scope while the calling screen shows this world; `null` leaves it untouched. */
export function useUsageScope(scope: UsageScope | null): void {
  const key = scope === null ? null : usageScopeKey(scope);
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the scope's identity
  useEffect(() => (scope === null ? undefined : setUsageScope(scope)), [key]);
}

export function usageTag(purpose: UsagePurpose): UsageTag {
  return { purpose, scope: current };
}

/** A world's running total, re-read whenever main records a call. */
export function useUsageSummary(scope: UsageScope | null): Loadable<UsageSummary> {
  const [state, setState] = useState<Loadable<UsageSummary>>(idle());
  const key = scope === null ? null : usageScopeKey(scope);

  // `key` stands for `scope`: a new object naming the same world must not re-subscribe.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the scope's identity
  useEffect(() => {
    if (scope === null || key === null) {
      setState(idle());
      return;
    }
    let live = true;
    const read = (): void => {
      void window.seed.usage.summary(scope).then((result: Result<UsageSummary>) => {
        if (live) setState(fromResult(result));
      });
    };
    setState(loadingState());
    read();
    const off = window.seed.usage.onChanged(() => read());
    return () => {
      live = false;
      off();
    };
  }, [key]);

  return state;
}
