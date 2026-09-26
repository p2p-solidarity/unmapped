// Quitting, whichever way it is asked (Cmd-Q, SIGTERM, DevTools `Browser.close`, the last window
// closing on Windows and Linux). Electron closes the windows first: each page's `beforeunload`
// sends its last checkpoint then. Once they are gone Electron emits `will-quit`, and that is held
// once. The calls the closing pages left running finish, then every registered cleanup runs: the
// history flush writes the day's visit and the outboxes, helpers stop and watchers close. Each wait
// has a bound, so one quit always exits. Then the quit is asked again and goes through.
//
// The re-quit waits for a macrotask (`setImmediate`). A quit that comes from native code (a
// signal, Cmd-Q, DevTools) emits its event from inside Electron's C++ quit code, and microtasks
// run as the listener returns, before that code has read `preventDefault()`. If the cleanups
// settle within microtasks (nothing to flush, as on the title screen), an `app.quit()` in their
// `.then` runs inside it. Electron then marks the quit cancelled, and on macOS the process stays
// alive with no window until a second quit.

import { app } from "electron";
import { callsSettled } from "./handle";

type Cleanup = () => Promise<void> | void;

interface Registered {
  name: string;
  run: Cleanup;
}

/** How long a quit waits for calls the closing pages left running (their last checkpoint). */
export const QUIT_CALLS_MS = 1_500;
/** How long it waits for the cleanups. The history flush takes up to 2 s of it (FLUSH_MS). */
export const QUIT_CLEANUPS_MS = 4_000;

const cleanups: Registered[] = [];
let phase: "running" | "cleaning" | "done" = "running";
let requestedAt: number | null = null;

/** Runs `run` once when the app quits, after its windows have closed. */
export function onQuit(name: string, run: Cleanup): void {
  cleanups.push({ name, run });
}

/**
 * The function that called `ctx.onBeforeQuit`, read from `stack` (taken inside it), for the quit
 * log. The main bundle keeps function names, e.g. `registerWorldIpc`.
 */
export function registrantOf(stack: string | undefined): string {
  const frames = stack?.split("\n") ?? [];
  const own = frames.findIndex((frame) => frame.includes("onBeforeQuit"));
  const caller = own >= 0 ? frames[own + 1] : undefined;
  return caller?.match(/at (?:async )?([\w$.]+) /)?.[1] ?? "cleanup";
}

/** True once a quit has closed the windows and is running its cleanups. */
export function quitting(): boolean {
  return phase !== "running";
}

function since(): string {
  return requestedAt === null ? "" : ` ${Date.now() - requestedAt} ms after the request`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Resolves true when `work` settles (it must not reject), false when `ms` passes first. */
function within(work: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    void work.then(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function cleanUp(): Promise<void> {
  const calls = await within(callsSettled(), QUIT_CALLS_MS);
  console.log(
    `[quit] windows closed${since()}; ${calls ? "page calls finished" : `page calls still running after ${QUIT_CALLS_MS} ms`}`,
  );
  const done: string[] = [];
  const running = new Set(cleanups);
  const all = Promise.all(
    cleanups.map(async (cleanup) => {
      const started = Date.now();
      try {
        await cleanup.run();
        done.push(`${cleanup.name} ${Date.now() - started} ms`);
      } catch (error) {
        done.push(`${cleanup.name} failed`);
        console.warn(`[quit] cleanup ${cleanup.name} failed: ${message(error)}`);
      } finally {
        running.delete(cleanup);
      }
    }),
  );
  if (await within(all, QUIT_CLEANUPS_MS)) {
    console.log(`[quit] ${cleanups.length} cleanups done${since()}: ${done.join(" · ")}`);
  } else {
    const names = [...running].map((cleanup) => cleanup.name).join(", ");
    console.warn(
      `[quit] cleanups still running after ${QUIT_CLEANUPS_MS} ms, quitting without them: ${names}`,
    );
  }
}

export function installQuitSequence(): void {
  app.on("before-quit", () => {
    if (phase !== "running") return;
    requestedAt = Date.now();
    console.log("[quit] requested; closing windows");
  });

  app.on("will-quit", (event) => {
    if (phase === "done") return;
    event.preventDefault();
    if (phase === "cleaning") return;
    phase = "cleaning";
    void cleanUp().then(() => {
      phase = "done";
      setImmediate(() => app.quit());
    });
  });

  app.on("quit", (_event, exitCode) => {
    console.log(`[quit] exit ${exitCode}${since()}`);
  });
}
