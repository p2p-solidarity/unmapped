// The gateway's command line (rev 6 phase 4, D1–D3). Pure: it reads the argv and env it is given
// and returns a command or why not, so a typo in a flag stops the start instead of silently running
// with a default.
//
//   bun run gateway -- --port 8788 --data <dir> [--host 127.0.0.1] [--trust-proxy] [limit flags]
//   bun run gateway -- grant <accountId> <credits> --data <dir> [--period YYYY-MM]
//   bun run gateway -- token <accountId> --data <dir> [--label <text>]
//   bun run gateway -- revoke <tokenId> --data <dir>
//   bun run gateway -- set-key <name> --data <dir> [--remove]      (the key is read from stdin)
//
// Environment (read on the gateway host only):
//   GATEWAY_COMMERCIAL=1        the gateway sells: every served model must be commercial
//   GATEWAY_BILLING_LIVE=1      with NODE_ENV=production and GATEWAY_COMMERCIAL=1: a live billing key
//   GATEWAY_WEB_ORIGINS         comma-separated origins that get CORS (the gateway's own web pages)
//   UNMAPPED_GATEWAY_TEST=1     `POST /v1/test/advance` moves the ledger clock (E2E only)
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET   billing, when not saved with set-key
//   plus each upstream's own keyEnv (upstreams.json)

import { ACCOUNT_ID, TOKEN_ID } from "@shared/account";
import { QUOTA_PERIOD } from "@shared/quota";
import { err, ok, type Result } from "@shared/result";
import { KEY_NAME } from "./secrets";

export interface GatewayLimits {
  /** A stream is cut (and its reservation released) after this long. */
  streamCapMs: number;
  /** Per account. Over it: 429 `gateway-busy`. */
  requestsPerMinute: number;
  inFlight: number;
  /** Sent as the answer budget when a call names none, and the most a call may ask for. */
  maxOutputTokens: number;
  /** Sign-in, challenge and pairing requests per client address per minute. */
  authPerMinute: number;
  /** Credits a verified subject unlocks per period (0: verified allowance off). */
  freeCredits: number;
}

export const DEFAULT_LIMITS: GatewayLimits = {
  streamCapMs: 10 * 60_000,
  requestsPerMinute: 60,
  inFlight: 4,
  maxOutputTokens: 16_384,
  authPerMinute: 30,
  freeCredits: 0,
};

export interface ServeConfig {
  command: "serve";
  port: number;
  host: string;
  data: string;
  /** Behind a TLS proxy: the client address is the last `X-Forwarded-For` hop. */
  trustProxy: boolean;
  limits: GatewayLimits;
}

export type Command =
  | ServeConfig
  | { command: "help" }
  | { command: "grant"; data: string; account: string; credits: number; period: string | null }
  | { command: "token"; data: string; account: string; label: string }
  | { command: "revoke"; data: string; tokenId: string }
  | { command: "set-key"; data: string; name: string; remove: boolean };

const UNITS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

/** "90s", "10m", "250ms" → milliseconds, or null. */
export function parseDuration(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(text.trim());
  if (match === null) return null;
  const value = Number(match[1]) * (UNITS[match[2] ?? ""] ?? Number.NaN);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
}

function parseCount(text: string, max = 1_000_000_000_000): number | null {
  if (!/^\d{1,13}$/.test(text.trim())) return null;
  const value = Number(text.trim());
  return value <= max ? value : null;
}

type LimitFlag = [string, keyof GatewayLimits, "duration" | "count"];

const LIMIT_FLAGS: readonly LimitFlag[] = [
  ["stream-cap", "streamCapMs", "duration"],
  ["requests-per-minute", "requestsPerMinute", "count"],
  ["max-in-flight", "inFlight", "count"],
  ["max-output-tokens", "maxOutputTokens", "count"],
  ["auth-per-minute", "authPerMinute", "count"],
  ["free-credits", "freeCredits", "count"],
];

export function usage(): string {
  const limits = LIMIT_FLAGS.map(([flag, name, unit]) => {
    const value = DEFAULT_LIMITS[name];
    const shown = unit === "duration" ? `${value}ms` : String(value);
    return `  ${`--${flag} <${unit}>`.padEnd(40)}default ${shown}`;
  });
  return [
    "UNMAPPED generation gateway (rev 6 phase 4)",
    "",
    "  bun run gateway -- --port 8788 --data <dir>",
    "  bun run gateway -- grant <accountId> <credits> --data <dir> [--period YYYY-MM]",
    "  bun run gateway -- token <accountId> --data <dir> [--label <text>]",
    "  bun run gateway -- revoke <tokenId> --data <dir>",
    "  bun run gateway -- set-key <name> --data <dir> [--remove]   (key on stdin)",
    "",
    "  --port <n>                              default 8788",
    "  --data <dir>                            required: accounts, ledger, keys, upstreams.json, costs.json",
    "  --host <address>                        default 127.0.0.1 (put TLS in front for the internet)",
    "  --trust-proxy                           read the client address from X-Forwarded-For",
    ...limits,
  ].join("\n");
}

const COMMANDS = new Set(["grant", "token", "revoke", "set-key"]);

/** The command from `argv` (without the runtime and script) and `env`, or why not. */
export function parseArgs(argv: readonly string[]): Result<Command> {
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  const first = args[0] ?? "";
  const command = COMMANDS.has(first) ? first : "serve";
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = command === "serve" ? 0 : 1; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") return ok({ command: "help" });
    if (arg === "--trust-proxy" || arg === "--remove") {
      switches.add(arg.slice(2));
      continue;
    }
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [flag = "", inline] = arg.slice(2).split(/=(.*)/s, 2);
    const value = inline ?? args[index + 1];
    if (inline === undefined) index += 1;
    if (value === undefined) return err("gateway-arg", `--${flag} needs a value.`);
    flags.set(flag, value);
  }
  const data = flags.get("data") ?? "";
  if (data === "") return err("gateway-arg", "--data <dir> is required.", "Run with --help.");
  const allowed = (names: string[]): Result<void> => {
    for (const flag of flags.keys()) {
      if (!names.includes(flag))
        return err("gateway-arg", `Unknown flag --${flag}.`, "Run --help.");
    }
    return ok(undefined);
  };
  if (command === "serve") return parseServe(positional, flags, switches, data, allowed);
  const [target = "", extra] = positional;
  if (command === "grant") {
    const checked = allowed(["data", "period"]);
    if (!checked.ok) return checked;
    const credits = parseCount(extra ?? "");
    const period = flags.get("period") ?? null;
    if (!ACCOUNT_ID.test(target)) return err("gateway-arg", `"${target}" is not an account id.`);
    if (credits === null || credits < 1)
      return err("gateway-arg", "credits must be a whole number ≥ 1.");
    if (period !== null && !QUOTA_PERIOD.test(period)) {
      return err("gateway-arg", "--period is YYYY-MM.");
    }
    return ok({ command: "grant", data, account: target, credits, period });
  }
  if (command === "token") {
    const checked = allowed(["data", "label"]);
    if (!checked.ok) return checked;
    if (!ACCOUNT_ID.test(target)) return err("gateway-arg", `"${target}" is not an account id.`);
    const label = (flags.get("label") ?? "cli").trim().slice(0, 60) || "cli";
    return ok({ command: "token", data, account: target, label });
  }
  if (command === "revoke") {
    const checked = allowed(["data"]);
    if (!checked.ok) return checked;
    if (!TOKEN_ID.test(target)) return err("gateway-arg", `"${target}" is not a token id (t…).`);
    return ok({ command: "revoke", data, tokenId: target });
  }
  const checked = allowed(["data"]);
  if (!checked.ok) return checked;
  if (!KEY_NAME.test(target)) return err("gateway-arg", `"${target}" is not a key name.`);
  return ok({ command: "set-key", data, name: target, remove: switches.has("remove") });
}

function parseServe(
  positional: string[],
  flags: Map<string, string>,
  switches: Set<string>,
  data: string,
  allowed: (names: string[]) => Result<void>,
): Result<Command> {
  if (positional.length > 0) {
    return err("gateway-arg", `Unknown argument ${positional[0]}.`, "Run with --help.");
  }
  const checked = allowed(["data", "port", "host", ...LIMIT_FLAGS.map(([flag]) => flag)]);
  if (!checked.ok) return checked;
  const limits: GatewayLimits = { ...DEFAULT_LIMITS };
  for (const [flag, name, unit] of LIMIT_FLAGS) {
    const text = flags.get(flag);
    if (text === undefined) continue;
    const value = unit === "duration" ? parseDuration(text) : parseCount(text);
    if (value === null) return err("gateway-arg", `--${flag} ${text} is not valid.`);
    limits[name] = value;
  }
  if (limits.streamCapMs > 60 * 60_000) return err("gateway-arg", "--stream-cap is at most 1h.");
  if (limits.inFlight < 1 || limits.requestsPerMinute < 1 || limits.maxOutputTokens < 1) {
    return err("gateway-arg", "Limits must be at least 1.");
  }
  const portText = flags.get("port") ?? "8788";
  const port = parseCount(portText, 65_535);
  if (port === null || port < 1) return err("gateway-arg", `--port ${portText} is not valid.`);
  return ok({
    command: "serve",
    port,
    host: flags.get("host") ?? "127.0.0.1",
    data,
    trustProxy: switches.has("trust-proxy"),
    limits,
  });
}

/** Exact origins from GATEWAY_WEB_ORIGINS ("https://unmapped.example, http://127.0.0.1:5173"). */
export function webOrigins(env: Readonly<Record<string, string | undefined>>): Set<string> {
  const out = new Set<string>();
  for (const part of (env.GATEWAY_WEB_ORIGINS ?? "").split(",")) {
    const text = part.trim();
    if (text === "") continue;
    try {
      const url = new URL(text);
      if (url.origin === text.replace(/\/$/, "")) out.add(url.origin);
    } catch {}
  }
  return out;
}
