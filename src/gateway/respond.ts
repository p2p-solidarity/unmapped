// Small HTTP helpers shared by the gateway's routes: JSON answers, error bodies in the shape
// `gatewayErrorSchema` reads (`{ error: { code, message, hint?, resetsAt? } }`), and bounded body
// reads (a declared or actual size over the limit is refused before it is parsed).

import type { AppError } from "@shared/result";
import { err, ok, type Result } from "@shared/result";
import type { z } from "zod";

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export function fail(status: number, error: AppError): Response {
  return json(status, { error });
}

/** A refusal (`Result` error with an optional status) as a response. */
export function refusal(result: { ok: false; error: AppError; status?: number }, fallback = 400) {
  return fail(result.status ?? fallback, result.error);
}

export async function readText(request: Request, maxBytes: number): Promise<Result<string>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    return err("gateway-body-too-large", `The body is over ${maxBytes} bytes.`);
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return err("gateway-body-invalid", "The body could not be read.");
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return err("gateway-body-too-large", `The body is over ${maxBytes} bytes.`);
  }
  return ok(text);
}

/** Reads, parses and validates a JSON body. */
export async function readJson<S extends z.ZodType>(
  request: Request,
  schema: S,
  maxBytes = 64 * 1024,
): Promise<Result<z.output<S>>> {
  const text = await readText(request, maxBytes);
  if (!text.ok) return text;
  let raw: unknown;
  try {
    raw = JSON.parse(text.value);
  } catch {
    return err("gateway-body-invalid", "The body is not JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") ?? "";
    return err(
      "gateway-body-invalid",
      `${where === "" ? "The body" : where}: ${issue?.message ?? "is not valid"}.`,
    );
  }
  return ok(parsed.data);
}

export function status413(result: Result<unknown>): number {
  return !result.ok && result.error.code === "gateway-body-too-large" ? 413 : 400;
}
