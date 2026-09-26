// What every metered call shares (rev 6 phase 4, D2): its headers, the model and its cost record in
// force, the per-account rate cap, and the call to the upstream with its failures mapped. An
// upstream's own 401 is the operator's broken key, never the player's token: it answers 502, so main
// never signs a player out for it.

import {
  GATEWAY_ERRORS,
  PURPOSE_HEADER,
  purposeSchema,
  REQUEST_ID,
  REQUEST_ID_HEADER,
} from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import type { UsagePurpose } from "@shared/usage";
import { type Accounts, type Refusal, refuse } from "./accounts";
import type { GatewayClock } from "./clock";
import type { GatewayLimits } from "./config";
import { type CostRecord, costFor } from "./costs";
import type { Ledger } from "./ledger";
import type { ServedModel } from "./upstreams";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface MeterContext {
  accounts: Accounts;
  ledger: Ledger;
  models: readonly ServedModel[];
  costs: readonly CostRecord[];
  clock: GatewayClock;
  limits: GatewayLimits;
  fetch: Fetch;
  rates: RateCap;
  /** `requestKey(account, id)` of every call running in this process. */
  live: Set<string>;
  log(line: string): void;
}

/** Per account: at most `inFlight` calls at once and `requestsPerMinute` started per minute. */
export class RateCap {
  private readonly running = new Map<string, number>();
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly clock: GatewayClock,
    private readonly limits: GatewayLimits,
  ) {}

  /** Counts a call in, or answers `gateway-busy`. Pair every success with `done`. */
  admit(account: string): Refusal | null {
    const real = this.clock.real();
    const window = this.windows.get(account);
    const current = window === undefined || real - window.start >= 60_000 ? null : window;
    const running = this.running.get(account) ?? 0;
    if (running >= this.limits.inFlight || (current?.count ?? 0) >= this.limits.requestsPerMinute) {
      return refuse(
        429,
        GATEWAY_ERRORS.busy,
        running >= this.limits.inFlight
          ? `This account already has ${running} calls running.`
          : `This account started ${this.limits.requestsPerMinute} calls in the last minute.`,
        "Wait a moment and try again.",
      );
    }
    this.windows.set(
      account,
      current === null ? { start: real, count: 1 } : { ...current, count: current.count + 1 },
    );
    this.running.set(account, running + 1);
    return null;
  }

  done(account: string): void {
    const running = (this.running.get(account) ?? 1) - 1;
    if (running <= 0) this.running.delete(account);
    else this.running.set(account, running);
  }
}

export interface CallHeaders {
  requestId: string;
  purpose: UsagePurpose;
}

/** `X-Request-Id` and `X-Unmapped-Purpose`; no world scope is ever read. */
export function callHeaders(request: Request): Result<CallHeaders> {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? "";
  if (!REQUEST_ID.test(requestId)) {
    return err(
      "gateway-request-id",
      "A metered call needs an X-Request-Id header (8–128 of A–Z a–z 0–9 . _ : -).",
      "Send the chat id; a retry of the same call is refused, a new call needs a new id.",
    );
  }
  const purpose = purposeSchema.safeParse(request.headers.get(PURPOSE_HEADER));
  if (!purpose.success) {
    return err(
      "gateway-purpose",
      "A metered call needs an X-Unmapped-Purpose header (a UsagePurpose).",
    );
  }
  return ok({ requestId, purpose: purpose.data });
}

/** The served model of `kind` and its cost record in force, or a 404. */
export function pickModel(
  ctx: MeterContext,
  id: string,
  kind: "chat" | "image",
): Result<{ model: ServedModel; cost: CostRecord }> | Refusal {
  const model = ctx.models.find((candidate) => candidate.id === id && candidate.kind === kind);
  if (model === undefined) {
    return refuse(
      404,
      GATEWAY_ERRORS.modelUnavailable,
      `This gateway does not serve the ${kind} model "${id}".`,
      "GET /v1/models lists what it serves.",
    );
  }
  const cost = costFor(ctx.costs, model.id, model.upstream.id, ctx.clock.now());
  const fits = cost !== null && (kind === "chat" ? "perMillion" in cost : "perImage" in cost);
  if (cost === null || !fits) {
    return refuse(
      404,
      GATEWAY_ERRORS.modelUnpriced,
      `"${id}" has no ${kind === "chat" ? "per-token" : "per-image"} cost record in force, so it is not served.`,
      "The operator adds a dated record with its source to costs.json.",
    );
  }
  return ok({ model, cost });
}

function upstreamHeaders(model: ServedModel, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["content-type"] = "application/json";
  if (model.upstream.key !== null) headers.authorization = `Bearer ${model.upstream.key.key}`;
  return headers;
}

async function upstreamMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    try {
      const body = JSON.parse(text) as { error?: { message?: unknown } };
      if (typeof body.error?.message === "string") return body.error.message.slice(0, 500);
    } catch {}
    return text.slice(0, 200);
  } catch {
    return "";
  }
}

/** The gateway's answer for an upstream that said no. */
export async function upstreamRefusal(model: ServedModel, response: Response): Promise<Refusal> {
  const message = await upstreamMessage(response);
  const where = `Upstream "${model.upstream.id}" answered ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    return refuse(
      502,
      "gateway-upstream-auth",
      `${where}: the gateway's own key for it was refused.`,
      "The operator fixes the upstream key; your account is fine.",
    );
  }
  if (response.status === 429) {
    return refuse(429, GATEWAY_ERRORS.busy, `${where}: it is busy.`, "Try again shortly.");
  }
  if (response.status === 404) {
    return refuse(
      502,
      "gateway-upstream-model",
      `${where}: it does not serve ${model.upstreamModel}.`,
    );
  }
  if (response.status === 400 || response.status === 422) {
    return refuse(
      400,
      "gateway-upstream-refused",
      `${where}: ${message || "the request was refused"}`,
    );
  }
  return refuse(502, "gateway-upstream", `${where}${message === "" ? "." : `: ${message}`}`);
}

/** POSTs to the upstream; a network failure is a 502, an abort is reported as such. */
export async function postUpstream(
  ctx: MeterContext,
  model: ServedModel,
  path: string,
  body: string | FormData,
  signal: AbortSignal,
): Promise<Result<Response> | Refusal> {
  try {
    const response = await ctx.fetch(`${model.upstream.baseUrl}${path}`, {
      method: "POST",
      headers: upstreamHeaders(model, typeof body === "string"),
      body,
      signal,
    });
    return ok(response);
  } catch (error) {
    if (signal.aborted) return refuse(499, "aborted", "The call was cancelled.");
    return refuse(
      502,
      "gateway-upstream-unreachable",
      `Could not reach upstream "${model.upstream.id}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
