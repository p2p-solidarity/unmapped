// The files of one world's history directory (./paths). Only this module touches them.
//
// - `log.jsonl` is append-only: line n is entry n. A crash mid-append can leave a torn last line
//   (no trailing newline). On load, a tail that parses as the next entry gets its newline; one that
//   does not was never an entry and is cut off. Any other bad line means the log itself is wrong
//   (`history-log-invalid`): the world is not folded, never "repaired".
// - `outbox.jsonl` is a queue, replaced atomically on every change.
// - `refused.jsonl` only grows: a refusal line per refused own event, and a `dismissed` line when
//   the player dismisses one. Nothing is ever removed from it.
// - `link.json`, `snapshot.json` and `received-works.json` are replaced atomically.

import { appendFile, readFile, truncate } from "node:fs/promises";
import { join } from "node:path";
import type { ContentHash } from "@shared/cartridge";
import { storedEventSchema } from "@shared/history/event";
import { FOLD_VERSION } from "@shared/history/fold";
import { AUTHOR_KEY, CHAIN, CONTENT_HASH, EVENT_ID } from "@shared/history/ids";
import { readLogLine } from "@shared/history/log";
import type { FoldSnapshot, LogEntry, StoredEvent, WorldNow } from "@shared/history/types";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { WORK_ID } from "@shared/works";
import type { RefusedEvent } from "@shared/worldApi";
import { z } from "zod";
import type { WorkPackRef } from "../works/pack";
import {
  jsonl,
  jsonlLines,
  readJsonFile,
  readTextOrNull,
  writeJsonAtomic,
  writeTextAtomic,
} from "./fsx";
import {
  LINK_FILE,
  LOG_FILE,
  OUTBOX_FILE,
  RECEIVED_WORKS_FILE,
  REFUSED_FILE,
  SNAPSHOT_FILE,
} from "./paths";

const LOG_HINT =
  "This world's history file is damaged. Restore the save from a backup; nothing was changed.";

// ── log.jsonl ───────────────────────────────────────────────────────────────────────────────

/** Every entry of the log, in order, after mending a torn last line (see the header). */
export async function readLog(dir: string): Promise<Result<LogEntry[]>> {
  const path = join(dir, LOG_FILE);
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      return err("history-missing", "This world's history is not on this device.", LOG_HINT);
    }
    return fail(toError(error, "history-log-invalid"));
  }
  const text = bytes.toString("utf8");
  const end = text.lastIndexOf("\n") + 1;
  const lines = text.slice(0, end).split("\n");
  const entries: LogEntry[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.length === 0 && index === lines.length - 1) break;
    const entry = readLogLine(line);
    if (!entry.ok) {
      return err(
        "history-log-invalid",
        `log.jsonl line ${index + 1}: ${entry.error.message}`,
        LOG_HINT,
      );
    }
    entries.push(entry.value);
  }
  const tail = text.slice(end);
  if (tail.length > 0) {
    const last = readLogLine(tail);
    try {
      if (last.ok && last.value.n === entries.length + 1) {
        await appendFile(path, "\n", "utf8");
        entries.push(last.value);
      } else {
        await truncate(path, Buffer.byteLength(text.slice(0, end), "utf8"));
      }
    } catch (error) {
      return fail(toError(error, "history-log-invalid"));
    }
  }
  return ok(entries);
}

export async function appendLog(dir: string, entries: readonly LogEntry[]): Promise<void> {
  if (entries.length > 0) await appendFile(join(dir, LOG_FILE), jsonl(entries), "utf8");
}

/** Writes a whole log (a new history, or attach's re-receipted copy) atomically. */
export function writeLog(dir: string, entries: readonly LogEntry[]): Promise<void> {
  return writeTextAtomic(join(dir, LOG_FILE), jsonl(entries));
}

// ── outbox.jsonl ────────────────────────────────────────────────────────────────────────────

export async function readOutbox(dir: string): Promise<Result<StoredEvent[]>> {
  let text: string | null;
  try {
    text = await readTextOrNull(join(dir, OUTBOX_FILE));
  } catch (error) {
    return fail(toError(error, "history-outbox-invalid"));
  }
  const events: StoredEvent[] = [];
  for (const [index, line] of jsonlLines(text ?? "").entries()) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return err("history-outbox-invalid", `outbox.jsonl line ${index + 1} is not JSON.`, LOG_HINT);
    }
    const parsed = storedEventSchema.safeParse(raw);
    if (!parsed.success) {
      return err(
        "history-outbox-invalid",
        `outbox.jsonl line ${index + 1} is not an event.`,
        LOG_HINT,
      );
    }
    events.push(parsed.data);
  }
  return ok(events);
}

/** The whole queue, replaced at once: a crash leaves the old queue or the new one. */
export function writeOutbox(dir: string, events: readonly StoredEvent[]): Promise<void> {
  return writeTextAtomic(join(dir, OUTBOX_FILE), jsonl(events));
}

// ── refused.jsonl ───────────────────────────────────────────────────────────────────────────

const appErrorSchema = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().max(500),
  hint: z.string().max(500).optional(),
});

const refusedLineSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    v: z.literal(1),
    kind: z.literal("refused"),
    at: z.string().min(1).max(40),
    event: storedEventSchema,
    error: appErrorSchema,
  }),
  z.strictObject({
    v: z.literal(1),
    kind: z.literal("dismissed"),
    at: z.string().min(1).max(40),
    id: z.string().regex(EVENT_ID),
  }),
]);

export interface RefusedList {
  /** Refused and not dismissed, oldest first. */
  active: RefusedEvent[];
  /** Every refusal ever recorded, dismissed or not. */
  total: number;
}

export async function readRefused(dir: string): Promise<Result<RefusedList>> {
  let text: string | null;
  try {
    text = await readTextOrNull(join(dir, REFUSED_FILE));
  } catch (error) {
    return fail(toError(error, "history-refused-invalid"));
  }
  const active = new Map<string, RefusedEvent>();
  let total = 0;
  for (const line of jsonlLines(text ?? "")) {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = refusedLineSchema.safeParse(raw);
    if (!parsed.success) continue;
    const record = parsed.data;
    if (record.kind === "refused") {
      total += 1;
      active.set(record.event.id, { event: record.event, error: record.error, at: record.at });
    } else {
      active.delete(record.id);
    }
  }
  return ok({ active: [...active.values()], total });
}

export async function appendRefused(dir: string, refused: readonly RefusedEvent[]): Promise<void> {
  const lines = refused.map((one) => ({ v: 1, kind: "refused", ...one }));
  if (lines.length > 0) await appendFile(join(dir, REFUSED_FILE), jsonl(lines), "utf8");
}

export async function appendDismissed(dir: string, id: string, at: string): Promise<void> {
  await appendFile(join(dir, REFUSED_FILE), jsonl([{ v: 1, kind: "dismissed", at, id }]), "utf8");
}

// ── link.json ───────────────────────────────────────────────────────────────────────────────

export interface WorldLink {
  v: 1;
  /** The service this world is attached to (`wss://`, or `ws://` on loopback). */
  url: string;
  /** The service's receipt key, pinned at attach or join: a service answering with another is refused. */
  key: string;
  attachedAt: string;
  /** Set when sync stopped because the service's history is not ours (`history-diverged`). */
  diverged: { code: string; message: string; hint?: string } | null;
}

const linkSchema: z.ZodType<WorldLink> = z.strictObject({
  v: z.literal(1),
  url: z.string().min(1).max(200),
  key: z.string().regex(AUTHOR_KEY),
  attachedAt: z.string().min(1).max(40),
  diverged: appErrorSchema.nullable(),
});

export function readLink(dir: string): Promise<Result<WorldLink | null>> {
  return readJsonFile(
    join(dir, LINK_FILE),
    linkSchema,
    "history-link-invalid",
    "link.json is damaged; attach the world again from the device that owns it.",
  );
}

export function writeLink(dir: string, link: WorldLink): Promise<void> {
  return writeJsonAtomic(join(dir, LINK_FILE), link);
}

// ── snapshot.json ───────────────────────────────────────────────────────────────────────────

const snapshotSchema = z.object({
  foldVersion: z.number().int(),
  head: z.strictObject({
    n: z.number().int().min(0),
    chain: z.union([z.string().regex(CHAIN), z.string().regex(EVENT_ID)]),
  }),
  now: z.record(z.string(), z.unknown()),
});

/**
 * The fold cache, if it can be trusted for this log: same `FOLD_VERSION`, and entry `head.n` of
 * `entries` has exactly that chain. Anything else (absent, damaged, stale) is null: refold.
 */
export async function readSnapshot(
  dir: string,
  world: string,
  entries: readonly LogEntry[],
): Promise<FoldSnapshot | null> {
  let text: string | null;
  try {
    text = await readTextOrNull(join(dir, SNAPSHOT_FILE));
  } catch {
    return null;
  }
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success || parsed.data.foldVersion !== FOLD_VERSION) return null;
  const { head } = parsed.data;
  const now = parsed.data.now as unknown as WorldNow;
  if (now.world !== world || now.head?.n !== head.n || now.head?.chain !== head.chain) return null;
  if (head.n === 0 || head.n > entries.length) return null;
  if (entries[head.n - 1]?.chain !== head.chain) return null;
  return { foldVersion: FOLD_VERSION, head, now };
}

export function writeSnapshot(dir: string, now: WorldNow): Promise<void> {
  const snapshot: FoldSnapshot = { foldVersion: FOLD_VERSION, head: now.head, now };
  return writeTextAtomic(join(dir, SNAPSHOT_FILE), JSON.stringify(snapshot));
}

// ── received-works.json ─────────────────────────────────────────────────────────────────────

const receivedSchema = z.strictObject({
  v: z.literal(1),
  works: z
    .array(
      z.strictObject({
        workId: z.string().regex(WORK_ID),
        version: z.string().max(40),
        contentHash: z.custom<ContentHash>((v) => typeof v === "string" && CONTENT_HASH.test(v)),
        pack: z.custom<ContentHash>((v) => typeof v === "string" && CONTENT_HASH.test(v)),
      }),
    )
    .max(4096),
});

export async function readReceivedWorks(dir: string): Promise<Result<WorkPackRef[]>> {
  const read = await readJsonFile(
    join(dir, RECEIVED_WORKS_FILE),
    receivedSchema,
    "history-received-invalid",
    "received-works.json is damaged; open the world again to list what arrived with it.",
  );
  return read.ok ? ok(read.value?.works ?? []) : read;
}

/** Adds `work` to the list of AI worlds that arrived with this history (once). */
export async function addReceivedWork(dir: string, work: WorkPackRef): Promise<Result<void>> {
  const current = await readReceivedWorks(dir);
  if (!current.ok) return current;
  const key = (ref: WorkPackRef) => `${ref.workId}@${ref.version}#${ref.contentHash}`;
  if (current.value.some((ref) => key(ref) === key(work))) return ok(undefined);
  await writeJsonAtomic(join(dir, RECEIVED_WORKS_FILE), { v: 1, works: [...current.value, work] });
  return ok(undefined);
}
