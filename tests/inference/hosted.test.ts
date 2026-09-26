// A chat through the generation gateway (rev 6 phase 4, D2), driven through the real OpenAI SDK
// against a local HTTP server that answers the way the gateway does. Written as the failure list
// first (Rule 0); E2E cannot force these answers from a real gateway on demand.
//
// Failures guarded:
//   1. Request-id reuse: the SDK retries a metered call behind the player's back with the same
//      X-Request-Id, so the gateway answers 409 and the real error (busy, upstream down) is hidden,
//      or a call runs twice.
//   2. The chat id or purpose is missing from the headers (the gateway could not de-duplicate or
//      meter it), a world scope leaks into the request, or a malformed id is sent at all.
//   3. The body is not neutral: reasoning names or the template switch go to the gateway, or the
//      GBNF grammar does not travel in its extension field.
//   4. A mid-stream `data: {"error": …}` event is read as a finished answer, or loses its code.
//   5. A refused token reads as `auth` (which would never sign the device out), or a 402 loses
//      its reset date.

import { createServer, type Server, type ServerResponse } from "node:http";
import { streamChat } from "@main/inference/client";
import type { ChatRequest, InferenceConfig } from "@shared/llm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const TOKEN = `ugk_${"a".repeat(52)}`;
const SCOPE_ID = "i-this-world-must-not-leak";

interface Seen {
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

let server: Server;
let base = "";
let answer: (response: ServerResponse) => void = () => {};
const seen: Seen[] = [];
const envBefore = process.env.UNMAPPED_GATEWAY_URL;

beforeAll(async () => {
  server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
    request.on("end", () => {
      seen.push({ headers: request.headers, body: JSON.parse(text) as Record<string, unknown> });
      answer(response);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
  process.env.UNMAPPED_GATEWAY_URL = base;
});

afterAll(async () => {
  if (envBefore === undefined) delete process.env.UNMAPPED_GATEWAY_URL;
  else process.env.UNMAPPED_GATEWAY_URL = envBefore;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  seen.length = 0;
});

const hosted = (): InferenceConfig => ({
  kind: "hosted",
  baseUrl: `${base}/v1`,
  model: "chat-a",
  apiKeyEnv: "UNMAPPED_GATEWAY_KEY",
  sidecar: null,
});

const request = (id = "3f2a9c1e-7b64-4d2a-9e1f-0a5b6c7d8e9f"): ChatRequest => ({
  id,
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "write" },
  ],
  maxTokens: 900,
  temperature: 0.7,
  grammar: "root ::= scene",
  stop: [],
  tools: [],
  usage: { purpose: "witness", scope: { kind: "instance", id: SCOPE_ID } },
});

function json(status: number, body: unknown) {
  return (response: ServerResponse) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
}

function sse(events: unknown[]) {
  return (response: ServerResponse) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
    response.end("data: [DONE]\n\n");
  };
}

const run = (req = request()) =>
  streamChat(hosted(), req, () => {}, new AbortController().signal, {
    apiKey: TOKEN,
    context: null,
  });

describe("a hosted call's request (2, 3)", () => {
  it("carries the chat id and purpose, no world scope, and a neutral body with the grammar", async () => {
    answer = sse([
      { choices: [{ index: 0, delta: { content: "ok" } }] },
      { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } },
    ]);
    const result = await run();
    expect(result.ok && result.value.text).toBe("ok");
    expect(seen).toHaveLength(1);
    const [call] = seen;
    expect(call?.headers["x-request-id"]).toBe(request().id);
    expect(call?.headers["x-unmapped-purpose"]).toBe("witness");
    expect(call?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(call)).not.toContain(SCOPE_ID);
    expect(call?.body).toMatchObject({
      model: "chat-a",
      grammar: "root ::= scene",
      max_tokens: 900,
    });
    expect(call?.body.reasoning_effort).toBeUndefined();
    expect(call?.body.max_completion_tokens).toBeUndefined();
    expect(call?.body.chat_template_kwargs).toBeUndefined();
  });

  it("sends nothing for a request id the gateway would refuse", async () => {
    answer = json(200, {});
    const result = await run(request("x"));
    expect(!result.ok && result.error.code).toBe("gateway-request-id");
    expect(seen).toHaveLength(0);
  });
});

describe("no silent retry (1)", () => {
  it.each([
    [429, "gateway-busy"],
    [409, "request-settled"],
    [409, "request-in-flight"],
    [502, "gateway-upstream-auth"],
  ])("answers %i %s after exactly one request", async (status, code) => {
    answer = json(status, { error: { code, message: `the gateway says ${code}` } });
    const result = await run();
    expect(seen).toHaveLength(1);
    expect(!result.ok && result.error.code).toBe(code);
  });
});

describe("the gateway's errors (4, 5)", () => {
  it("fails on a mid-stream error event, keeping its code", async () => {
    answer = sse([
      { choices: [{ index: 0, delta: { content: "half an answ" } }] },
      { error: { code: "gateway-stream-cap", message: "The call ran past the gateway's cap." } },
    ]);
    const result = await run();
    expect(!result.ok && result.error.code).toBe("gateway-stream-cap");
  });

  it("fails on an upstream's code-less error event instead of finishing", async () => {
    answer = sse([
      { choices: [{ index: 0, delta: { content: "Hel" } }] },
      { error: { message: "overloaded" } },
    ]);
    const result = await run();
    expect(result.ok).toBe(false);
  });

  it("reads every refused token as signed out, never as a bad provider key", async () => {
    for (const code of [
      "account-token-revoked",
      "account-token-expired",
      "account-token-invalid",
    ]) {
      answer = json(401, { error: { code, message: "no", hint: "Sign in again." } });
      const result = await run();
      expect(!result.ok && result.error.code).toBe("account-signed-out");
    }
  });

  it("keeps the reset date of an exhausted allowance", async () => {
    answer = json(402, {
      error: {
        code: "quota-exhausted",
        message: "This account's allowance for the month is used up.",
        resetsAt: "2026-10-01T00:00:00.000Z",
      },
    });
    const result = await run();
    expect(!result.ok && result.error.code).toBe("quota-exhausted");
    expect(!result.ok && result.error.message).toContain("2026-10-01T00:00:00.000Z");
  });
});
