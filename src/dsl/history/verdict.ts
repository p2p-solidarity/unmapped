// An entry's verdict (rev 6 phase 3, D4): what the fold cannot check itself about one event — it
// reads (`readEvent`), its id is its content and its author signed it (`verifyEvent`), and its
// programs pass the DSL (`validateEventBody`). Main and the service compute it for every entry and
// outbox event; the renderer receives it with each entry and folds with it (`applyEntry`). The
// verdict is a pure function of the event, and an event's id is the hash of its content, so a
// verdict computed once holds for that id for good (as long as `verifyEvent` passed).

import { readEvent } from "@shared/history/event";
import { verifyEvent } from "@shared/history/sign";
import type {
  EntryVerdict,
  LogEntry,
  PendingEvent,
  StoredEvent,
  VerdictEntry,
} from "@shared/history/types";
import { validateEventBody } from "./validate";

/** D5 steps 1, 2 and 4, in that order: the first refusal's code, or ok. */
export function entryVerdict(event: StoredEvent): EntryVerdict {
  const read = readEvent(event);
  if (!read.ok) return { ok: false, code: read.error.code };
  const verified = verifyEvent(event);
  if (!verified.ok) return { ok: false, code: verified.error.code };
  const valid = validateEventBody(read.value);
  return valid.ok ? { ok: true } : { ok: false, code: valid.error.code };
}

/** Log entries with their verdicts, ready for `foldEntries`. */
export function verdictEntries(entries: readonly LogEntry[]): VerdictEntry[] {
  return entries.map((entry) => ({ entry, verdict: entryVerdict(entry.event) }));
}

/** Outbox events with their verdicts, ready for `withPending`. */
export function pendingEvents(events: readonly StoredEvent[]): PendingEvent[] {
  return events.map((event) => ({ event, verdict: entryVerdict(event) }));
}
