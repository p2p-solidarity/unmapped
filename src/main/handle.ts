// Shared IPC plumbing. Rule 5: nothing throws across the bridge — every payload is validated with
// zod and every handler resolves to a `Result`. An unexpected exception becomes `ipc-failed`
// instead of an unhandled rejection in the renderer.

import { err, fail, type Result, toError } from "@shared/result";
import { ipcMain } from "electron";
import type { z } from "zod";

export function invalidPayload(channel: string, error: z.ZodError): Result<never> {
  const issue = error.issues[0];
  const where = issue !== undefined && issue.path.length > 0 ? issue.path.join(".") : "payload";
  const why = issue?.message ?? "unexpected argument types";
  return err("ipc-invalid", `${channel}: invalid ${where}`, why);
}

/**
 * Registers a handler whose renderer arguments are validated as a tuple and whose return value is
 * a `Result`. `schema` parses the raw `args` array, so arity is checked too.
 */
export function handle<S extends z.ZodType<readonly unknown[]>, T>(
  channel: string,
  schema: S,
  run: (input: z.output<S>) => Promise<Result<T>> | Result<T>,
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]): Promise<Result<T>> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) return invalidPayload(channel, parsed.error);
    try {
      return await run(parsed.data);
    } catch (error) {
      return fail(toError(error, "ipc-failed"));
    }
  });
}

/**
 * Registers a no-argument handler that returns a bare value (the `SeedApi` contract for
 * `app.info()`, which cannot fail).
 */
export function handleValue<T>(channel: string, run: () => Promise<T> | T): void {
  ipcMain.handle(channel, async (): Promise<T> => await run());
}
