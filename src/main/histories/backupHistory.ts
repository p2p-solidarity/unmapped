// A world's history inside a `.spire-backup` (rev 6 phase 3, D6 "Backups", D7). The backup gains
// `saves/<saveId>/world.json`, `saves/<saveId>/progress.json`, `history/log.jsonl` and
// `history/outbox.jsonl`; `instances/backup*.ts` place and read the texts, this module makes and
// checks them and restores the history:
//
// - No local history of that world: the backup's is installed (staging + rename).
// - One is a chain prefix of the other: the longer one is kept (chain(n) binds all of 1..n, so equal
//   chains at the shorter length mean the same history). The local log is only replaced by a longer
//   backup, atomically; it never loses an entry.
// - Otherwise both are kept: the backup's log goes to `histories/<id>/restored-<ts>.jsonl`, the local
//   one is untouched, and the restore reports `backup-history-diverged`.
//
// An attached history restored without its link.json gets one from its `sequencer` event (URL and
// pinned key), so sync resumes with the right key. A history on physics this build cannot
// reproduce is refused (`physics-newer`), like everything else it pins.

import { join } from "node:path";
import { storedEventSchema } from "@shared/history/event";
import { openGenesis } from "@shared/history/fold";
import { readLogLine, verifyLog } from "@shared/history/log";
import type { LogEntry, StoredEvent } from "@shared/history/types";
import { checkPhysics } from "@shared/physics";
import { type AppError, err, ok, type Result } from "@shared/result";
import { readWorldProgress, type WorldProgress } from "@shared/worldProgress";
import { jsonl, jsonlLines, readTextOrNull, writeTextAtomic } from "./fsx";
import { readLink, readLog, readOutbox, writeLink, writeLog, writeOutbox } from "./logStore";
import { installLog } from "./migrate";
import { worldDir } from "./paths";
import {
  mergeProgress,
  readProgress,
  readWorldPin,
  type WorldPin,
  worldPinSchema,
  writeProgress,
  writeWorldPin,
} from "./pin";
import { indexWorld } from "./worldIndex";

export const HISTORY_BACKUP_FILES = {
  /** Beside save.json in the save slot. */
  pin: "world.json",
  progress: "progress.json",
  /** At the archive root. */
  log: "history/log.jsonl",
  outbox: "history/outbox.jsonl",
} as const;

export interface HistoryBackup {
  pin: WorldPin;
  progress: WorldProgress | null;
  entries: LogEntry[];
  outbox: StoredEvent[];
}

export interface HistoryBackupTexts {
  /** Relative to the save slot (`saves/<saveId>/`). */
  slot: Record<string, string>;
  /** Relative to the archive root. */
  root: Record<string, string>;
}

const HINT = "Export the backup again from the save it came from.";
const invalid = (message: string): Result<never> => err("backup-history-invalid", message, HINT);

/** The history part of a save's backup; empty when the save has no world yet. */
export async function historyBackupTexts(
  histories: string,
  saveDir: string,
): Promise<Result<HistoryBackupTexts>> {
  const pin = await readWorldPin(saveDir);
  if (!pin.ok) return pin;
  if (pin.value === null) return ok({ slot: {}, root: {} });
  const dir = worldDir(histories, pin.value.worldId);
  const entries = await readLog(dir);
  if (!entries.ok) return entries;
  const outbox = await readOutbox(dir);
  if (!outbox.ok) return outbox;
  const progress = await readTextOrNull(join(saveDir, HISTORY_BACKUP_FILES.progress));
  return ok({
    slot: {
      [HISTORY_BACKUP_FILES.pin]: `${JSON.stringify(pin.value, null, 2)}\n`,
      ...(progress === null ? {} : { [HISTORY_BACKUP_FILES.progress]: progress }),
    },
    root: {
      [HISTORY_BACKUP_FILES.log]: jsonl(entries.value),
      ...(outbox.value.length === 0 ? {} : { [HISTORY_BACKUP_FILES.outbox]: jsonl(outbox.value) }),
    },
  });
}

function parseJson(text: string, file: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch {
    return invalid(`${file} is not JSON.`);
  }
}

/** Checks the history part of an unpacked backup; null when the backup has none. */
export function readHistoryBackup(texts: {
  pin?: string;
  progress?: string;
  log?: string;
  outbox?: string;
}): Result<HistoryBackup | null> {
  if (texts.pin === undefined) {
    const stray = texts.progress ?? texts.log ?? texts.outbox;
    return stray === undefined ? ok(null) : invalid("The backup has a history but no world.json.");
  }
  const rawPin = parseJson(texts.pin, "world.json");
  if (!rawPin.ok) return rawPin;
  const pin = worldPinSchema.safeParse(rawPin.value);
  if (!pin.success) return invalid(`world.json: ${pin.error.issues[0]?.message ?? "invalid"}`);
  const world = pin.data.worldId;
  const entries: LogEntry[] = [];
  for (const [index, line] of jsonlLines(texts.log ?? "").entries()) {
    const entry = readLogLine(line);
    if (!entry.ok) return invalid(`history/log.jsonl line ${index + 1}: ${entry.error.message}`);
    entries.push(entry.value);
  }
  const genesis = entries[0] === undefined ? null : openGenesis(entries[0].event);
  if (genesis === null || !genesis.ok || genesis.value.id !== world) {
    return invalid("The backup's history does not start with its world's genesis.");
  }
  const physics = checkPhysics(genesis.value.body.physicsVersion);
  if (!physics.ok) return physics;
  const verified = verifyLog(world, entries);
  if (!verified.ok)
    return invalid(`The backup's history does not verify: ${verified.error.message}`);
  let progress: WorldProgress | null = null;
  if (texts.progress !== undefined) {
    const raw = parseJson(texts.progress, "progress.json");
    if (!raw.ok) return raw;
    const read = readWorldProgress(raw.value);
    if (!read.ok || read.value.worldId !== world)
      return invalid("progress.json is not this world's.");
    progress = read.value;
  }
  const outbox: StoredEvent[] = [];
  for (const line of jsonlLines(texts.outbox ?? "")) {
    const raw = parseJson(line, "history/outbox.jsonl");
    if (!raw.ok) return raw;
    const event = storedEventSchema.safeParse(raw.value);
    if (!event.success)
      return invalid("history/outbox.jsonl holds something that is not an event.");
    outbox.push(event.data);
  }
  return ok({ pin: pin.data, progress, entries, outbox });
}

export type RestoreOutcome = "installed" | "same" | "kept" | "extended" | "diverged";

export interface RestoredHistory {
  outcome: RestoreOutcome;
  /** `backup-history-diverged` when both copies were kept. */
  notice: AppError | null;
}

/** link.json from the history's own latest `sequencer`, when an attached history has none. */
async function ensureLink(dir: string, entries: readonly LogEntry[], at: string): Promise<void> {
  const link = await readLink(dir);
  if (!link.ok || link.value !== null || entries[0] === undefined) return;
  const verified = verifyLog(entries[0].event.id, entries);
  const step = verified.ok ? verified.value.schedule.at(-1) : undefined;
  const body = step === undefined ? null : (entries[step.n - 1]?.event.body as { url?: unknown });
  if (step === undefined || typeof body?.url !== "string") return;
  await writeLink(dir, { v: 1, url: body.url, key: step.key, attachedAt: at, diverged: null });
}

/** Writes the backup's history beside (never over) what this device holds; see the header. */
export async function restoreHistory(
  histories: string,
  backup: HistoryBackup,
  now: Date,
): Promise<Result<RestoredHistory>> {
  const world = backup.pin.worldId;
  const dir = worldDir(histories, world);
  const at = now.toISOString();
  let outcome: RestoreOutcome | null = null;
  let local = await readLog(dir);
  if (!local.ok && local.error.code === "history-missing") {
    const installed = await installLog(histories, world, "restore", backup.entries);
    if (!installed.ok) return installed;
    local = await readLog(dir);
    outcome = "installed";
  }
  if (!local.ok) return local;
  const mine = local.value;
  const theirs = backup.entries;
  const shorter = Math.min(mine.length, theirs.length);
  const samePrefix = shorter === 0 || mine[shorter - 1]?.chain === theirs[shorter - 1]?.chain;
  outcome ??= !samePrefix
    ? "diverged"
    : theirs.length > mine.length
      ? "extended"
      : theirs.length === mine.length
        ? "same"
        : "kept";
  const kept = `restored-${at.replace(/[:.]/g, "-")}.jsonl`;
  if (outcome === "diverged") {
    await writeTextAtomic(join(dir, kept), jsonl(theirs));
  } else if (outcome === "extended") {
    await writeLog(dir, theirs);
  }
  const final = outcome === "extended" ? theirs : mine;
  if (outcome !== "diverged") {
    const logged = new Set(final.map((entry) => entry.event.id));
    const queued = await readOutbox(dir);
    if (!queued.ok) return queued;
    const merged = [...queued.value];
    for (const event of backup.outbox) {
      if (!logged.has(event.id) && !merged.some((one) => one.id === event.id)) merged.push(event);
    }
    const waiting = merged.filter((event) => !logged.has(event.id));
    if (waiting.length !== queued.value.length) await writeOutbox(dir, waiting);
  }
  await ensureLink(dir, final, at);
  const genesis = openGenesis(final[0]?.event);
  if (genesis.ok) {
    const from = { instanceId: genesis.value.body.from.instanceId, owner: genesis.value.author };
    await indexWorld(histories, world, from);
  }
  const notice: AppError | null =
    outcome === "diverged"
      ? {
          code: "backup-history-diverged",
          message: "This device already holds another history of this world; both are kept.",
          hint: `The backup's copy is kept aside, unmerged, as ${kept} in histories/${world}/.`,
        }
      : null;
  return ok({ outcome, notice });
}

/** world.json and progress.json (merged, never regressed) into the restored save's directory. */
export async function restoreSaveWorld(
  saveDir: string,
  backup: HistoryBackup,
): Promise<Result<void>> {
  const world = backup.pin.worldId;
  const current = await readProgress(saveDir, world);
  if (!current.ok) return current;
  const merged =
    backup.progress === null ? current.value : mergeProgress(current.value, backup.progress);
  await writeProgress(saveDir, merged);
  await writeWorldPin(saveDir, backup.pin);
  return ok(undefined);
}
