// The state behind the door's sharing section (rev 6 phase 3, WP8): which world the open save
// plays (from `world.badges`, so the door needs nothing of the land's own loading), what its door
// says now (`world.door`, read again whenever main reports a change to that world), what the light
// chain says about this device's copy (`world.provenance`, phase 4 D6: read once per opening and on
// request, never on every change), and one action's Result at a time (Rule 2: idle | loading |
// ready | error, never a guess).

import type { Translate } from "@renderer/i18n";
import { serviceLabel } from "@renderer/net/worldServices";
import type { ProvenanceReport } from "@shared/provenance";
import {
  type AppError,
  err,
  errored,
  idle,
  type Loadable,
  loading,
  type Result,
  ready,
} from "@shared/result";
import type { WorldBadgeKind, WorldDoor } from "@shared/worldApi";
import { useCallback, useEffect, useRef, useState } from "react";

/** Main's world events come in bursts (an attach re-receipts the whole log): one read per burst. */
const REREAD_MS = 250;

const NO_HISTORY: AppError = {
  code: "world-door-no-history",
  message: "This save has no shared history yet.",
  hint: "It is made when Play opens the save; leave to the title and open the save again.",
};

/** An author key short enough for a line ("kabc2def…"), where the world knows no name for it. */
export function shortKey(key: string): string {
  return `${key.slice(0, 9)}…`;
}

/** Where a save's world lives, in one line: the library's badge and the door's first line. */
export function badgeText(
  t: Translate,
  kind: WorldBadgeKind,
  url: string | null,
  owner: string,
): string {
  const service = url === null ? "" : serviceLabel(url);
  if (kind === "local") return t("world.badgeLocal");
  if (kind === "shared") return t("world.badgeShared", { service });
  return t("world.badgeJoined", { owner, service });
}

/** The world id of `instanceId`'s save; looked up again when main reports any world's status. */
export function useSaveWorldId(instanceId: string | null): Loadable<string> {
  const [state, setState] = useState<Loadable<string>>(idle());
  useEffect(() => {
    if (instanceId === null) {
      setState(idle());
      return;
    }
    let alive = true;
    let found = false;
    const look = (): void => {
      void window.seed.world.badges().then((result) => {
        if (!alive) return;
        if (!result.ok) {
          setState(errored(result.error));
          return;
        }
        const badge = result.value.find((one) => one.instanceId === instanceId);
        found = badge !== undefined;
        setState(badge === undefined ? errored(NO_HISTORY) : ready(badge.worldId));
      });
    };
    setState(loading());
    look();
    // Play makes the save's history when it opens (`world.ensure`); its first status ends the wait.
    const stop = window.seed.world.onStatus(() => {
      if (!found) look();
    });
    return () => {
      alive = false;
      stop();
    };
  }, [instanceId]);
  return state;
}

/** The door of `worldId`, kept current with main's `world:status` and `world:entries` events. */
export function useWorldDoor(worldId: string | null): {
  door: Loadable<WorldDoor>;
  refresh(): void;
} {
  const [door, setDoor] = useState<Loadable<WorldDoor>>(idle());
  const seq = useRef(0);
  const refresh = useCallback(() => {
    if (worldId === null) return;
    const mine = ++seq.current;
    void window.seed.world.door(worldId).then((result) => {
      if (mine !== seq.current) return;
      setDoor(result.ok ? ready(result.value) : errored(result.error));
    });
  }, [worldId]);

  useEffect(() => {
    if (worldId === null) {
      setDoor(idle());
      return;
    }
    setDoor(loading());
    refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = (world: string): void => {
      if (world !== worldId) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, REREAD_MS);
    };
    const stopStatus = window.seed.world.onStatus((status) => soon(status.world));
    const stopEntries = window.seed.world.onEntries((event) => soon(event.world));
    return () => {
      clearTimeout(timer);
      stopStatus();
      stopEntries();
      seq.current += 1;
    };
  }, [worldId, refresh]);

  return { door, refresh };
}

/**
 * What the chain recorded for `worldId`, compared with this device's copy: read when the door
 * opens and again on `check`. `provenance-not-configured` (no chain set up on this device) comes
 * back as an error value at once; the door shows it as a calm line, not a failure.
 */
export function useWorldProvenance(worldId: string): {
  state: Loadable<ProvenanceReport>;
  check(): void;
} {
  const [state, setState] = useState<Loadable<ProvenanceReport>>(idle());
  const seq = useRef(0);
  const check = useCallback(() => {
    const mine = ++seq.current;
    setState(loading());
    void window.seed.world.provenance(worldId).then((result) => {
      if (mine !== seq.current) return;
      setState(result.ok ? ready(result.value) : errored(result.error));
    });
  }, [worldId]);
  useEffect(() => {
    check();
    return () => {
      seq.current += 1;
    };
  }, [check]);
  return { state, check };
}

/**
 * One action's outcome: `run` sets loading, then the Result (ready or error), and resolves with
 * it; a second run while one is loading is ignored. `clear` returns to idle.
 */
export function useAction<T>(): {
  state: Loadable<T>;
  run(task: () => Promise<Result<T>>): Promise<Result<T> | null>;
  clear(): void;
} {
  const [state, setState] = useState<Loadable<T>>(idle());
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = useCallback(async (task: () => Promise<Result<T>>) => {
    if (busy.current) return null;
    busy.current = true;
    setState(loading());
    let result: Result<T>;
    try {
      result = await task();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      result = err("world-action-failed", `The request could not be sent: ${reason}`);
    }
    busy.current = false;
    if (alive.current) setState(result.ok ? ready(result.value) : errored(result.error));
    return result;
  }, []);
  const clear = useCallback(() => setState(idle()), []);
  return { state, run, clear };
}
