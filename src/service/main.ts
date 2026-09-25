// The UNMAPPED world service (rev 6 phase 3, D10): `bun run service -- --port 8787 --data <dir>`.
// It stores and relays signed history, computes verdicts, runs `admit` and beats, holds claim
// leases and relays presence and streams. It never calls a model, holds no model key, and never
// changes or deletes an entry. It imports only @shared (and @dsl, for verdicts); nothing imports it.
//
// Bun only (Bun.serve + its WebSocket). The Bun API is typed locally below so the service
// typechecks with the repo's node types and no extra dependency.

import { FRAME_MAX_BYTES } from "@shared/worldProtocol";
import { beatPass } from "./beats";
import { ServiceClock } from "./clock";
import { parseArgs, usage } from "./config";
import { handleHttp } from "./http";
import { Hub, type Session } from "./hub";
import { loadServiceKey } from "./keyFile";
import { FileStore } from "./store";

interface SocketData {
  ip: string;
  session: Session | null;
}

interface BunSocket {
  data: SocketData;
  send(text: string): number;
  close(code?: number, reason?: string): void;
}

interface BunServer {
  upgrade(request: Request, options: { data: SocketData }): boolean;
  requestIP(request: Request): { address: string } | null;
  stop(closeActiveConnections?: boolean): void;
  readonly port: number;
}

interface BunRuntime {
  serve(options: {
    hostname: string;
    port: number;
    maxRequestBodySize: number;
    fetch(request: Request, server: BunServer): Response | Promise<Response> | undefined;
    websocket: {
      maxPayloadLength: number;
      idleTimeout: number;
      open(ws: BunSocket): void;
      message(ws: BunSocket, message: string | Uint8Array): void;
      close(ws: BunSocket, code: number, reason: string): void;
    };
  }): BunServer;
}

function exit(message: string, hint?: string): never {
  console.error(`world service: ${message}`);
  if (hint !== undefined) console.error(`  ${hint}`);
  process.exit(1);
}

function main(): void {
  const bun = (globalThis as { Bun?: BunRuntime }).Bun;
  if (bun === undefined) exit("run this with Bun: bun run service -- --data <dir>");
  const parsed = parseArgs(process.argv.slice(2), process.env);
  if (!parsed.ok) exit(parsed.error.message, parsed.error.hint);
  if (parsed.value === "help") {
    console.log(usage());
    return;
  }
  const config = parsed.value;
  const store = new FileStore(config.data);
  const made = store.ensure();
  if (!made.ok) exit(made.error.message, made.error.hint);
  const loaded = loadServiceKey(config.data);
  if (!loaded.ok) exit(loaded.error.message, loaded.error.hint);
  if (loaded.value.warning !== null) console.error(`world service: ${loaded.value.warning}`);
  const key = loaded.value.key;
  const clock = new ServiceClock();
  const hub = new Hub({
    store,
    key,
    limits: config.limits,
    clock,
    beatEveryMs: config.beatEveryMs,
    log: (line) => console.error(`${new Date().toISOString()} ${line}`),
  });
  const report = hub.load();
  for (const { world, error } of report.broken) {
    console.error(`world service: NOT serving ${world}: ${error.code} — ${error.message}`);
  }
  for (const stray of report.strays) console.error(`world service: ignoring worlds/${stray}`);
  const context = { hub, test: config.test, advance: (days: number) => clock.advance(days) };

  const clientIp = (request: Request, server: BunServer): string => {
    if (config.trustProxy) {
      const hops = (request.headers.get("x-forwarded-for") ?? "").split(",");
      const last = hops[hops.length - 1]?.trim();
      if (last !== undefined && last !== "") return last;
    }
    return server.requestIP(request)?.address ?? "unknown";
  };

  const server = bun.serve({
    hostname: config.host,
    port: config.port,
    maxRequestBodySize: config.limits.blobBytes + 64 * 1024,
    fetch(request, server) {
      const url = new URL(request.url);
      const ip = clientIp(request, server);
      if (url.pathname !== "/v1/ws") return handleHttp(context, request);
      const refused = hub.admitSocket(ip);
      if (refused !== null) {
        return new Response(JSON.stringify({ error: refused }), { status: 429 });
      }
      if (server.upgrade(request, { data: { ip, session: null } })) return undefined;
      return new Response(
        JSON.stringify({ error: { code: "ws-upgrade", message: "Use WebSocket." } }),
        {
          status: 400,
        },
      );
    },
    websocket: {
      maxPayloadLength: FRAME_MAX_BYTES,
      idleTimeout: 120,
      open(ws) {
        const session = hub.connect({
          ip: ws.data.ip,
          send: (text) => {
            ws.send(text);
          },
          close: (code, reason) => ws.close(code, reason),
        });
        if ("peer" in session) ws.data.session = session;
        else ws.close(1013, session.code);
      },
      message(ws, message) {
        const session = ws.data.session;
        if (session !== null) hub.message(session, typeof message === "string" ? message : null);
      },
      close(ws) {
        const session = ws.data.session;
        if (session !== null) hub.disconnect(session);
      },
    },
  });

  const sweep = setInterval(() => hub.sweep(), 1_000);
  const beats = setInterval(() => beatPass(hub), Math.min(config.beatEveryMs, 60_000));
  const stop = (signal: string): void => {
    clearInterval(sweep);
    clearInterval(beats);
    hub.shutdown();
    server.stop(true);
    console.log(`world service: stopped (${signal}), snapshots written`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const mode = config.test ? ` TEST MODE (beat every ${config.beatEveryMs} ms)` : "";
  console.log(
    `world service ${key.key}\n  ws://${config.host}:${server.port}/v1/ws  data ${config.data}` +
      `  worlds ${report.loaded.length} (${report.broken.length} not served)` +
      `${loaded.value.created ? "  new key" : ""}${mode}`,
  );
}

main();
