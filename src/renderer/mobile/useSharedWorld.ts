// One shared world as the mobile shell reads it (rev 6 phase 4, D7): `window.seed.world.read`,
// then every `onEntries` / `onStatus` for it, folded here with the shared fold — never the
// desktop's land store. The view is the sequenced fold with this device's outbox on top
// (`withPending`), so a note left offline shows at once, marked "not yet shared".

import { emptyNow, foldEntries, openGenesis, withPending } from "@shared/history/fold";
import type { PendingEvent, WorldNow } from "@shared/history/types";
import { errored, type Loadable, loading, ready } from "@shared/result";
import type { RefusedEvent, WorldRead, WorldStatus } from "@shared/worldApi";
import { useEffect, useMemo, useState } from "react";

export interface SharedWorldView {
  /** The fold with the outbox on top. */
  now: WorldNow;
  status: WorldStatus;
  refused: RefusedEvent[];
}

interface Held {
  base: WorldNow;
  pending: PendingEvent[];
  status: WorldStatus;
  refused: RefusedEvent[];
}

function fromRead(read: WorldRead): Held | null {
  const genesis = openGenesis(read.genesis);
  if (!genesis.ok) return null;
  const start = read.snapshot?.now ?? emptyNow(genesis.value);
  return {
    base: foldEntries(start, read.entries),
    pending: read.pending,
    status: read.status,
    refused: read.refused,
  };
}

export function useSharedWorld(worldId: string): Loadable<SharedWorldView> {
  const [held, setHeld] = useState<Loadable<Held>>(loading());

  useEffect(() => {
    const api = window.seed.world;
    let live = true;
    const reread = async (): Promise<void> => {
      const read = await api.read(worldId);
      if (!live) return;
      if (!read.ok) {
        setHeld(errored(read.error));
        return;
      }
      const next = fromRead(read.value);
      setHeld(
        next === null
          ? errored({ code: "genesis-invalid", message: "This world's genesis does not read." })
          : ready(next),
      );
    };
    const stopEntries = api.onEntries((event) => {
      if (event.world !== worldId) return;
      // Outbox or refused-list changes carry no entries: read the whole view again.
      if (event.reset || event.entries.length === 0) {
        void reread();
        return;
      }
      setHeld((state) => {
        if (state.status !== "ready") return state;
        const fresh = event.entries.filter(({ entry }) => entry.n > state.value.base.head.n);
        return ready({
          ...state.value,
          base: foldEntries(state.value.base, fresh),
          pending: event.pending,
        });
      });
    });
    const stopStatus = api.onStatus((status) => {
      if (status.world !== worldId) return;
      setHeld((state) => (state.status === "ready" ? ready({ ...state.value, status }) : state));
    });
    void reread();
    return () => {
      live = false;
      stopEntries();
      stopStatus();
    };
  }, [worldId]);

  return useMemo(() => {
    if (held.status !== "ready") return held;
    const { base, pending, status, refused } = held.value;
    const now = pending.length === 0 ? base : withPending(base, pending, new Date().toISOString());
    return ready({ now, status, refused });
  }, [held]);
}
