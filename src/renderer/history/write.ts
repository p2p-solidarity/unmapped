// Writing to the open world (rev 6 phase 3, D2, D11): every event the land writes goes through
// `appendToWorld` as a draft main checks, signs and appends (local-only) or queues and sends
// (attached). `seen` is the sequenced head when the work began — `seenHead()` read before the
// model call, never after it — so a slow write that lands after someone else's becomes a variant,
// never a refusal. The fold brings every appended event back through `world:entries`.

import { openWorld, useHistoryStore } from "@renderer/state";
import type { WorldNow } from "@shared/history/types";
import { type AppError, err, type Result } from "@shared/result";
import type { WorldAppended, WorldDraft } from "@shared/worldApi";
import { syncWorld } from "./session";

const NOT_OPEN: AppError = {
  code: "world-not-open",
  message: "This save's world is not open.",
  hint: "Open the save from the library.",
};

/** Whether this save's land plays on a world's history (else: its legacy files, or no land). */
export function onHistory(): boolean {
  return openWorld() !== null;
}

/**
 * Why this device writes nothing to the open world right now (no key, read-only, still reading),
 * or null when it can. A save without a world at all (idle) is not this function's business.
 */
export function writeBlocker(): AppError | null {
  const { world, blocked } = useHistoryStore.getState();
  if (blocked !== null) return blocked;
  if (world.status === "idle") return null;
  if (world.status === "loading") {
    return { code: "world-loading", message: "Reading this world's history…", hint: "One moment." };
  }
  if (world.status === "error") return world.error;
  const { status } = world.value;
  if (status.writable) return null;
  return (
    status.error ?? {
      code: "world-read-only",
      message: "This device reads this world but does not write it.",
      hint: "Ask the world's owner for an invite.",
    }
  );
}

/** The sequenced head n: a draft's `seen`, taken when its work begins. */
export function seenHead(): number {
  return openWorld()?.sequenced.head.n ?? 0;
}

/** The fold every view reads (outbox on top), or null when no world is open. */
export function worldNow(): WorldNow | null {
  return openWorld()?.now ?? null;
}

/** This device's author key in the open world, or null. */
export function myKey(): string | null {
  return openWorld()?.status.me ?? null;
}

/**
 * Appends `draft` to the open world. Resolves once main has signed and written (or queued) it;
 * the event is then in the fold (if its entry has not arrived yet, the history is re-read).
 */
export async function appendToWorld(draft: WorldDraft): Promise<Result<WorldAppended>> {
  const open = openWorld();
  if (open === null) return err(NOT_OPEN.code, NOT_OPEN.message, NOT_OPEN.hint);
  const blocked = writeBlocker();
  if (blocked !== null) return { ok: false, error: blocked };
  const appended = await window.seed.world.append(open.worldId, draft);
  if (appended.ok && openWorld()?.now.events[appended.value.id] === undefined) await syncWorld();
  return appended;
}

/**
 * Resolves when the fold has sequenced entry `n` (someone else's witness, a chapter), or after
 * `ms`; either way the history is re-read once if it is still behind.
 */
export async function waitForHead(n: number, ms = 5_000): Promise<void> {
  const reached = (): boolean => (openWorld()?.sequenced.head.n ?? 0) >= n;
  if (reached()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    const stop = useHistoryStore.subscribe(() => {
      if (reached()) done();
    });
    function done(): void {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
  if (!reached()) await syncWorld();
}

/** Resolves when `test` holds for the fold, or after `ms` (then the history is re-read once). */
export async function waitForFold(test: (now: WorldNow) => boolean, ms = 10_000): Promise<void> {
  const holds = (): boolean => {
    const now = worldNow();
    return now !== null && test(now);
  };
  if (holds()) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    const stop = useHistoryStore.subscribe(() => {
      if (holds()) done();
    });
    function done(): void {
      clearTimeout(timer);
      stop();
      resolve();
    }
  });
  if (!holds()) await syncWorld();
}
