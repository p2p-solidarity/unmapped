// A fake OpenAI-compatible upstream for the gateway tests (tests/gateway/*): a `fetch` that answers
// chat and image calls in memory, in whatever way a test asks — with usage, without it, never, with
// an error, or breaking mid-stream. It records every call so a test can prove a refused call never
// reached it. Test-only; never imported by app code.

export type UpstreamMode =
  | "usage"
  | "no-usage"
  | "hang-headers"
  | "hang-stream"
  | "break"
  | "error-event"
  | "status";

export interface UpstreamCall {
  url: string;
  auth: string | null;
  body: Record<string, unknown> | null;
  form: FormData | null;
}

const encoder = new TextEncoder();

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

export class FakeUpstream {
  mode: UpstreamMode = "usage";
  /** For mode "status". */
  status = 500;
  usage: Record<string, unknown> = {
    prompt_tokens: 20,
    completion_tokens: 30,
    prompt_tokens_details: { cached_tokens: 5 },
  };
  readonly calls: UpstreamCall[] = [];

  readonly fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const body = init?.body;
    this.calls.push({
      url,
      auth: headers.get("authorization"),
      body: typeof body === "string" ? (JSON.parse(body) as Record<string, unknown>) : null,
      form: body instanceof FormData ? body : null,
    });
    const signal = init?.signal ?? undefined;
    if (this.mode === "hang-headers") {
      return new Promise<Response>((_, reject) => {
        signal?.addEventListener("abort", () => reject(abortError()), { once: true });
      });
    }
    if (this.mode === "status") {
      return new Response(JSON.stringify({ error: { message: "upstream says no" } }), {
        status: this.status,
      });
    }
    if (url.endsWith("/images/generations") || url.endsWith("/images/edits")) {
      const n =
        typeof body === "string"
          ? Number(JSON.parse(body).n ?? 1)
          : Number((body as FormData).get("n") ?? 1);
      return new Response(
        JSON.stringify({
          created: 1,
          data: Array.from({ length: n }, () => ({ b64_json: "iVBORw0KGgo=" })),
          usage: { input_tokens: 50, output_tokens: 4_000 },
        }),
        { status: 200 },
      );
    }
    const streamed = typeof body === "string" && JSON.parse(body).stream === true;
    if (!streamed) {
      return new Response(
        JSON.stringify({
          id: "c1",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "Hello." } }],
          ...(this.mode === "no-usage" ? {} : { usage: this.usage }),
        }),
        { status: 200 },
      );
    }
    return new Response(this.stream(signal), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  private stream(signal: AbortSignal | undefined): ReadableStream<Uint8Array> {
    const mode = this.mode;
    const usage = this.usage;
    const events = [
      { choices: [{ index: 0, delta: { role: "assistant", content: "Hel" } }] },
      { choices: [{ index: 0, delta: { content: "lo." }, finish_reason: "stop" }] },
    ];
    return new ReadableStream<Uint8Array>({
      start(controller) {
        signal?.addEventListener("abort", () => controller.error(abortError()), { once: true });
        if (mode === "hang-stream") return;
        // Split one event across two reads, as a real network does.
        const first = `data: ${JSON.stringify(events[0])}\n\n`;
        controller.enqueue(encoder.encode(first.slice(0, 17)));
        controller.enqueue(encoder.encode(first.slice(17)));
        if (mode === "break") {
          controller.error(new Error("connection reset"));
          return;
        }
        if (mode === "error-event") {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: { message: "overloaded" } })}\n\n`),
          );
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(events[1])}\n\n`));
        if (mode === "usage") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [], usage })}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
  }
}
