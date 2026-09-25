// Reading an event (rev 6 phase 3, D5 step 1): the envelope, the per-kind body, and the size caps.
// Run by the service, main and the renderer on everything that arrives. It never transforms: the
// value it returns is the value the author hashed, so ./sign verifies either one the same way.
//
// An unknown `v` or `kind` is its own code (D18): the log keeps such an entry and the fold skips
// it as "from a newer build"; the service refuses to sequence one.

import { z } from "zod";
import { canonicalJson } from "../canonical";
import { err, ok, type Result } from "../result";
import { BODY_SCHEMAS, HISTORY_LIMITS } from "./bodies";
import { AUTHOR_KEY, EVENT_ID, SIGNATURE, utf8Length } from "./ids";
import { EVENT_KINDS, type EventKind, type HistoryEvent, type StoredEvent } from "./types";

const KINDS: ReadonlySet<string> = new Set(EVENT_KINDS);

/** An event as a log line or a frame carries it: any object with an event id (./types). */
export const storedEventSchema: z.ZodType<StoredEvent> = z.looseObject({
  id: z.string().regex(EVENT_ID),
});

function envelope<K extends EventKind>(kind: K) {
  return z.strictObject({
    v: z.literal(1),
    world: z.string().max(64),
    kind: z.literal(kind),
    author: z.string().regex(AUTHOR_KEY),
    at: z.string().min(1).max(40),
    seen: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    body: BODY_SCHEMAS[kind],
    id: z.string().regex(EVENT_ID),
    sig: z.string().regex(SIGNATURE),
  });
}

const ENVELOPES = Object.fromEntries(EVENT_KINDS.map((kind) => [kind, envelope(kind)])) as {
  [K in EventKind]: ReturnType<typeof envelope<K>>;
};

function issueText(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) return "does not match the event schema";
  const path = issue.path.length > 0 ? issue.path.join(".") : "event";
  return `${path}: ${issue.message}`;
}

export function isEventKind(kind: unknown): kind is EventKind {
  return typeof kind === "string" && KINDS.has(kind);
}

/**
 * The typed event in `raw`, or why not: `event-version-unknown` / `event-kind-unknown` (newer
 * build), `event-too-large` (> 128 KiB of canonical JSON), `event-invalid` (shape, caps, or a
 * genesis that names a world or has seen anything).
 */
export function readEvent(raw: unknown): Result<HistoryEvent> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return err("event-invalid", "An event must be a JSON object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.v !== 1) {
    return err(
      "event-version-unknown",
      `Event format ${String(record.v)} is not one this build reads.`,
      "Update UNMAPPED (or the world service) to read it.",
    );
  }
  if (!isEventKind(record.kind)) {
    return err(
      "event-kind-unknown",
      `Event kind ${String(record.kind).slice(0, 40)} is not one this build knows.`,
      "Update UNMAPPED (or the world service) to read it.",
    );
  }
  if (utf8Length(canonicalJson(raw)) > HISTORY_LIMITS.eventBytes) {
    return err(
      "event-too-large",
      `An event may hold at most ${HISTORY_LIMITS.eventBytes} bytes.`,
      "Write something shorter.",
    );
  }
  const parsed = ENVELOPES[record.kind].safeParse(raw);
  if (!parsed.success) return err("event-invalid", issueText(parsed.error));
  const event = parsed.data as HistoryEvent;
  if (event.kind === "genesis") {
    if (event.world !== "" || event.seen !== 0) {
      return err("event-invalid", "A genesis names no world and has seen nothing.");
    }
  } else if (!EVENT_ID.test(event.world)) {
    return err("event-invalid", "world: must be the genesis event id");
  }
  return ok(event);
}
