// Serves the gateway tests' fake upstream (./upstream.ts) over HTTP, so an E2E run can put a real
// gateway (`bun run gateway`) in front of it and spend nothing:
//
//   bun tests/fixtures/gateway/serveUpstream.ts --port 8791 [--mode usage]
//
// Point the gateway's upstreams.json at http://127.0.0.1:8791/v1 (kind "llamacpp", keyEnv null).
// `POST /__fixture/mode?to=<mode>` switches the answer mid-run (usage | no-usage | hang-headers |
// hang-stream | break | error-event | status). A test fixture only: its answers are fixed test text
// ("Hello."), never anything the app ships (Rule 2).

import { FakeUpstream, type UpstreamMode } from "./upstream";

const MODES: readonly UpstreamMode[] = [
  "usage",
  "no-usage",
  "hang-headers",
  "hang-stream",
  "break",
  "error-event",
  "status",
];

interface BunServe {
  serve(options: {
    hostname: string;
    port: number;
    fetch(request: Request): Response | Promise<Response>;
  }): { port: number };
}

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function isMode(value: string | null | undefined): value is UpstreamMode {
  return value !== null && value !== undefined && (MODES as readonly string[]).includes(value);
}

const upstream = new FakeUpstream();
const initial = arg("--mode");
if (isMode(initial)) upstream.mode = initial;

const bun = (globalThis as { Bun?: BunServe }).Bun;
if (bun === undefined) {
  console.error("run this with Bun: bun tests/fixtures/gateway/serveUpstream.ts --port 8791");
  process.exit(1);
}

const server = bun.serve({
  hostname: "127.0.0.1",
  port: Number(arg("--port") ?? 8791),
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/__fixture/mode") {
      const to = url.searchParams.get("to");
      if (!isMode(to)) return new Response(`unknown mode ${to}`, { status: 400 });
      upstream.mode = to;
      return Response.json({ mode: to });
    }
    if (request.method === "GET" && url.pathname.endsWith("/models")) {
      return Response.json({ object: "list", data: [{ id: "fixture", object: "model" }] });
    }
    const multipart = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
    const body = multipart ? await request.formData() : await request.text();
    return upstream.fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body,
      signal: request.signal,
    });
  },
});

console.log(`fixture upstream on http://127.0.0.1:${server.port}/v1 (mode ${upstream.mode})`);
