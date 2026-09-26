// The Market's gas station: a Cloudflare Worker (web/lineage-relay/wrangler.jsonc,
// `bun run relay:deploy`). The app's main process asks it for one transaction at a time
// (@shared/relay); the station decides what it will pay for (./sponsor) and holds the only key that
// pays — the app holds none. It speaks to programs, not pages: a request carrying an Origin header
// (a browser) is refused, and no CORS header is ever sent. Each client address gets a rate limit.
//
//   GET  /status  → { ok, chainId, relayer, balanceWei }   (public facts, no secrets)
//   POST /relay   → RelayRequest → RelayAnswer             (200 with ok:false for a refusal)
//
// Plain Web APIs only, typed locally, so it typechecks with the repo's node types.

import { relayRequestSchema } from "../shared/relay";
import { type RelayEnv, refuse, sponsor, station } from "./sponsor";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface WorkerEnv extends RelayEnv {
  LIMITER?: RateLimiter;
}

const MAX_BODY = 64_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function status(env: WorkerEnv): Promise<Response> {
  const s = station(env);
  if (s === null) return json({ ok: true, chainId: 11155111, relayer: null, balanceWei: null });
  const balance = await s.public.getBalance({ address: s.relayer });
  return json({ ok: true, chainId: 11155111, relayer: s.relayer, balanceWei: balance.toString() });
}

async function relay(request: Request, env: WorkerEnv): Promise<Response> {
  const client = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.LIMITER !== undefined && !(await env.LIMITER.limit({ key: client })).success) {
    return json(
      refuse("relay-busy", "Too many requests from here.", "Wait a minute and try again."),
      429,
    );
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return json(refuse("relay-bad-request", "Request too large."), 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(refuse("relay-bad-request", "Expected JSON."), 400);
  }
  const parsed = relayRequestSchema.safeParse(body);
  if (!parsed.success)
    return json(refuse("relay-bad-request", "Not a request the station knows."), 400);
  const s = station(env);
  if (s === null) {
    return json(
      refuse(
        "relay-no-key",
        "The gas station has no key yet.",
        "Its operator runs `wrangler secret put RELAYER_KEY`.",
      ),
      503,
    );
  }
  try {
    return json(await sponsor(s, parsed.data));
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 300) : "unexpected failure";
    return json(
      refuse("relay-failed", `The station could not read Sepolia: ${message}`, "Try again."),
      502,
    );
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    if (request.headers.has("origin"))
      return json(refuse("relay-forbidden", "Not for browsers."), 403);
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/status") return status(env);
    if (request.method === "POST" && pathname === "/relay") return relay(request, env);
    return json(refuse("relay-not-found", "Unknown route."), 404);
  },
};
