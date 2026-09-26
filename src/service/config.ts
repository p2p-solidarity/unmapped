// The world service's command line (rev 6 phase 3, D9–D10): where it listens, where it keeps its
// files, and every anti-flood limit of the D9 table as a host flag. Pure: it reads the argv and env
// it is given and returns a config or why not, so a typo in a flag stops the start instead of
// silently running with the default.
//
//   bun run service -- --port 8787 --data <dir> [--host 127.0.0.1] [--trust-proxy] [limit flags]
//
// `--beat-every <duration>` is honoured only with UNMAPPED_SERVICE_TEST=1 (the default is 6 h, the
// D13 cadence); so is `POST /v1/test/advance`. Sizes take KiB/MiB/GiB, durations ms/s/m/h/d.

import { BEAT_EVERY_MS } from "@shared/history/beat";
import { err, ok, type Result } from "@shared/result";
import { FRAME_LIMITS } from "@shared/worldProtocol";
import { parseBrowserOrigin } from "./cors";

export interface ServiceLimits {
  /** Connection / IP. */
  authTimeoutMs: number;
  openWorlds: number;
  framesPerSecond: number;
  presencePerSecond: number;
  socketsPerIp: number;
  newVisitorKeysPerIp: number;
  /** Member or owner × world. */
  memberEventsPerMinute: number;
  memberEventsPerDay: number;
  witnessPerDay: number;
  placePerDay: number;
  /** `chapter` + `story.more`. */
  chapterPerDay: number;
  /** `note` + `signpost`. */
  notePerDay: number;
  giftPerDay: number;
  variantsPerTarget: number;
  claimsPerAuthor: number;
  streamsPerAuthor: number;
  streamChars: number;
  streamDeltasPerSecond: number;
  /** All visitors × world: one shared budget. */
  visitorEventsPerDay: number;
  visitorBytesPerDay: number;
  visitorEventsPerKeyPerDay: number;
  visitorBytesEver: number;
  /** World. */
  worldBytes: number;
  worldBlobBytes: number;
  blobBytes: number;
  /** Owner key. */
  worldsPerOwner: number;
  /** Claims (D15). */
  leaseMs: number;
  leaseMaxMs: number;
}

type Unit = "count" | "bytes" | "duration";

const KiB = 1024;
const MiB = 1024 * KiB;

/** Flag, limit, unit, default — the D9 table. */
const LIMIT_FLAGS: readonly [string, keyof ServiceLimits, Unit, number][] = [
  ["auth-timeout", "authTimeoutMs", "duration", 10_000],
  ["max-open-worlds", "openWorlds", "count", 8],
  ["frames-per-second", "framesPerSecond", "count", 20],
  ["presence-per-second", "presencePerSecond", "count", 5],
  ["sockets-per-ip", "socketsPerIp", "count", 10],
  ["new-visitor-keys-per-ip", "newVisitorKeysPerIp", "count", 5],
  ["member-events-per-minute", "memberEventsPerMinute", "count", 30],
  ["member-events-per-day", "memberEventsPerDay", "count", 1_000],
  ["witness-per-day", "witnessPerDay", "count", 60],
  ["place-per-day", "placePerDay", "count", 10],
  ["chapter-per-day", "chapterPerDay", "count", 20],
  ["note-per-day", "notePerDay", "count", 50],
  ["gift-per-day", "giftPerDay", "count", 20],
  ["variants-per-target", "variantsPerTarget", "count", 1],
  ["claims-per-author", "claimsPerAuthor", "count", 2],
  ["streams-per-author", "streamsPerAuthor", "count", 1],
  ["stream-chars", "streamChars", "count", FRAME_LIMITS.streamChars],
  ["stream-deltas-per-second", "streamDeltasPerSecond", "count", 20],
  ["visitor-events-per-day", "visitorEventsPerDay", "count", 200],
  ["visitor-bytes-per-day", "visitorBytesPerDay", "bytes", 512 * KiB],
  ["visitor-events-per-key-per-day", "visitorEventsPerKeyPerDay", "count", 20],
  ["visitor-bytes-ever", "visitorBytesEver", "bytes", 8 * MiB],
  ["world-bytes", "worldBytes", "bytes", 64 * MiB],
  ["world-blob-bytes", "worldBlobBytes", "bytes", 256 * MiB],
  ["blob-bytes", "blobBytes", "bytes", 32 * MiB],
  ["worlds-per-owner", "worldsPerOwner", "count", 20],
  ["lease", "leaseMs", "duration", 90_000],
  ["lease-max", "leaseMaxMs", "duration", 10 * 60_000],
];

export const DEFAULT_LIMITS: ServiceLimits = Object.fromEntries(
  LIMIT_FLAGS.map(([, name, , value]) => [name, value]),
) as unknown as ServiceLimits;

export interface ServiceConfig {
  port: number;
  host: string;
  data: string;
  /** Behind a TLS proxy: the client address is the last `X-Forwarded-For` hop. */
  trustProxy: boolean;
  /** UNMAPPED_SERVICE_TEST=1: `--beat-every` and `POST /v1/test/advance`. */
  test: boolean;
  beatEveryMs: number;
  limits: ServiceLimits;
  /** `--browser-origin` (repeatable): exact page origins that may read blobs (phase 4, D7). */
  browserOrigins: string[];
}

const UNITS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const SIZES: Record<string, number> = { "": 1, b: 1, kib: KiB, mib: MiB, gib: 1024 * MiB };

/** "90s", "10m", "6h", "250ms", "2d" → milliseconds, or null. */
export function parseDuration(text: string): number | null {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(text.trim());
  if (match === null) return null;
  const value = Number(match[1]) * (UNITS[match[2] ?? ""] ?? Number.NaN);
  return Number.isFinite(value) && value >= 1 ? Math.round(value) : null;
}

/** "512KiB", "64MiB", "1024" → bytes, or null. */
export function parseBytes(text: string): number | null {
  const match = /^(\d+)\s*(b|kib|mib|gib)?$/i.exec(text.trim());
  if (match === null) return null;
  const value = Number(match[1]) * (SIZES[(match[2] ?? "").toLowerCase()] ?? Number.NaN);
  return Number.isSafeInteger(value) ? value : null;
}

function parseCount(text: string): number | null {
  if (!/^\d{1,9}$/.test(text.trim())) return null;
  return Number(text.trim());
}

function parseLimit(unit: Unit, text: string): number | null {
  if (unit === "duration") return parseDuration(text);
  if (unit === "bytes") return parseBytes(text);
  return parseCount(text);
}

export function usage(): string {
  const limits = LIMIT_FLAGS.map(([flag, , unit, value]) => {
    const shown = unit === "duration" ? `${value}ms` : String(value);
    const name = `  --${flag} <${unit}>`;
    return `${name.padEnd(46)}default ${shown}`;
  });
  return [
    "UNMAPPED world service (rev 6 phase 3)",
    "",
    "  bun run service -- --port 8787 --data <dir>",
    "",
    "  --port <n>                                  default 8787",
    "  --data <dir>                                required: keys, logs and blobs live here",
    "  --host <address>                            default 127.0.0.1 (put TLS in front for the internet)",
    "  --trust-proxy                               read the client address from X-Forwarded-For",
    "  --beat-every <duration>                     UNMAPPED_SERVICE_TEST=1 only; default 6h",
    "  --browser-origin <origin>                   a page origin that may read blobs (repeatable)",
    "",
    "  bun run service -- import <file.world> --data <dir>    a .world, served as a mirror",
    "  bun run service -- export <worldId> --data <dir> [--out <file>]",
    "",
    "Anti-flood limits (D9):",
    ...limits,
  ].join("\n");
}

/** The config from `argv` (without the runtime and script) and `env`, "help", or why not. */
export function parseArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Result<ServiceConfig | "help"> {
  const test = env.UNMAPPED_SERVICE_TEST === "1";
  const limits: ServiceLimits = { ...DEFAULT_LIMITS };
  const config: ServiceConfig = {
    port: 8787,
    host: "127.0.0.1",
    data: "",
    trustProxy: false,
    test,
    beatEveryMs: BEAT_EVERY_MS,
    limits,
    browserOrigins: [],
  };
  const args = argv[0] === "--" ? argv.slice(1) : [...argv];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === "--help" || arg === "-h") return ok("help");
    if (arg === "--trust-proxy") {
      config.trustProxy = true;
      continue;
    }
    const [flag = "", inline] = arg.startsWith("--") ? arg.slice(2).split(/=(.*)/s, 2) : [""];
    if (flag === "") return err("service-arg", `Unknown argument ${arg}.`, "Run with --help.");
    const value = inline ?? args[index + 1];
    if (inline === undefined) index += 1;
    if (value === undefined) return err("service-arg", `--${flag} needs a value.`);
    const bad = err("service-arg", `--${flag} ${value} is not valid.`, "Run with --help.");
    if (flag === "port") {
      const port = parseCount(value);
      if (port === null || port < 1 || port > 65_535) return bad;
      config.port = port;
    } else if (flag === "host") {
      config.host = value;
    } else if (flag === "data") {
      config.data = value;
    } else if (flag === "browser-origin") {
      const origin = parseBrowserOrigin(value);
      if (origin === null) {
        return err(
          "service-arg",
          `--browser-origin ${value} is not an origin.`,
          "Name it exactly, as http(s)://host[:port] with no path.",
        );
      }
      if (!config.browserOrigins.includes(origin)) config.browserOrigins.push(origin);
    } else if (flag === "beat-every") {
      if (!test) {
        return err(
          "service-arg",
          "--beat-every is a test flag.",
          "Set UNMAPPED_SERVICE_TEST=1 to use it; the service beats every 6 h.",
        );
      }
      const every = parseDuration(value);
      if (every === null) return bad;
      config.beatEveryMs = every;
    } else {
      const spec = LIMIT_FLAGS.find(([name]) => name === flag);
      if (spec === undefined) return err("service-arg", `Unknown flag --${flag}.`, "Run --help.");
      const parsed = parseLimit(spec[2], value);
      if (parsed === null) return bad;
      limits[spec[1]] = parsed;
    }
  }
  if (config.data === "") return err("service-arg", "--data <dir> is required.");
  if (limits.streamChars > FRAME_LIMITS.streamChars) {
    return err("service-arg", `--stream-chars is at most ${FRAME_LIMITS.streamChars}.`);
  }
  return ok(config);
}
