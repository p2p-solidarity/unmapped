// The IO around `planMigration` (rev 6 phase 3, D6): lazy, idempotent, never destructive, never
// lossy. The plan is pure (src/dsl, injected through ./dslSeam); this module signs it, keeps what a
// fold admits, and commits it:
//
//   1. histories/.staging-<instanceId>-<pid>/log.jsonl   (the whole new log)
//   2. rename → histories/<worldId>/                      (never over an existing history)
//   3. histories/index.json                                (worldId → from.instanceId)
//   4. saves/<saveId>/progress.json                        (merged, never regressed)
//   5. saves/<saveId>/world.json                           (the commit point: pin + source digest)
//
// Signing is deterministic (Ed25519, RFC 8032) and every migrated event has `seen: 0` and a fixed
// `at`, so the same save on the same device always plans the same ids. Receipt times come from the
// save too, never from the clock, so a rerun (or a fresh copy) writes a byte-identical log: the
// genesis is received at the save's `createdAt`, everything else at the save's last checkpoint
// (`updatedAt`) — the last moment the legacy land is known to have been walked. (Its events' own
// `at` would date a place to when it was first witnessed, and a save made months ago would fog on
// its first beat although its player walked it yesterday; care counts from rt.) A crash anywhere
// before step 5 leaves world.json absent, and the next ensure finds the history by its
// deterministic id (or through the index) and finishes the commit.
//
// Catch-up (a source digest that no longer matches) re-plans from the current files and adds only
// the events whose ids are not in the log yet, with today's receipt time: they are new history.

import { rename, rm, stat } from "node:fs/promises";
import { readEvent } from "@shared/history/event";
import { emptyNow } from "@shared/history/fold";
import { logStart } from "@shared/history/log";
import type { GenesisEvent, HistoryEvent, LogEntry } from "@shared/history/types";
import { err, fail, ok, type Result, toError } from "@shared/result";
import type { Adjusted, Skipped } from "@shared/worldApi";
import type { WorldProgress } from "@shared/worldProgress";
import type { DeviceKey } from "../identity/deviceKey";
import { strictIso } from "./clock";
import type { SourceDigest, WorldDsl } from "./dslSeam";
import { sequenceAdmitted, type VerdictOf } from "./loaded";
import { writeLog } from "./logStore";
import { stagingDir, worldDir } from "./paths";
import { mergeProgress, readProgress, type WorldPin, writeProgress, writeWorldPin } from "./pin";
import { type GatheredSource, gatherSource, type SourceDirs } from "./sources";
import { indexWorld } from "./worldIndex";

export interface MigrateDeps {
  histories: string;
  sources: SourceDirs;
  dsl: WorldDsl;
}

export interface PlannedHistory {
  gathered: GatheredSource;
  genesis: GenesisEvent;
  /** Every planned event after the genesis, signed, in plan order. */
  events: HistoryEvent[];
  /** `progress.json` as the plan keyed it (into the plan's own genesis). */
  progress: WorldProgress;
  skipped: Skipped[];
  adjusted: Adjusted[];
  digest: SourceDigest;
}

const EPOCH = "1970-01-01T00:00:00.000Z";

function planInvalid(message: string): Result<never> {
  return err(
    "migration-plan-invalid",
    message,
    "This save still opens from its own files; report it so its world can be made.",
  );
}

/** Reads the save, plans it (WP2, pure) and signs the plan. Writes only blobs (the packs). */
export async function planHistory(
  deps: MigrateDeps,
  key: DeviceKey,
  instanceId: string,
  name: string,
): Promise<Result<PlannedHistory>> {
  const gathered = await gatherSource(deps.sources, instanceId, key.author, name);
  if (!gathered.ok) return gathered;
  let plan: ReturnType<WorldDsl["planMigration"]>;
  try {
    plan = deps.dsl.planMigration(gathered.value.files);
  } catch (error) {
    return fail(toError(error, "migration-plan-failed"));
  }
  if (!plan.ok) return plan;
  const [first, ...rest] = plan.value.events;
  if (
    first?.kind !== "genesis" ||
    first.author !== key.author ||
    first.body.from.instanceId !== instanceId ||
    first.body.from.world !== undefined
  ) {
    return planInvalid("The migration plan does not start with this save's own genesis.");
  }
  const genesis = key.signEvent(first);
  if (genesis.id !== plan.value.worldId) {
    return planInvalid("The migration plan names another world than its genesis.");
  }
  const events: HistoryEvent[] = [];
  for (const unsigned of rest) {
    if (unsigned.world !== genesis.id || unsigned.author !== key.author) {
      return planInvalid("A planned event names another world or author.");
    }
    const read = readEvent(key.signEvent(unsigned));
    if (!read.ok)
      return planInvalid(`A planned ${unsigned.kind} does not read: ${read.error.message}`);
    events.push(read.value);
  }
  return ok({
    gathered: gathered.value,
    genesis,
    events,
    progress: plan.value.progress,
    skipped: plan.value.skipped,
    adjusted: plan.value.adjusted,
    digest: plan.value.source,
  });
}

/** The latest of two strict ISO times (`b` may be absent). */
function later(a: string, b: string | null): string {
  return b !== null && Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * The new world's whole log: genesis (received at the save's `createdAt`), then every planned event
 * a fold admits (received at the save's last checkpoint, `lastPlayed`). Pure and deterministic.
 */
export function freshLog(
  planned: Pick<PlannedHistory, "genesis" | "events">,
  lastPlayed: string,
  verdictOf: VerdictOf,
): { entries: LogEntry[]; skipped: Skipped[] } {
  const { genesis } = planned;
  const born = strictIso(genesis.body.createdAt) ?? EPOCH;
  const played = later(born, strictIso(lastPlayed));
  const admitted = sequenceAdmitted(
    emptyNow(genesis),
    logStart(genesis.id),
    [genesis, ...planned.events],
    (event, previous) => later(event.kind === "genesis" ? born : played, previous),
    verdictOf,
  );
  return { entries: admitted.entries.map((one) => one.entry), skipped: admitted.skipped };
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Steps 1–2: stages the log and renames it into place. `false` when a history with that id is
 * already there (a crash after an earlier rename): it is left as it is and caught up instead.
 */
export async function installLog(
  histories: string,
  worldId: string,
  label: string,
  entries: readonly LogEntry[],
): Promise<Result<boolean>> {
  const destination = worldDir(histories, worldId);
  if (await exists(destination)) return ok(false);
  const staging = stagingDir(histories, label);
  try {
    await writeLog(staging, entries);
    await rename(staging, destination);
    return ok(true);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (await exists(destination)) return ok(false);
    return fail(toError(error, "history-write-failed"));
  }
}

/** Steps 3–5 for a history already in place: index, progress (merged), then the pin. */
export async function pinHistory(
  deps: Pick<MigrateDeps, "histories">,
  input: {
    genesis: GenesisEvent;
    saveDir: string;
    progress: WorldProgress;
    pin: WorldPin;
  },
): Promise<Result<void>> {
  try {
    await indexWorld(deps.histories, input.genesis.id, {
      instanceId: input.genesis.body.from.instanceId,
      owner: input.genesis.author,
    });
    const current = await readProgress(input.saveDir, input.genesis.id);
    if (!current.ok) return current;
    await writeProgress(input.saveDir, mergeProgress(current.value, input.progress));
    await writeWorldPin(input.saveDir, input.pin);
    return ok(undefined);
  } catch (error) {
    return fail(toError(error, "history-write-failed"));
  }
}

/** Planned events after the genesis that the log does not hold yet (deduped by content id). */
export function missingEvents(
  planned: Pick<PlannedHistory, "events">,
  ids: ReadonlySet<string>,
): HistoryEvent[] {
  return planned.events.filter((event) => !ids.has(event.id));
}
