// Tagged result + loadable state. Every cross-module boundary (IPC, LLM, chain, peers)
// returns one of these instead of throwing.

export interface AppError {
  code: string;
  message: string;
  /** Actionable fix for the user or the model (e.g. "start llama-server on :8080"). */
  hint?: string;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = (code: string, message: string, hint?: string): Result<never> => ({
  ok: false,
  error: hint === undefined ? { code, message } : { code, message, hint },
});

export const fail = (error: AppError): Result<never> => ({ ok: false, error });

/** UI state for anything data-driven. Rule: render exactly one of these, never a placeholder. */
export type Loadable<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; error: AppError };

export const idle = <T>(): Loadable<T> => ({ status: "idle" });
export const loading = <T>(): Loadable<T> => ({ status: "loading" });
export const ready = <T>(value: T): Loadable<T> => ({ status: "ready", value });
export const errored = <T>(error: AppError): Loadable<T> => ({ status: "error", error });

export function fromResult<T>(result: Result<T>): Loadable<T> {
  return result.ok ? ready(result.value) : errored(result.error);
}

export function toError(e: unknown, code = "unknown"): AppError {
  if (e instanceof Error) return { code, message: e.message };
  return { code, message: String(e) };
}
