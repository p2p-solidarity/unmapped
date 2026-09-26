// The generation gateway over HTTP, from main only (rev 6 phase 4, D1–D3). Every answer is parsed
// with its @shared schema before anything reads it; every failure is the gateway's own
// `{ error: { code, message, hint?, resetsAt? } }`, or `gateway-unreachable` / `gateway-answer-invalid`
// with a hint. The account token rides only in the Authorization header to the configured gateway
// (`endpointFor("hosted")`), and nothing here logs it or hands it to a renderer (Rule 6).

import {
  type GatewayModel,
  gatewayErrorSchema,
  gatewayModelListSchema,
  gatewayStatusSchema,
} from "@shared/quota";
import { type AppError, err, fail, ok, type Result } from "@shared/result";
import type { z } from "zod";

const TIMEOUT_MS = 10_000;

export interface GatewayCall {
  method: "GET" | "POST";
  /** Below the `/v1` base, e.g. "/auth/challenge". */
  path: string;
  token?: string | null;
  body?: unknown;
}

/** A failed call, with the HTTP status when the gateway answered (null: it never did). */
export interface GatewayFailure {
  ok: false;
  error: AppError & { resetsAt?: string };
  status: number | null;
}

export type GatewayResult<T> = { ok: true; value: T } | GatewayFailure;

function unreachable(base: string, cause: unknown): GatewayFailure {
  const why = cause instanceof Error ? cause.message : String(cause);
  return {
    ok: false,
    status: null,
    error: {
      code: "gateway-unreachable",
      message: `Could not reach the generation gateway at ${base} (${why}).`,
      hint: "Check UNMAPPED_GATEWAY_URL in .env and that the gateway is running, then try again.",
    },
  };
}

function invalid(base: string, path: string, status: number): GatewayFailure {
  return {
    ok: false,
    status,
    error: {
      code: "gateway-answer-invalid",
      message: `The gateway at ${base} answered ${path} with something this app does not read (HTTP ${status}).`,
      hint: "The gateway may be a different version than this app; ask its operator.",
    },
  };
}

/** Calls the gateway and parses a successful answer with `schema`. */
export async function gatewayJson<S extends z.ZodType>(
  base: string,
  call: GatewayCall,
  schema: S,
): Promise<GatewayResult<z.output<S>>> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (call.body !== undefined) headers["content-type"] = "application/json";
  if (call.token !== undefined && call.token !== null) {
    headers.authorization = `Bearer ${call.token}`;
  }
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${base}${call.path}`, {
      method: call.method,
      headers,
      body: call.body === undefined ? undefined : JSON.stringify(call.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    text = await response.text();
  } catch (cause) {
    return unreachable(base, cause);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return invalid(base, call.path, response.status);
  }
  if (!response.ok) {
    const refusal = gatewayErrorSchema.safeParse(raw);
    if (!refusal.success) return invalid(base, call.path, response.status);
    const { code, message, hint, resetsAt } = refusal.data.error;
    const error: AppError & { resetsAt?: string } = { code, message };
    if (hint !== undefined) error.hint = hint;
    if (resetsAt !== undefined) error.resetsAt = resetsAt;
    return { ok: false, status: response.status, error };
  }
  const parsed = schema.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : invalid(base, call.path, response.status);
}

/** A `GatewayResult` as the plain `Result` IPC answers carry. */
export function plain<T>(result: GatewayResult<T>): Result<T> {
  return result.ok ? result : fail(result.error);
}

const MODELS_TTL_MS = 60_000;
let modelsCache: { base: string; at: number; models: GatewayModel[] } | null = null;

/** `GET /v1/models` (public), kept for a minute: the route reads it before every hosted call. */
export async function gatewayModels(base: string): Promise<Result<GatewayModel[]>> {
  const now = Date.now();
  if (modelsCache !== null && modelsCache.base === base && now - modelsCache.at < MODELS_TTL_MS) {
    return ok(modelsCache.models);
  }
  const listed = await gatewayJson(
    base,
    { method: "GET", path: "/models" },
    gatewayModelListSchema,
  );
  if (!listed.ok) return fail(listed.error);
  modelsCache = { base, at: now, models: listed.value.data };
  return ok(listed.value.data);
}

let statusCache: { base: string; at: number; commercial: boolean } | null = null;

/**
 * Whether the gateway sells (`GET /v1/status`, public), kept for a minute; null when it cannot be
 * read, so commercial mode then follows the build switch alone (src/main/images/commercial.ts).
 */
export async function gatewayCommercial(base: string): Promise<boolean | null> {
  const now = Date.now();
  if (statusCache !== null && statusCache.base === base && now - statusCache.at < MODELS_TTL_MS) {
    return statusCache.commercial;
  }
  const read = await gatewayJson(base, { method: "GET", path: "/status" }, gatewayStatusSchema);
  if (!read.ok) return null;
  statusCache = { base, at: now, commercial: read.value.commercial };
  return read.value.commercial;
}

/** The error for a call that needs the account but has no token to send. */
export function needsSignIn(): Result<never> {
  return err(
    "account-signed-out",
    "This device is not signed in to the generation gateway.",
    "Sign in in Settings → Advanced settings → Account, or add UNMAPPED_GATEWAY_KEY to .env.",
  );
}
