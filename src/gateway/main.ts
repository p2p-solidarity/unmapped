// The UNMAPPED generation gateway (rev 6 phase 4, D1–D4): `bun run gateway -- --port 8788 --data
// <dir>`. A model endpoint a device may call with an account token: it meters every call against
// the account's allowance and never learns a world. It imports only @shared (nothing imports it) and
// is a separate process from the world service, so anyone can run a world service with no money and
// no provider keys in it.
//
// Bun only for serving (Bun.serve); the Bun API is typed locally below so the gateway typechecks
// with the repo's node types and no extra dependency. Everything else runs in vitest as well.

import { runOperator, runSetKey } from "./cli";
import { type Command, parseArgs, usage } from "./config";
import { openGateway } from "./gateway";
import { isLoopbackHost } from "./secrets";

interface BunServer {
  requestIP(request: Request): { address: string } | null;
  timeout?(request: Request, seconds: number): void;
  stop(closeActiveConnections?: boolean): void;
  readonly port: number;
}

interface BunRuntime {
  serve(options: {
    hostname: string;
    port: number;
    maxRequestBodySize: number;
    idleTimeout: number;
    fetch(request: Request, server: BunServer): Response | Promise<Response>;
  }): BunServer;
}

const METERED = /^\/v1\/(chat\/completions|images\/)/;

function exit(message: string, hint?: string): never {
  console.error(`gateway: ${message}`);
  if (hint !== undefined) console.error(`  ${hint}`);
  process.exit(1);
}

function serve(config: Extract<Command, { command: "serve" }>): void {
  const bun = (globalThis as { Bun?: BunRuntime }).Bun;
  if (bun === undefined) exit("run this with Bun: bun run gateway -- --data <dir>");
  const log = (line: string) => console.error(`${new Date().toISOString()} ${line}`);
  const opened = openGateway({
    data: config.data,
    env: process.env,
    limits: config.limits,
    log,
    listen: { host: config.host, port: config.port },
  });
  if (!opened.ok) exit(opened.error.message, opened.error.hint);
  const gateway = opened.value;
  let server: BunServer;
  try {
    server = bun.serve({
      hostname: config.host,
      port: config.port,
      maxRequestBodySize: 33 * 1024 * 1024,
      idleTimeout: 255,
      fetch(request, server) {
        const socket = server.requestIP(request)?.address ?? "unknown";
        let ip = socket;
        if (config.trustProxy) {
          const hops = (request.headers.get("x-forwarded-for") ?? "").split(",");
          const last = hops[hops.length - 1]?.trim();
          if (last !== undefined && last !== "") ip = last;
        }
        // A metered stream may be quiet for a while before its first token.
        if (METERED.test(new URL(request.url).pathname)) server.timeout?.(request, 0);
        return gateway.handle(request, { ip, loopback: isLoopbackHost(socket) });
      },
    });
  } catch (error) {
    gateway.close();
    exit(`could not listen on ${config.host}:${config.port}: ${String(error)}`);
  }
  const sweep = setInterval(() => {
    const released = gateway.sweep();
    if (released > 0) log(`released ${released} stale hold(s)`);
  }, 30_000);
  const stop = (signal: string): void => {
    clearInterval(sweep);
    server.stop(true);
    gateway.close();
    console.log(`gateway: stopped (${signal})`);
    process.exit(0);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  const { state, report } = gateway;
  const billing = state.billing === null ? "off" : `${state.billing.id} (${state.billing.mode})`;
  console.log(
    `gateway ${report.gatewayKey}\n  http://${config.host}:${server.port}  data ${config.data}` +
      `  models ${report.served}  commercial ${state.commercial ? "on" : "off"}  billing ${billing}` +
      `${report.released > 0 ? `  released ${report.released} stale hold(s)` : ""}` +
      `${report.newKey ? "  new key" : ""}${state.test ? "  TEST MODE" : ""}`,
  );
  for (const warning of report.warnings) console.error(`gateway: ${warning}`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) exit(parsed.error.message, parsed.error.hint);
  const command = parsed.value;
  if (command.command === "help") {
    console.log(usage());
    return;
  }
  if (command.command === "serve") {
    serve(command);
    return;
  }
  if (command.command === "set-key") {
    process.exit(await runSetKey(command.data, command.name, command.remove));
  }
  process.exit(await runOperator(command));
}

void main();
