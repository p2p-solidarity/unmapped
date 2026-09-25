// A sequencer run in memory over a migration plan (rev 6 phase 3, D6). Each planned event is read,
// DSL-checked and admitted against the fold of everything planned before it — the same steps main
// and the service run on it later (D5) — and enters the plan only if it would enter the history.
// So a migration never writes an entry every fold would then skip: what stays out is reported by
// the caller instead, one by one.
//
// Ids cover no signature and no receipt, so the placeholder signature and receipt time used here
// change nothing about the ids the plan's events get when main signs and sequences them.

import { admit } from "@shared/history/admit";
import { readEvent } from "@shared/history/event";
import { applyEntry, emptyNow } from "@shared/history/fold";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import { eventIdOf } from "@shared/history/sign";
import type {
  GenesisEvent,
  StoredEvent,
  UnsignedEvent,
  UnsignedEventOf,
  WorldNow,
} from "@shared/history/types";
import { err, ok, type Result } from "@shared/result";
import { validateEventBody } from "./validate";

/** Signature-shaped, so `readEvent` accepts it; never verified (the verdict is given as ok). */
const PLACEHOLDER_SIG = "A".repeat(86);
/** Admission never depends on it for the kinds a migration writes (no visits, beats or joins). */
const PLACEHOLDER_RT = "2000-01-01T00:00:00.000Z";

export interface Planner {
  /** The world id: the genesis's event id. */
  readonly world: string;
  /** Adds `event` when it would enter the history; its id, or why it would not. */
  add(event: UnsignedEvent): Result<string>;
  /** The planned events so far, genesis first. */
  events(): UnsignedEvent[];
  /** The fold over the planned events so far. */
  now(): WorldNow;
}

function stored(event: UnsignedEvent): StoredEvent {
  return { ...event, id: eventIdOf(event), sig: PLACEHOLDER_SIG };
}

/** A plan that starts with `genesis`, or why that genesis is no world's. */
export function startPlan(genesis: UnsignedEventOf<"genesis">): Result<Planner> {
  const first = stored(genesis);
  const read = readEvent(first);
  if (!read.ok) return read;
  if (read.value.kind !== "genesis")
    return err("genesis-invalid", "The plan must start with a genesis.");
  const world = first.id;
  let now = emptyNow(read.value as GenesisEvent);
  let cursor: LogCursor = logStart(world);
  const genesisEntry = sequenceEvent(cursor, first, PLACEHOLDER_RT, null);
  now = applyEntry(now, genesisEntry, { ok: true });
  cursor = { n: genesisEntry.n, chain: genesisEntry.chain, rt: genesisEntry.rt };
  const events: UnsignedEvent[] = [genesis];

  const add = (event: UnsignedEvent): Result<string> => {
    const raw = stored(event);
    const read = readEvent(raw);
    if (!read.ok) return read;
    const valid = validateEventBody(read.value);
    if (!valid.ok) return valid;
    const admitted = admit(now, read.value, PLACEHOLDER_RT);
    if (!admitted.ok) return admitted;
    const entry = sequenceEvent(cursor, raw, PLACEHOLDER_RT, null);
    const next = applyEntry(now, entry, { ok: true });
    const ignored = next.ignored.length > now.ignored.length ? next.ignored.at(-1) : undefined;
    if (ignored !== undefined) {
      return err(ignored.code, `The history would skip this ${event.kind}.`);
    }
    now = next;
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    events.push(event);
    return ok(raw.id);
  };

  return ok({ world, add, events: () => [...events], now: () => now });
}
