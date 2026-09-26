// Shared IPC plumbing. Rule 5: nothing throws across the bridge — every payload is validated with
// zod and every handler resolves to a `Result`. An unexpected exception becomes `ipc-failed`
// instead of an unhandled rejection in the renderer.

import { err, fail, type Result, toError } from "@shared/result";
import { type IpcMainInvokeEvent, ipcMain } from "electron";
import type { z } from "zod";

/**
 * Calls not answered yet. A quit waits for them (quit.ts), so the checkpoint a closing page sends
 * from its `beforeunload` is written before the process ends.
 */
const unanswered = new Set<Promise<unknown>>();

function track<T>(answer: Promise<T>): Promise<T> {
  unanswered.add(answer);
  const settle = (): void => {
    unanswered.delete(answer);
  };
  void answer.then(settle, settle);
  return answer;
}

/** Resolves once every call that is running now has been answered (or has failed). */
export function callsSettled(): Promise<void> {
  return Promise.allSettled([...unanswered]).then(() => undefined);
}

export function invalidPayload(channel: string, error: z.ZodError): Result<never> {
  const issue = error.issues[0];
  const where = issue !== undefined && issue.path.length > 0 ? issue.path.join(".") : "payload";
  const why = issue?.message ?? "unexpected argument types";
  return err("ipc-invalid", `${channel}: invalid ${where}`, why);
}

/**
 * Registers a handler whose renderer arguments are validated as a tuple and whose return value is
 * a `Result`. `schema` parses the raw `args` array, so arity is checked too. `event` names the page
 * that asked (a request it owns ends with it: inference/pageRequests.ts).
 */
export function handle<S extends z.ZodType<readonly unknown[]>, T>(
  channel: string,
  schema: S,
  run: (input: z.output<S>, event: IpcMainInvokeEvent) => Promise<Result<T>> | Result<T>,
): void {
  const answer = async (event: IpcMainInvokeEvent, args: unknown[]): Promise<Result<T>> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) return invalidPayload(channel, parsed.error);
    try {
      return await run(parsed.data, event);
    } catch (error) {
      return fail(toError(error, "ipc-failed"));
    }
  };
  ipcMain.handle(channel, (event, ...args: unknown[]) => track(answer(event, args)));
}

/**
 * Registers a no-argument handler that returns a bare value (the `SeedApi` contract for
 * `app.info()`, which cannot fail).
 */
export function handleValue<T>(channel: string, run: () => Promise<T> | T): void {
  ipcMain.handle(channel, () => track(Promise.resolve().then(run)));
}
