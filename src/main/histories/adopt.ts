// Adoption (rev 6 phase 3, D7): a save restored on another device, whose world was never attached
// to a service, becomes a world of this device. A new genesis — the old body with
// `from: { instanceId, world: oldWorldId, head }` — and every event of the copy re-signed under
// this device's key: same bodies and `at`, the new world, so new ids. Event ids inside bodies (note
// anchors and contests, `supersedes`, deed refs, a chapter's `more`, a take's gift, a hide's target)
// follow the old → new map, and `seen` follows the renumbering. Beats and rumors are not carried
// (a beat's fingerprint binds the old chain; the next beat recomputes), nor is anything that needs
// a service (sequencer, joins, removals, revocations). The old history directory is never touched.
//
// The same rebase serves a catch-up whose plan names another genesis than the save's world (an
// adopted world, or a world whose genesis inputs changed): planned events are rebased onto the
// world before they are deduped, so the same content maps to the same id either way.

import { readEvent } from "@shared/history/event";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { logStart, sequenceEvent } from "@shared/history/log";
import type {
  EventBodies,
  GenesisEvent,
  Head,
  HistoryEvent,
  LogEntry,
  StoredEvent,
  UnsignedEvent,
} from "@shared/history/types";
import type { Skipped } from "@shared/worldApi";
import type { DeviceKey } from "../identity/deviceKey";
import { skippedOf, type VerdictOf } from "./loaded";

/** Kinds an adoption or a rebase never carries. */
const NOT_CARRIED: ReadonlySet<string> = new Set([
  "genesis",
  "sequencer",
  "beat",
  "rumor",
  "member.join",
  "member.remove",
  "invite.revoke",
]);

type IdMap = Map<string, string>;

const mapped = (map: IdMap, id: string): string => map.get(id) ?? id;

/** The body with every event id it names taken through `map` (unknown ids stay as they are). */
export function remapBody(event: HistoryEvent, map: IdMap): EventBodies[HistoryEvent["kind"]] {
  switch (event.kind) {
    case "note":
      return {
        ...event.body,
        anchors: event.body.anchors.map((id) => mapped(map, id)),
        contests: event.body.contests === null ? null : mapped(map, event.body.contests),
      };
    case "witness":
      return event.body.supersedes === undefined
        ? event.body
        : { ...event.body, supersedes: mapped(map, event.body.supersedes) };
    case "deed": {
      if (event.body.what !== "errand.done") {
        return { ...event.body, ref: mapped(map, event.body.ref) };
      }
      const [witness = "", errand = ""] = event.body.ref.split(":");
      return { ...event.body, ref: `${mapped(map, witness)}:${errand}` };
    }
    case "chapter":
      return event.body.more === null
        ? event.body
        : { ...event.body, more: mapped(map, event.body.more) };
    case "gift.take":
      return { gift: mapped(map, event.body.gift) };
    case "hide":
      return { ...event.body, id: mapped(map, event.body.id) };
    default:
      return event.body;
  }
}

/** One event re-signed into `world` by `key`, its references mapped, with `seen`. */
export function rebaseEvent(
  event: HistoryEvent,
  world: string,
  key: DeviceKey,
  map: IdMap,
  seen: number,
): HistoryEvent {
  const unsigned = {
    v: 1,
    world,
    kind: event.kind,
    author: key.author,
    at: event.at,
    seen,
    body: remapBody(event, map),
  } as UnsignedEvent;
  return key.signEvent(unsigned) as HistoryEvent;
}

/**
 * Planned events (all `seen: 0`, written for the plan's genesis `from`) rebased onto `world`, in
 * order, with the old → new id map. Their ids are what the same content has in `world`.
 */
export function rebasePlanned(
  events: readonly HistoryEvent[],
  from: string,
  world: string,
  key: DeviceKey,
): { events: HistoryEvent[]; idMap: IdMap } {
  const map: IdMap = new Map([[from, world]]);
  if (from === world) {
    for (const event of events) map.set(event.id, event.id);
    return { events: [...events], idMap: map };
  }
  const out: HistoryEvent[] = [];
  for (const event of events) {
    if (NOT_CARRIED.has(event.kind)) continue;
    const next = rebaseEvent(event, world, key, map, event.seen);
    map.set(event.id, next.id);
    out.push(next);
  }
  return { events: out, idMap: map };
}

export function adoptedGenesis(old: GenesisEvent, head: Head, key: DeviceKey): GenesisEvent {
  return key.signEvent({
    v: 1,
    world: "",
    kind: "genesis",
    author: key.author,
    at: old.at,
    seen: 0,
    body: {
      ...old.body,
      from: { instanceId: old.body.from.instanceId, world: old.id, head },
    },
  });
}

export interface AdoptedLog {
  genesis: GenesisEvent;
  entries: LogEntry[];
  /** Old event id → its id in the adopted world. */
  idMap: IdMap;
  dropped: Skipped[];
}

/**
 * The adopted world's whole log from the old one, deterministically: the old receipt times (never
 * going backwards), `seen` renumbered to what was kept, and only what a fold admits.
 */
export function adoptLog(
  old: readonly LogEntry[],
  oldGenesis: GenesisEvent,
  key: DeviceKey,
  verdictOf: VerdictOf,
): AdoptedLog {
  const last = old[old.length - 1];
  const head: Head = { n: last?.n ?? 0, chain: last?.chain ?? oldGenesis.id };
  const genesis = adoptedGenesis(oldGenesis, head, key);
  const idMap: IdMap = new Map([[oldGenesis.id, genesis.id]]);
  const dropped: Skipped[] = [];
  const first = sequenceEvent(
    logStart(genesis.id),
    genesis,
    old[0]?.rt ?? new Date(0).toISOString(),
    null,
  );
  const entries: LogEntry[] = [first];
  let now = applyEntry(emptyNow(genesis), first, verdictOf(genesis));
  /** New head after each old entry (index = old n). */
  const newHead: number[] = [0, 1];
  let cursor = { n: first.n, chain: first.chain, rt: first.rt };
  for (const entry of old.slice(1)) {
    const read = readEvent(entry.event as StoredEvent);
    const keep = read.ok && !NOT_CARRIED.has(read.value.kind);
    if (keep && read.ok) {
      const seen = newHead[Math.min(read.value.seen, entry.n - 1)] ?? 0;
      const next = rebaseEvent(read.value, genesis.id, key, idMap, seen);
      const sequenced = sequenceEvent(cursor, next, entry.rt, null);
      const folded = applyEntry(now, sequenced, verdictOf(next));
      const refused =
        folded.ignored.length > now.ignored.length ? folded.ignored.at(-1) : undefined;
      if (refused === undefined) {
        idMap.set(read.value.id, next.id);
        entries.push(sequenced);
        now = folded;
        cursor = { n: sequenced.n, chain: sequenced.chain, rt: sequenced.rt };
      } else {
        dropped.push(skippedOf(read.value, refused.code, `Not carried over: ${refused.code}.`));
      }
    } else if (read.ok) {
      dropped.push(skippedOf(read.value, "adopt-not-carried", "Written for the old world only."));
    } else {
      dropped.push(skippedOf(entry.event, read.error.code, read.error.message));
    }
    newHead[entry.n] = cursor.n;
  }
  return { genesis, entries, idMap, dropped };
}
