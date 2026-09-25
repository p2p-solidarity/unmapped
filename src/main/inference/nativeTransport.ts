// Persistent NDJSON transport for the bundled Swift Foundation Models helper. It deliberately
// knows nothing about SceneAST: this module only guarantees request/event ordering and turns a
// helper crash into a terminal typed event for every affected caller.

import { type AppError, fail, ok, type Result } from "@shared/result";

export const NATIVE_PROTOCOL_VERSION = 1 as const;

export type NativeMethod =
  | "capabilities"
  | "planWorld"
  | "generateEvents"
  | "generateLayout"
  | "cancel";

export interface NativeRequest {
  v: typeof NATIVE_PROTOCOL_VERSION;
  requestId: string;
  method: NativeMethod;
  payload: unknown;
}

export type NativeEvent =
  | { v: typeof NATIVE_PROTOCOL_VERSION; requestId: string; seq: number; type: "accepted" }
  | {
      v: typeof NATIVE_PROTOCOL_VERSION;
      requestId: string;
      seq: number;
      type: "partial" | "result";
      payload: unknown;
    }
  | {
      v: typeof NATIVE_PROTOCOL_VERSION;
      requestId: string;
      seq: number;
      type: "progress";
      phase: string;
    }
  | {
      v: typeof NATIVE_PROTOCOL_VERSION;
      requestId: string;
      seq: number;
      type: "error";
      error: AppError;
    }
  | { v: typeof NATIVE_PROTOCOL_VERSION; requestId: string; seq: number; type: "cancelled" };

interface NativeWritable {
  write(chunk: string): boolean;
}

interface NativeReadable {
  on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
}

export interface NativeBridgeProcess {
  stdin: NativeWritable | null;
  stdout: NativeReadable | null;
  stderr: NativeReadable | null;
  exitCode: number | null;
  on(event: "exit", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export interface NativeTransport {
  request(request: NativeRequest, onEvent: (event: NativeEvent) => void): Promise<Result<void>>;
  cancel(requestId: string): Promise<Result<void>>;
  close(): Promise<Result<void>>;
}

export type SpawnNative = () => NativeBridgeProcess;

function helperExited(code: number | null): AppError {
  return {
    code: "native-helper-exited",
    message: `The macOS generation helper exited (${code === null ? "signal" : code}).`,
    hint: "retry generation; if it repeats, check the Foundation Models availability in System settings",
  };
}

function invalidRequest(request: NativeRequest): AppError | null {
  if (request.v !== NATIVE_PROTOCOL_VERSION) {
    return {
      code: "native-protocol-version",
      message: "Unsupported native bridge protocol version.",
    };
  }
  if (request.requestId.trim().length === 0) {
    return { code: "native-request-id", message: "Native bridge requests need a request id." };
  }
  return null;
}

function appError(value: unknown): AppError | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!hasOnlyKeys(record, ["code", "message", "hint", "retryable"])) return null;
  if (typeof record.code !== "string" || typeof record.message !== "string") return null;
  if (record.hint !== undefined && typeof record.hint !== "string") return null;
  if (record.retryable !== undefined && typeof record.retryable !== "boolean") return null;
  return typeof record.hint === "string"
    ? { code: record.code, message: record.message, hint: record.hint }
    : { code: record.code, message: record.message };
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = Object.keys(record);
  return keys.every((key) => allowed.includes(key));
}

function event(value: unknown): NativeEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (
    record.v !== NATIVE_PROTOCOL_VERSION ||
    typeof record.requestId !== "string" ||
    typeof record.seq !== "number" ||
    !Number.isInteger(record.seq) ||
    record.seq < 1 ||
    typeof record.type !== "string"
  )
    return null;
  const base = {
    v: NATIVE_PROTOCOL_VERSION,
    requestId: record.requestId,
    seq: record.seq,
  } as const;
  switch (record.type) {
    case "accepted":
    case "cancelled": {
      if (!hasOnlyKeys(record, ["v", "requestId", "seq", "type"])) return null;
      return { ...base, type: record.type };
    }
    case "partial":
    case "result": {
      if (!hasOnlyKeys(record, ["v", "requestId", "seq", "type", "payload"])) return null;
      return { ...base, type: record.type, payload: record.payload };
    }
    case "progress":
      return hasOnlyKeys(record, ["v", "requestId", "seq", "type", "phase"]) &&
        typeof record.phase === "string"
        ? { ...base, type: "progress", phase: record.phase }
        : null;
    case "error": {
      if (!hasOnlyKeys(record, ["v", "requestId", "seq", "type", "error"])) return null;
      const parsed = appError(record.error);
      return parsed === null ? null : { ...base, type: "error", error: parsed };
    }
    default:
      return null;
  }
}

function terminal(value: NativeEvent): boolean {
  return value.type === "result" || value.type === "error" || value.type === "cancelled";
}

/**
 * Owns a single helper process lazily. stdout is protocol-only; malformed or oversized output
 * terminates every pending request so callers never wait for a timeout after protocol corruption.
 */
export function createNativeTransport(
  spawnNative: SpawnNative,
  maxLineBytes = 1024 * 1024,
): NativeTransport {
  let helper: NativeBridgeProcess | null = null;
  let remainder = "";
  let cancelSequence = 0;
  const pending = new Map<string, (value: NativeEvent) => void>();
  const lastSequences = new Map<string, number>();
  const accepted = new Set<string>();

  function notify(requestId: string, value: NativeEvent): boolean {
    try {
      pending.get(requestId)?.(value);
      return true;
    } catch {
      // The renderer-side observer is never allowed to bring down Electron's main process.
      return false;
    }
  }

  function finishPending(error: AppError): void {
    for (const requestId of pending.keys()) {
      notify(requestId, {
        v: NATIVE_PROTOCOL_VERSION,
        requestId,
        seq: Number.MAX_SAFE_INTEGER,
        type: "error",
        error,
      });
    }
    pending.clear();
    lastSequences.clear();
    accepted.clear();
  }

  function protocolFailure(code: string, message: string): void {
    const process = helper;
    helper = null;
    remainder = "";
    finishPending({
      code,
      message,
      hint: "Restart the app; report this helper protocol violation if it repeats.",
    });
    if (process !== null && process.exitCode === null) process.kill("SIGTERM");
  }

  function handleChunk(chunk: string | Buffer): void {
    remainder += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (!remainder.includes("\n") && Buffer.byteLength(remainder, "utf8") > maxLineBytes) {
      protocolFailure(
        "native-protocol-line-too-large",
        `The native helper emitted a line larger than ${maxLineBytes} bytes.`,
      );
      return;
    }
    const lines = remainder.split("\n");
    remainder = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim().length === 0) continue;
      if (Buffer.byteLength(line, "utf8") > maxLineBytes) {
        protocolFailure(
          "native-protocol-line-too-large",
          `The native helper emitted a line larger than ${maxLineBytes} bytes.`,
        );
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(line) as unknown;
      } catch {
        protocolFailure("native-protocol-output", "The native helper emitted malformed JSON.");
        return;
      }
      const parsed = event(raw);
      if (parsed === null) {
        protocolFailure(
          "native-protocol-output",
          "The native helper emitted an invalid or non-strict event envelope.",
        );
        return;
      }
      if (!pending.has(parsed.requestId)) continue;
      const previous = lastSequences.get(parsed.requestId);
      const validSequence =
        previous === undefined
          ? parsed.seq === 1 && parsed.type === "accepted"
          : parsed.seq === previous + 1 && parsed.type !== "accepted";
      if (!validSequence) {
        protocolFailure(
          "native-protocol-output",
          `The native helper violated event ordering for ${parsed.requestId}.`,
        );
        return;
      }
      if (parsed.type === "accepted") accepted.add(parsed.requestId);
      if (!accepted.has(parsed.requestId)) {
        protocolFailure(
          "native-protocol-output",
          `The native helper terminated ${parsed.requestId} before accepting it.`,
        );
        return;
      }
      lastSequences.set(parsed.requestId, parsed.seq);
      const delivered = notify(parsed.requestId, parsed);
      if (!delivered) {
        pending.delete(parsed.requestId);
        lastSequences.delete(parsed.requestId);
        accepted.delete(parsed.requestId);
        continue;
      }
      if (terminal(parsed)) {
        pending.delete(parsed.requestId);
        lastSequences.delete(parsed.requestId);
        accepted.delete(parsed.requestId);
      }
    }
  }

  function ensureHelper(): Result<NativeBridgeProcess> {
    if (helper !== null && helper.exitCode === null) return ok(helper);
    try {
      const next = spawnNative();
      if (next.stdin === null || next.stdout === null) {
        return fail({
          code: "native-helper-pipes",
          message: "The macOS generation helper did not expose stdin/stdout.",
        });
      }
      next.stdout.on("data", handleChunk);
      next.on("error", (error) => {
        if (helper !== next) return;
        helper = null;
        remainder = "";
        finishPending({
          code: "native-helper-start",
          message: error.message,
          hint: "check that the signed afm-bridge helper was bundled with the app",
        });
      });
      next.on("exit", (code) => {
        if (helper !== next) return;
        helper = null;
        remainder = "";
        finishPending(helperExited(code));
      });
      helper = next;
      return ok(next);
    } catch (cause) {
      return fail({
        code: "native-helper-start",
        message: cause instanceof Error ? cause.message : String(cause),
        hint: "check that the signed afm-bridge helper was bundled with the app",
      });
    }
  }

  function write(process: NativeBridgeProcess, request: NativeRequest): Result<void> {
    if (process.stdin === null)
      return fail({ code: "native-helper-pipes", message: "Native helper stdin is closed." });
    try {
      process.stdin.write(`${JSON.stringify(request)}\n`);
      return ok(undefined);
    } catch (cause) {
      return fail({
        code: "native-helper-write",
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  return {
    async request(request, onEvent) {
      const invalid = invalidRequest(request);
      if (invalid !== null) return fail(invalid);
      if (pending.has(request.requestId)) {
        return fail({
          code: "native-duplicate-request",
          message: `A native request with id ${request.requestId} is already streaming.`,
        });
      }
      const process = ensureHelper();
      if (!process.ok) return process;
      pending.set(request.requestId, onEvent);
      lastSequences.delete(request.requestId);
      accepted.delete(request.requestId);
      const sent = write(process.value, request);
      if (!sent.ok) pending.delete(request.requestId);
      return sent;
    },
    async cancel(requestId) {
      const process = helper;
      if (process === null || !pending.has(requestId)) return ok(undefined);
      // The Swift bridge gives cancel its own request id, then emits `cancelled` for the target.
      // Reusing the target id would violate its one-terminal-event invariant.
      cancelSequence += 1;
      const sent = write(process, {
        v: NATIVE_PROTOCOL_VERSION,
        requestId: `cancel-${cancelSequence}-${requestId}`,
        method: "cancel",
        payload: { targetRequestId: requestId },
      });
      if (!sent.ok) {
        notify(requestId, {
          v: NATIVE_PROTOCOL_VERSION,
          requestId,
          seq: Number.MAX_SAFE_INTEGER,
          type: "error",
          error: sent.error,
        });
        pending.delete(requestId);
        lastSequences.delete(requestId);
        accepted.delete(requestId);
      }
      return sent;
    },
    async close() {
      const process = helper;
      helper = null;
      if (process !== null && process.exitCode === null && !process.kill("SIGTERM")) {
        finishPending({
          code: "native-helper-stop",
          message: "The macOS generation helper did not accept its stop signal.",
        });
        return fail({
          code: "native-helper-stop",
          message: "The macOS generation helper did not accept its stop signal.",
        });
      }
      finishPending({
        code: "native-helper-closed",
        message: "The macOS generation helper was stopped.",
      });
      return ok(undefined);
    },
  };
}
