// A fake OpenAI-compatible upstream for the gateway tests (tests/gateway/*): a `fetch` that answers
// chat and image calls in memory, in whatever way a test asks — with usage, without it, never, with
// an error, or breaking mid-stream. It records every call so a test can prove a refused call never
// reached it. Test-only; never imported by app code.

import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * A real, decodable side × side PNG of one opaque colour (8-bit RGB, filter 0 on every row), so the
 * app's decoder (nativeImage in main) can resize and store what the fixture "draws". Deterministic:
 * the same bytes every call. It is test text, not a picture anyone drew (Rule 2).
 */
export function solidPng(side = 64, rgb: readonly [number, number, number] = [96, 128, 160]) {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, side);
  view.setUint32(4, side);
  header[8] = 8;
  header[9] = 2;
  const row = [0, ...Array.from({ length: side }, () => rgb).flat()];
  const raw = new Uint8Array(Array.from({ length: side }, () => row).flat());
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(raw))),
    pngChunk("IEND", new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const SOLID_PNG_B64 = Buffer.from(solidPng()).toString("base64");

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
          data: Array.from({ length: n }, () => ({ b64_json: SOLID_PNG_B64 })),
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
