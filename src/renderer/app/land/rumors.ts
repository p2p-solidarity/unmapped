// Rumors in the background (rev 6 phase 3, WP7: D13–D15). When a beat of a shared world opens
// rumor slots, a member device with the switch on writes that beat's batch: it claims
// `rumors:<beat>` (D15), writes every open slot in one model call on this device's own model and
// key (D7; usage purpose `rumor`, scoped to the save Play has open), and appends each rumor that
// passed the validator as its own event. The beat chose what is retold and who tells it; the
// model only writes how (narrative/rumor.ts).
//
// | claim answer       | what the batch does                                                  |
// | granted            | writes, relaying the model's text to anyone watching (WP6)           |
// | writing            | follows the writer (`claimToWrite` → `watchWriting`); nothing more   |
// | written            | nothing: the fold brings the rumors                                  |
// | refused            | an error value: a notice, and the failure kept for the HUD           |
// | timeout / offline  | writes here; a rumor that lost a race is a variant, never a refusal  |
//
// At most one batch per beat per session, one at a time, newest beat first. Nothing here makes
// walking wait (invariant 1): it runs in the background like the chapter writer (chapterJobs), it
// waits while a chunk is being witnessed, and it never throws — every failure is a value, told once
// as a notice. Leaving Play aborts the model call and releases the claim.

import { appendToWorld, myKey, seenHead, worldNow, writeBlocker } from "@renderer/history";
import { errorLine, translate } from "@renderer/i18n";
import { generateRumors } from "@renderer/narrative/rumor";
import {
  openWorld,
  useHistoryStore,
  useInferenceStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { openRumorSlots } from "@shared/history/rumor";
import { type AppError, err, fail, ok, type Result, toError } from "@shared/result";
import { claimTarget } from "@shared/worldProtocol";
import { useEffect, useSyncExternalStore } from "react";
import { abandonClaim, claimToWrite } from "./claims";
import { writtenIn } from "./together";

// ── The switch ────────────────────────────────────────────────────────────────────────────────

/**
 * A per-device preference (the `unwritten.*` prefix every device setting keeps): "on" | "off", or
 * absent for "auto" (the default below).
 */
export const RUMOR_SWITCH_KEY = "unwritten.rumorsInBackground";

/** "auto" follows `rumorSwitchDefault`; "on" / "off" are the player's own choice and always win. */
export type RumorChoice = "auto" | "on" | "off";

/**
 * What "auto" means — decided here and nowhere else (D14): on for a world this device owns, off
 * for a member's, where it would spend this device's key on someone else's world. On the hosted
 * route (phase 4, D2) auto is off as well, so the player's quota is never spent unasked
 * (`onHostedRoute`, checked before each batch).
 */
export function rumorSwitchDefault(role: string | null): boolean {
  return role === "owner";
}

const switchListeners = new Set<() => void>();

export function rumorChoice(): RumorChoice {
  try {
    const stored = localStorage.getItem(RUMOR_SWITCH_KEY);
    return stored === "on" || stored === "off" ? stored : "auto";
  } catch {
    // Storage can be disabled: the default holds, and saving says so.
    return "auto";
  }
}

/** Whether this device writes rumors for a world where it has `role`. */
export function rumorSwitch(role: string | null): boolean {
  const choice = rumorChoice();
  return choice === "auto" ? rumorSwitchDefault(role) : choice === "on";
}

export function setRumorSwitch(choice: RumorChoice): Result<void> {
  try {
    if (choice === "auto") localStorage.removeItem(RUMOR_SWITCH_KEY);
    else localStorage.setItem(RUMOR_SWITCH_KEY, choice);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(
      "rumor-switch-not-saved",
      `This device's rumor setting could not be saved: ${reason}`,
      "Storage may be disabled for this app; the setting did not change.",
    );
  }
  for (const listener of switchListeners) listener();
  return ok(undefined);
}

function onRumorSwitch(listener: () => void): () => void {
  switchListeners.add(listener);
  return () => {
    switchListeners.delete(listener);
  };
}

export function useRumorChoice(): RumorChoice {
  return useSyncExternalStore(onRumorSwitch, rumorChoice, rumorChoice);
}

// ── Whether this device writes a batch now ────────────────────────────────────────────────────

const quiet = (code: string, message: string): AppError => ({ code, message });

/**
 * Why this device writes no rumors right now, or null when it may. Never shown as an error: a
 * switched-off or local world is simply silent. Kept in one place so the conditions stay one list.
 */
export function rumorBlocker(): AppError | null {
  const open = openWorld();
  if (open === null) return quiet("world-not-open", "No shared world is open.");
  if (!rumorSwitch(open.status.role)) {
    return quiet("rumor-switch-off", "Rumors are not written on this device for this world.");
  }
  if (open.status.link === "local") {
    return quiet("rumor-world-local", "Rumors are written only for shared (attached) worlds.");
  }
  if (open.status.role !== "owner" && open.status.role !== "member") {
    return quiet("rumor-not-member", "Only the world's members write its rumors.");
  }
  const blocked = writeBlocker();
  if (blocked !== null) return blocked;
  const { config, probe } = useInferenceStore.getState();
  if (config === null || probe.status !== "ready" || !probe.value.reachable) {
    return quiet("rumor-no-model", "No reachable model on this device.");
  }
  return null;
}

// ── The batch ─────────────────────────────────────────────────────────────────────────────────

export type RumorStage = "claiming" | "writing" | "saving";

export interface RumorJobs {
  /** The batch in flight: its world, its beat and what it is doing. */
  job: { worldId: string; beat: string; stage: RumorStage } | null;
  /** The last batch that failed or had rumors refused, until a later one succeeds (Rule 2). */
  failure: { worldId: string; beat: string; error: AppError } | null;
}

interface Running {
  worldId: string;
  instanceId: string;
  beat: string;
  controller: AbortController;
  /** Play was left: the call was aborted and the beat may be written next time. */
  left: boolean;
}

interface Written {
  written: number;
  refused: AppError[];
}

/** How long the fold settles (entries, status) before a batch is considered. */
const SETTLE_MS = 2_000;
/** A chunk being witnessed goes first; look again after this long. */
const BUSY_RETRY_MS = 10_000;

let mounted = false;
let running: Running | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** `<world>|<beat>` of every batch this session started: at most one per beat. */
const tried = new Set<string>();
let snapshot: RumorJobs = { job: null, failure: null };
const listeners = new Set<() => void>();

function publish(next: Partial<RumorJobs>): void {
  snapshot = { ...snapshot, ...next };
  for (const listener of listeners) listener();
}

export function getRumorJobs(): RumorJobs {
  return snapshot;
}

export function useRumorJobs(): RumorJobs {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getRumorJobs);
}

function stale(entry: Running): boolean {
  const open = openWorld();
  return (
    entry.left ||
    open === null ||
    open.worldId !== entry.worldId ||
    useLandStore.getState().instanceId !== entry.instanceId
  );
}

function stage(entry: Running, next: RumorStage): void {
  if (running !== entry) return;
  publish({ job: { worldId: entry.worldId, beat: entry.beat, stage: next } });
}

/** The persona's language: the world's (Rule 10), else the save's when the genesis left it open. */
function worldLanguage(tag: string): string {
  return tag !== "und" ? tag : (useWorldStore.getState().genesis?.language ?? tag);
}

/** Whether this device's next model call goes through the hosted gateway (phase 4, D2). */
async function onHostedRoute(): Promise<boolean> {
  const route = await window.seed.gateway.route().catch(() => null);
  return route?.ok === true && route.value.next?.route === "hosted";
}

/** Claims, writes and appends one beat's batch; `ok(null)` when it had nothing to do here. */
async function writeBatch(entry: Running): Promise<Result<Written | null>> {
  if (rumorChoice() === "auto" && (await onHostedRoute())) return ok(null);
  const target = claimTarget({ kind: "rumors", beat: entry.beat });
  const claimed = await claimToWrite(target);
  if (stale(entry)) {
    abandonClaim(target, claimed);
    return ok(null);
  }
  if (claimed.kind === "refused") return fail(claimed.error);
  // Someone else wrote it (or is done writing it): the fold brings their rumors.
  if (claimed.kind === "written") return ok(null);
  const now = worldNow();
  const author = myKey();
  if (now === null || author === null) {
    abandonClaim(target, claimed);
    return ok(null);
  }
  // `seen`: the head when the writing began (D2).
  const seen = seenHead();
  stage(entry, "writing");
  const relay = claimed.relay;
  const batch = await generateRumors(
    {
      now,
      beat: entry.beat,
      bible: useSessionStore.getState().activeInstance?.cartridge.bible ?? null,
      author,
      language: worldLanguage(now.genesis.body.language),
    },
    {
      signal: entry.controller.signal,
      ...(relay === null ? {} : { onDelta: (text: string) => relay.delta(text) }),
    },
  );
  // Left, aborted or moved on: nothing is written and nothing failed. Nothing to tell: silence.
  const gone = entry.controller.signal.aborted || stale(entry);
  if (gone || !batch.ok || batch.value === null) {
    abandonClaim(target, claimed);
    return !gone && !batch.ok ? batch : ok(null);
  }
  stage(entry, "saving");
  const result: Written = { written: 0, refused: [] };
  for (const body of batch.value.bodies) {
    const stored = await appendToWorld({ kind: "rumor", body, seen });
    if (stored.ok) result.written += 1;
    else result.refused.push(stored.error);
  }
  if (result.written === 0) {
    abandonClaim(target, claimed);
    return ok(result);
  }
  relay?.end("done");
  // A partial batch holds no lease: whoever writes the other slots need not wait for it to lapse.
  const open = openWorld();
  if (open !== null && open.worldId === entry.worldId && !writtenIn(open.now, target)) {
    void window.seed.world.release(entry.worldId, target);
  }
  return ok(result);
}

function settle(entry: Running, outcome: Result<Written | null>): void {
  const toast = useSessionStore.getState().toast;
  const where = `[rumors] beat ${entry.beat.slice(0, 9)}`;
  if (entry.left) tried.delete(`${entry.worldId}|${entry.beat}`);
  if (!outcome.ok) {
    console.warn(`${where}: ${outcome.error.code} · ${outcome.error.message.slice(0, 200)}`);
    toast("danger", translate("rumors.batchFailed", { reason: errorLine(outcome.error) }));
    publish({
      job: null,
      failure: { worldId: entry.worldId, beat: entry.beat, error: outcome.error },
    });
    return;
  }
  if (outcome.value === null) {
    publish({ job: null });
    return;
  }
  const { written, refused } = outcome.value;
  console.info(`${where}: ${written} written, ${refused.length} refused`);
  if (written > 0) toast("info", translate("rumors.batchReady", { n: written }));
  const first = refused[0];
  if (first !== undefined) {
    toast(
      "danger",
      translate("rumors.batchRefused", { n: refused.length, reason: errorLine(first) }),
    );
  }
  publish({
    job: null,
    failure:
      first === undefined ? null : { worldId: entry.worldId, beat: entry.beat, error: first },
  });
}

/** The newest beat with open slots this session has not tried yet, or null. */
function nextBeat(worldId: string): string | null {
  const now = worldNow();
  if (now === null) return null;
  const beats = [...new Set(openRumorSlots(now).map((open) => open.beat))];
  for (const beat of beats.reverse()) {
    if (!tried.has(`${worldId}|${beat}`)) return beat;
  }
  return null;
}

function witnessing(): boolean {
  return Object.values(useLandStore.getState().chunks).some((chunk) => chunk.status === "writing");
}

function start(): void {
  timer = null;
  if (!mounted || running !== null || rumorBlocker() !== null) return;
  const open = openWorld();
  const instanceId = useLandStore.getState().instanceId;
  if (open === null || instanceId === null) return;
  const beat = nextBeat(open.worldId);
  if (beat === null) return;
  if (witnessing()) {
    schedule(BUSY_RETRY_MS);
    return;
  }
  tried.add(`${open.worldId}|${beat}`);
  const entry: Running = {
    worldId: open.worldId,
    instanceId,
    beat,
    controller: new AbortController(),
    left: false,
  };
  running = entry;
  stage(entry, "claiming");
  void writeBatch(entry)
    .catch((thrown: unknown) => fail(toError(thrown, "rumor-batch-failed")))
    .then((outcome) => {
      if (running === entry) running = null;
      settle(entry, outcome);
      schedule();
    });
}

function schedule(ms = SETTLE_MS): void {
  if (!mounted || timer !== null) return;
  timer = setTimeout(start, ms);
}

/** Mounted by Play: batches follow the world's beats, the model and the switch. */
export function useRumorBatch(): void {
  useEffect(() => {
    mounted = true;
    const stops = [
      useHistoryStore.subscribe((state, previous) => {
        if (state.world !== previous.world) schedule();
      }),
      useInferenceStore.subscribe((state, previous) => {
        if (state.probe !== previous.probe || state.config !== previous.config) schedule();
      }),
      onRumorSwitch(() => schedule()),
    ];
    schedule();
    return () => {
      mounted = false;
      for (const stop of stops) stop();
      if (timer !== null) clearTimeout(timer);
      timer = null;
      // Leaving Play stops the call; the beat is not spent and may be written next time.
      if (running !== null) {
        running.left = true;
        running.controller.abort();
      }
    };
  }, []);
}
