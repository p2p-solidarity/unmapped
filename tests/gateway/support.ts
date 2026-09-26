// Test-only support for the gateway tests (tests/gateway/*.test.ts): a gateway over a throwaway
// data dir with a hand-driven clock and the fake upstream, device keys, and request helpers that go
// through the real HTTP handler. Dates are from 2026-10-10 on. Not a test file itself.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { challengeResponseSchema, signInResponseSchema, signSignIn } from "@shared/account";
import { DAY_MS, sha256Bytes } from "@shared/history/ids";
import { authorKeyFor } from "@shared/history/sign";
import { afterAll, expect } from "vitest";
import { StripeProvider } from "../../src/gateway/billing/stripe";
import type { GatewayClock } from "../../src/gateway/clock";
import { DEFAULT_LIMITS, type GatewayLimits } from "../../src/gateway/config";
import type { CostRecord } from "../../src/gateway/costs";
import { type Gateway, openGateway } from "../../src/gateway/gateway";
import type { EnvLike } from "../../src/gateway/secrets";
import type { UpstreamsFile } from "../../src/gateway/upstreams";
import type { FakeStripe } from "../fixtures/gateway/stripe";
import { FakeUpstream } from "../fixtures/gateway/upstream";

export const T0 = Date.parse("2026-10-10T12:00:00.000Z");
export { DAY_MS };

export class FakeClock implements GatewayClock {
  ms = T0;
  realMs = 1_000_000;
  wallMs = T0;
  now(): number {
    return this.ms;
  }
  real(): number {
    return this.realMs;
  }
  wall(): number {
    return this.wallMs;
  }
  advance(days: number): number {
    this.ms += days * DAY_MS;
    return (this.ms - T0) / DAY_MS;
  }
  tick(realMs: number): void {
    this.realMs += realMs;
  }
}

const made: string[] = [];

export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "unmapped-gateway-"));
  made.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export const secretOf = (name: string) => sha256Bytes(`gateway-test:${name}`);
export const keyOf = authorKeyFor;

export const CHAT = "test-chat";
export const IMAGE = "test-image";

/** One local keyless upstream serving a chat and an image model, both Apache-2.0. */
export function defaultUpstreams(): UpstreamsFile {
  return {
    v: 1,
    upstreams: [
      {
        id: "local",
        kind: "llamacpp",
        baseUrl: "http://127.0.0.1:9/v1",
        keyEnv: null,
        models: [
          {
            id: CHAT,
            kind: "chat",
            licence: "apache-2.0",
            default: true,
            upstreamModel: "qwen-local",
          },
          { id: IMAGE, kind: "image", licence: "apache-2.0", default: true },
        ],
      },
    ],
  };
}

/** Credits: 2 per input token, 1 per cached one, 10 per output token; 10,000 per picture. */
export function defaultCosts(): CostRecord[] {
  const source = "tests/gateway fixture: the operator's own measurement";
  return [
    {
      model: CHAT,
      upstream: "local",
      perMillion: { input: 2, cachedInput: 1, output: 10 },
      source,
      asOf: "2026-01-01",
    },
    { model: IMAGE, upstream: "local", perImage: 0.01, source, asOf: "2026-01-01" },
  ];
}

export function writeSetup(
  dir: string,
  upstreams: UpstreamsFile = defaultUpstreams(),
  costs: CostRecord[] = defaultCosts(),
): void {
  writeFileSync(join(dir, "upstreams.json"), JSON.stringify(upstreams));
  writeFileSync(join(dir, "costs.json"), JSON.stringify({ v: 1, records: costs }));
}

export interface Harness {
  gw: Gateway;
  dir: string;
  clock: FakeClock;
  upstream: FakeUpstream;
  logs: string[];
}

export interface OpenOptions {
  dir?: string;
  env?: EnvLike;
  limits?: Partial<GatewayLimits>;
  clock?: FakeClock;
  upstream?: FakeUpstream;
  stripe?: FakeStripe;
  setup?: boolean;
}

export function openWith(options: OpenOptions = {}) {
  const dir = options.dir ?? tempDir();
  if (options.setup !== false && options.dir === undefined) writeSetup(dir);
  const clock = options.clock ?? new FakeClock();
  const upstream = options.upstream ?? new FakeUpstream();
  const logs: string[] = [];
  const stripe = options.stripe;
  const opened = openGateway({
    data: dir,
    env: options.env ?? {},
    limits: { ...DEFAULT_LIMITS, ...options.limits },
    clock,
    fetch: upstream.fetch,
    ...(stripe === undefined
      ? {}
      : {
          billing: (keys) =>
            new StripeProvider(
              keys.secretKey,
              keys.webhookSecret,
              stripe.fetch,
              "https://api.stripe.test/v1",
            ),
        }),
    log: (line) => logs.push(line),
  });
  return { opened, dir, clock, upstream, logs };
}

export function start(options: OpenOptions = {}): Harness {
  const { opened, ...rest } = openWith(options);
  if (!opened.ok) throw new Error(`${opened.error.code}: ${opened.error.message}`);
  return { gw: opened.value, ...rest };
}

export interface Answer {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: test answers are read field by field
  body: any;
  text: string;
  headers: Headers;
}

export interface CallOptions {
  token?: string;
  json?: unknown;
  body?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  loopback?: boolean;
}

export async function call(
  gw: Gateway,
  method: string,
  path: string,
  options: CallOptions = {},
): Promise<Answer> {
  const headers = new Headers(options.headers);
  if (options.token !== undefined) headers.set("authorization", `Bearer ${options.token}`);
  let body: BodyInit | undefined = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }
  const request = new Request(`http://gateway.test${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  const response = await gw.handle(request, {
    ip: "203.0.113.7",
    loopback: options.loopback ?? false,
  });
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  return { status: response.status, body: parsed, text, headers: response.headers };
}

export async function nonceOf(gw: Gateway): Promise<string> {
  const answer = await call(gw, "POST", "/v1/auth/challenge");
  expect(answer.status).toBe(200);
  // Every answer main will read parses with the schema main reads it with (@shared/account, quota).
  expect(challengeResponseSchema.safeParse(answer.body).success).toBe(true);
  return answer.body.nonce as string;
}

export async function signIn(
  gw: Gateway,
  secret: Uint8Array,
  extra: { create?: boolean } = {},
): Promise<Answer> {
  const nonce = await nonceOf(gw);
  const key = keyOf(secret);
  const sig = signSignIn(secret, nonce, gw.report.gatewayKey);
  return call(gw, "POST", "/v1/auth/token", { json: { key, nonce, sig, ...extra } });
}

export async function account(
  gw: Gateway,
  secret: Uint8Array,
): Promise<{ account: string; token: string; tokenId: string }> {
  const answer = await signIn(gw, secret);
  expect(answer.status).toBe(200);
  expect(signInResponseSchema.safeParse(answer.body).success).toBe(true);
  return answer.body;
}

export interface ChatOptions {
  stream?: boolean;
  maxTokens?: number;
  model?: string;
  purpose?: string;
  signal?: AbortSignal;
  extra?: Record<string, unknown>;
  headers?: Record<string, string>;
}

export function chat(
  gw: Gateway,
  token: string,
  requestId: string,
  options: ChatOptions = {},
): Promise<Answer> {
  return call(gw, "POST", "/v1/chat/completions", {
    token,
    headers: {
      "x-request-id": requestId,
      "x-unmapped-purpose": options.purpose ?? "witness",
      ...options.headers,
    },
    json: {
      model: options.model ?? CHAT,
      messages: [
        { role: "system", content: "You write one line." },
        { role: "user", content: "Say hello." },
      ],
      stream: options.stream ?? true,
      max_tokens: options.maxTokens ?? 100,
      ...options.extra,
    },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Starts a call without awaiting it (for hanging upstreams); resolves once it reached the upstream. */
export async function startHanging(
  h: Harness,
  token: string,
  requestId: string,
  options: ChatOptions = {},
): Promise<{ pending: Promise<Answer> }> {
  const before = h.upstream.calls.length;
  const pending = chat(h.gw, token, requestId, options);
  for (let i = 0; i < 500 && h.upstream.calls.length === before; i += 1) await sleep(1);
  expect(h.upstream.calls.length).toBe(before + 1);
  return { pending };
}

// biome-ignore lint/suspicious/noExplicitAny: ledger lines are read field by field
export function linesOf(dir: string, file: "ledger.jsonl" | "accounts.jsonl"): any[] {
  try {
    return readFileSync(join(dir, file), "utf8")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/** Grants through the admin route, as the CLI does on a running gateway. */
export async function grant(
  gw: Gateway,
  accountId: string,
  credits: number,
  period: string | null = null,
) {
  const answer = await call(gw, "POST", "/v1/admin/grant", {
    loopback: true,
    headers: { "x-unmapped-admin": gw.state.adminSecret },
    json: { account: accountId, credits, period },
  });
  expect(answer.status).toBe(200);
  return answer.body;
}
