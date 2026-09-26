// `POST /v1/chat/completions` (rev 6 phase 4, D2): hold, forward, relay, settle. The order is fixed:
//
//   1. X-Request-Id: a running id answers 409 `request-in-flight`, a spent one 409 `request-settled`,
//      and nothing reaches the upstream.
//   2. The model must be served and priced in force (404 `gateway-model-unavailable` / `-unpriced`).
//   3. The rate cap (429 `gateway-busy`), then the hold: weight(prompt estimate + answer budget),
//      refused with 402 `quota-exhausted` when the allowance cannot cover it.
//   4. The upstream call, streamed with `include_usage`. The stream's end settles on the provider's
//      usage (charged "usage"), or on the hold when it reported none (charged "reserved"). A client
//      that goes away, an upstream error and the stream cap release the hold instead.
//
// The body the upstream gets is rebuilt from a whitelist (`upstreamBody.ts`). No world scope is
// read or written; the settle line's `scope` is always null.

import { type AppError, ok, type Result } from "@shared/result";
import type { Refusal, TokenAuth } from "./accounts";
import { type TokenCost, tokenCredits } from "./costs";
import { type ReleaseReason, type Reservation, requestKey } from "./ledger";
import { callHeaders, type MeterContext, pickModel, postUpstream, upstreamRefusal } from "./meter";
import { fail, readJson, refusal, status413 } from "./respond";
import {
  askedMaxTokens,
  chatRequestSchema,
  estimatePrompt,
  upstreamChatBody,
} from "./upstreamBody";

const CHAT_BODY_MAX = 4 * 1024 * 1024;
const encoder = new TextEncoder();

export interface ReportedUsage {
  input: number;
  output: number;
  cached: number | null;
}

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;

/** OpenAI's `usage` object, or null when it is absent or not numbers. */
export function usageOf(value: unknown): ReportedUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const usage = value as Record<string, unknown>;
  const input = count(usage.prompt_tokens);
  const output = count(usage.completion_tokens);
  if (input === null || output === null) return null;
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  return { input, output, cached: count(details?.cached_tokens) };
}

/** One metered call: it settles or releases exactly once, and then gives its slot back. */
export class MeteredCall {
  private finished = false;
  readonly controller = new AbortController();
  capped = false;
  clientGone = false;
  private readonly startReal: number;
  private readonly timer: ReturnType<typeof setTimeout>;

  constructor(
    private readonly ctx: MeterContext,
    readonly held: Reservation,
  ) {
    this.startReal = ctx.clock.real();
    ctx.live.add(requestKey(held.account, held.requestId));
    this.timer = setTimeout(() => {
      this.capped = true;
      this.controller.abort();
    }, ctx.limits.streamCapMs);
    // A cut call must not keep the process alive on its own.
    (this.timer as { unref?: () => void }).unref?.();
  }

  get done(): boolean {
    return this.finished;
  }

  private end(): boolean {
    if (this.finished) return false;
    this.finished = true;
    clearTimeout(this.timer);
    this.ctx.live.delete(requestKey(this.held.account, this.held.requestId));
    this.ctx.rates.done(this.held.account);
    return true;
  }

  /** `credits` null: the provider reported nothing, so the hold is charged. */
  settle(
    usage: { input: number | null; output: number | null; cached: number | null } | null,
    credits: number | null,
  ): void {
    if (!this.end()) return;
    const ms = this.ctx.clock.real() - this.startReal;
    const settled = this.ctx.ledger.settle(
      this.held,
      usage ?? { input: null, output: null, cached: null },
      credits,
      ms,
    );
    const { account, requestId, model } = this.held;
    if (!settled.ok) {
      this.ctx.log(`settle FAILED ${account} ${requestId}: ${settled.error.message}`);
      return;
    }
    const line = settled.value;
    this.ctx.log(
      `settle ${account} ${requestId} ${model} in ${line.input ?? "-"} out ${line.output ?? "-"} ` +
        `credits ${line.credits}/${this.held.credits} (${line.charged})`,
    );
  }

  release(reason: ReleaseReason): void {
    if (!this.end()) return;
    const released = this.ctx.ledger.release(this.held, reason);
    const { account, requestId } = this.held;
    this.ctx.log(
      released.ok
        ? `release ${account} ${requestId} ${reason}`
        : `release FAILED ${account} ${requestId}: ${released.error.message}`,
    );
  }

  /** Why a failed call ended: the cap, the client leaving, or the upstream. */
  failure(): ReleaseReason {
    return this.capped ? "stream-cap" : this.clientGone ? "abort" : "error";
  }

  capError(): AppError {
    const seconds = Math.round(this.ctx.limits.streamCapMs / 1000);
    return {
      code: "gateway-stream-cap",
      message: `The call ran past the gateway's ${seconds} s cap and was cut.`,
      hint: "Its hold was released; try a shorter request.",
    };
  }
}

/** Admits, holds and starts a call; the caller forwards it. Shared by chat and images. */
export function startCall(
  ctx: MeterContext,
  auth: TokenAuth,
  input: Omit<Reservation, "period" | "atMs" | "account">,
): Result<MeteredCall> | Refusal {
  const busy = ctx.rates.admit(auth.account);
  if (busy !== null) return busy;
  const reserved = ctx.ledger.reserve({ ...input, account: auth.account });
  if (!reserved.ok) {
    ctx.rates.done(auth.account);
    return reserved;
  }
  return ok(new MeteredCall(ctx, reserved.value));
}

export async function chatCompletions(
  ctx: MeterContext,
  request: Request,
  auth: TokenAuth,
): Promise<Response> {
  const headers = callHeaders(request);
  if (!headers.ok) return fail(400, headers.error);
  const { requestId, purpose } = headers.value;
  const duplicate = ctx.ledger.duplicate(auth.account, requestId);
  if (duplicate !== null) return refusal(duplicate);
  const body = await readJson(request, chatRequestSchema, CHAT_BODY_MAX);
  if (!body.ok) return fail(status413(body), body.error);
  const picked = pickModel(ctx, body.value.model, "chat");
  if (!picked.ok) return refusal(picked, 404);
  const { model } = picked.value;
  const cost = picked.value.cost as TokenCost;
  const asked = askedMaxTokens(body.value);
  if (asked !== null && asked > ctx.limits.maxOutputTokens) {
    return fail(400, {
      code: "gateway-max-tokens",
      message: `This gateway answers at most ${ctx.limits.maxOutputTokens} tokens per call.`,
    });
  }
  const maxTokens = asked ?? ctx.limits.maxOutputTokens;
  const hold = tokenCredits(cost, {
    input: estimatePrompt(body.value),
    cached: 0,
    output: maxTokens,
  });
  const started = startCall(ctx, auth, {
    requestId,
    purpose,
    upstream: model.upstream.id,
    model: model.id,
    credits: hold,
  });
  if (!started.ok) return refusal(started, 503);
  const call = started.value;
  const onClientAbort = () => {
    call.clientGone = true;
    call.controller.abort();
  };
  request.signal.addEventListener("abort", onClientAbort, { once: true });
  const stream = body.value.stream === true;
  const upstreamBody = upstreamChatBody(
    model.upstream.kind,
    model.upstreamModel,
    body.value,
    maxTokens,
    stream,
  );
  const sent = await postUpstream(
    ctx,
    model,
    "/chat/completions",
    JSON.stringify(upstreamBody),
    call.controller.signal,
  );
  if (!sent.ok) {
    call.release(call.failure());
    return call.capped ? fail(504, call.capError()) : refusal(sent, 502);
  }
  const response = sent.value;
  if (!response.ok) {
    call.release("error");
    return refusal(await upstreamRefusal(model, response));
  }
  if (!stream) return await whole(call, cost, response);
  if (response.body === null) {
    call.release("error");
    return fail(502, { code: "gateway-upstream", message: "The upstream answered no stream." });
  }
  return relay(call, cost, response.body);
}

async function whole(call: MeteredCall, cost: TokenCost, response: Response): Promise<Response> {
  let text: string;
  let parsed: Record<string, unknown>;
  try {
    text = await response.text();
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    call.release(call.failure());
    return call.capped
      ? fail(504, call.capError())
      : fail(502, { code: "gateway-upstream", message: "The upstream's answer was not JSON." });
  }
  const usage = usageOf(parsed.usage);
  call.settle(
    usage,
    usage === null ? null : tokenCredits(cost, { ...usage, cached: usage.cached ?? 0 }),
  );
  return new Response(text, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** Relays the upstream's SSE events one by one, reading `usage` on the way; settles at its end. */
function relay(call: MeteredCall, cost: TokenCost, upstream: ReadableStream<Uint8Array>): Response {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const seen: { buffer: string; usage: ReportedUsage | null; failed: boolean } = {
    buffer: "",
    usage: null,
    failed: false,
  };

  /** Relays one line if it is a data event; true when something was sent. */
  const lineOut = (line: string, out: ReadableStreamDefaultController<Uint8Array>): boolean => {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return false;
    const payload = trimmed.slice(5).trim();
    if (payload === "" || payload === "[DONE]") return false;
    try {
      const chunk = JSON.parse(payload) as Record<string, unknown>;
      if (chunk.error !== undefined) seen.failed = true;
      seen.usage = usageOf(chunk.usage) ?? seen.usage;
    } catch {
      return false;
    }
    out.enqueue(encoder.encode(`data: ${payload}\n\n`));
    return true;
  };

  const body = new ReadableStream<Uint8Array>({
    // Reads until something can be sent: a pull that enqueues nothing is not called again.
    async pull(out) {
      for (;;) {
        let read: Awaited<ReturnType<typeof reader.read>>;
        try {
          read = await reader.read();
        } catch {
          call.release(call.failure());
          if (!call.clientGone) {
            const error = call.capped
              ? call.capError()
              : { code: "gateway-upstream", message: "The upstream stream broke." };
            out.enqueue(encoder.encode(`data: ${JSON.stringify({ error })}\n\n`));
            out.close();
          }
          return;
        }
        if (read.done) {
          if (seen.buffer !== "") lineOut(seen.buffer, out);
          seen.buffer = "";
          const usage = seen.usage;
          if (seen.failed && usage === null) call.release("error");
          else {
            const credits =
              usage === null ? null : tokenCredits(cost, { ...usage, cached: usage.cached ?? 0 });
            call.settle(usage, credits);
          }
          out.enqueue(encoder.encode("data: [DONE]\n\n"));
          out.close();
          return;
        }
        seen.buffer += decoder.decode(read.value, { stream: true });
        const lines = seen.buffer.split("\n");
        seen.buffer = lines.pop() ?? "";
        let sent = false;
        for (const line of lines) sent = lineOut(line, out) || sent;
        if (sent) return;
      }
    },
    cancel() {
      call.clientGone = true;
      call.controller.abort();
      call.release("abort");
      reader.cancel().catch(() => {});
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}
