// Who has fallen on the land and stays down. The save's ledger (`land.felled`, `@shared/foes`)
// holds the origin's and the wild hostiles with the play clock their respawn runs on, so a reload
// or a relaunch does not raise them; after `respawnSeconds` of play they stand again, so the land
// near home never empties for good. A story chapter's foes are its own (`stage.felled`, forever),
// and a world with no save keeps only this session's list.
//
// Rule 4: the clock advances every frame in a plain object; the store sees it only when someone
// falls, every SYNC_SECONDS of play while anyone is down, and when the land view closes.

import { useLandStore } from "@renderer/state";
import { parseChapterMonster } from "@shared/chapter";
import { isFelled, recordFelled, respawnFelled } from "@shared/foes";

/** Seconds of play between two writes of the clock (and respawn checks) while anyone is down. */
const SYNC_SECONDS = 30;

/** This session's fallen, per land: remounting the land view (a place, and back) must not raise them. */
const SESSION = new Map<string, Set<string>>();

function sessionOf(land: string): Set<string> {
  let set = SESSION.get(land);
  if (set === undefined) {
    set = new Set();
    SESSION.set(land, set);
  }
  return set;
}

export interface FelledBook {
  isDown(id: string): boolean;
  /** Records a fall; true when it was not already down. */
  fell(id: string): boolean;
  /** Advances the play clock; returns who respawned when a check ran and somebody did, else []. */
  tick(delta: number): string[];
  /** Writes the clock to the save now (the land view is closing). */
  flush(): void;
}

export function felledBook(land: string): FelledBook {
  const session = sessionOf(land);
  // The save this book writes to; a view closing after another save loaded must not touch it.
  const owner = useLandStore.getState().instanceId;
  let clock: number | null = null;
  let sinceSync = 0;

  const progress = () => {
    const state = useLandStore.getState();
    return state.instanceId === owner ? state.progress : null;
  };
  const now = (): number => {
    if (clock === null) clock = progress()?.felled?.clock ?? 0;
    return clock;
  };
  const write = (): string[] => {
    const current = progress();
    const ledger = current?.felled;
    if (current === null || current === undefined || ledger === undefined) return [];
    if (Object.keys(ledger.at).length === 0) return [];
    const { ledger: next, back } = respawnFelled(ledger, now());
    for (const id of back) session.delete(id);
    useLandStore.getState().setProgress({ ...current, felled: next });
    return back;
  };

  return {
    isDown: (id) => session.has(id) || isFelled(progress()?.felled, id),
    fell(id) {
      if (session.has(id)) return false;
      session.add(id);
      const current = progress();
      // A chapter remembers its own foes; nothing else is written for them here.
      if (current === null || parseChapterMonster(id) !== null) return true;
      const felled = recordFelled(current.felled, id, now());
      useLandStore.getState().setProgress({ ...current, felled });
      return true;
    },
    tick(delta) {
      clock = now() + Math.max(0, delta);
      sinceSync += delta;
      if (sinceSync < SYNC_SECONDS) return [];
      sinceSync = 0;
      return write();
    },
    flush() {
      if (clock !== null) write();
    },
  };
}
