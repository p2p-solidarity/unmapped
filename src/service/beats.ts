// The service's beats (rev 6 phase 3, D13). Every `--beat-every` (6 h; shorter only in test mode)
// each world whose last beat — or genesis receipt — is that old gets `computeBeat(now, T)` at the
// receipt clock T, signed with the service key (the beater of an attached world) and sequenced like
// any entry, so every client's fold checks it against its own recomputation.
//
// A beat that would change nothing — no fog, no rumor slots, the same season and the same care as
// the fold already has — is not written; the world is checked again one period later. An idle world
// therefore stops growing once its care has decayed to what it holds (180 days at most), instead of
// gaining four entries a day forever. Care, fog and seasons depend only on T, so a skipped beat
// loses nothing: the next one that changes something carries it.

import { canonicalJson } from "@shared/canonical";
import { computeBeat, lastBeatAt } from "@shared/history/beat";
import { timeMs } from "@shared/history/ids";
import { signEvent } from "@shared/history/sign";
import { queueProvenance } from "./chain/recorder";
import { isoAt } from "./clock";
import type { Hub } from "./hub";
import { isMirror } from "./mirror";

export interface BeatReport {
  world: string;
  /** The beat's entry n, or null when none was written. */
  n: number | null;
  /** Why not: "quiet" (it would change nothing) or a refusal code. */
  skipped?: string;
}

/** Beats every world that is due at the receipt clock's now. */
export function beatPass(hub: Hub): BeatReport[] {
  const ms = hub.clock.now();
  const at = isoAt(ms);
  const reports: BeatReport[] = [];
  for (const world of hub.worlds.values()) {
    const { now } = world;
    // A mirror (phase 4, D5) writes nothing, beats included, until an owner rehosts it here.
    if (isMirror(now, hub.key.key)) continue;
    const last = lastBeatAt(now);
    if (last === null) continue;
    const since = Math.max(timeMs(last), hub.beatChecked.get(world.id) ?? Number.NEGATIVE_INFINITY);
    if (ms - since < hub.beatEveryMs) continue;
    const computed = computeBeat(now, at);
    if (!computed.ok) {
      reports.push({ world: world.id, n: null, skipped: computed.error.code });
      continue;
    }
    const { body, care } = computed.value;
    const quiet =
      body.fog.length === 0 &&
      body.slots.length === 0 &&
      body.season === now.season &&
      canonicalJson(care) === canonicalJson(now.care);
    if (quiet) {
      hub.beatChecked.set(world.id, ms);
      reports.push({ world: world.id, n: null, skipped: "quiet" });
      continue;
    }
    const event = signEvent(
      { v: 1, world: world.id, kind: "beat", author: hub.key.key, at, seen: now.head.n, body },
      hub.key.secret,
    );
    const draft = world.draft();
    const entry = world.sequenceInto(draft, event, hub.verdict(event), at, hub.key, "service");
    const folded = draft.state.now.events[event.id];
    if (folded === undefined) {
      const code =
        draft.state.now.ignored.find((one) => one.id === event.id)?.code ?? "beat-refused";
      hub.log(`world ${world.id}: its own beat was refused (${code})`);
      reports.push({ world: world.id, n: null, skipped: code });
      continue;
    }
    const committed = world.commit(draft, hub.store);
    if (!committed.ok) {
      hub.log(`world ${world.id}: ${committed.error.message}`);
      reports.push({ world: world.id, n: null, skipped: committed.error.code });
      continue;
    }
    hub.beatChecked.delete(world.id);
    hub.afterCommit(world, draft);
    queueProvenance(hub, world);
    reports.push({ world: world.id, n: entry.n });
  }
  return reports;
}
