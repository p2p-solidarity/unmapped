// The relay service for friends' worlds: a Cloudflare Worker (web/turn/wrangler.jsonc,
// `bun run turn:deploy`). It mints short-lived Cloudflare Realtime TURN credentials, so joined
// worlds still meet when no direct path exists (a VPN, a strict NAT or firewall). The TURN key's
// API token is a Worker secret and never leaves it. Like the gas station (src/relay) it speaks to
// programs, not pages: a request with an Origin header is refused, no CORS header is sent, and
// each client address is rate-limited.
//
//   GET  /status → { ok, configured }
//   POST /ice    → IceAnswer (@shared/ice) | { ok: false, error }
//
// Plain Web APIs only, typed locally, so it typechecks with the repo's node types.

import { cleanIceServers, ICE_TTL_SECONDS, type IceAnswer } from "../shared/ice";

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface TurnEnv {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  LIMITER?: RateLimiter;
}

const CLOUDFLARE = "https://rtc.live.cloudflare.com/v1/turn/keys";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function refuse(status: number, code: string, message: string, hint?: string): Response {
  return json({ ok: false, error: { code, message, ...(hint ? { hint } : {}) } }, status);
}

function configured(
  env: TurnEnv,
): env is TurnEnv & { TURN_KEY_ID: string; TURN_KEY_API_TOKEN: string } {
  return (env.TURN_KEY_ID ?? "").length > 0 && (env.TURN_KEY_API_TOKEN ?? "").length > 0;
}

export async function mintIce(env: TurnEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  if (!configured(env)) {
    return refuse(
      503,
      "turn-no-key",
      "The relay service has no TURN key yet.",
      "Its operator runs `wrangler secret put TURN_KEY_ID` and `TURN_KEY_API_TOKEN`.",
    );
  }
  let answer: Response;
  try {
    answer = await fetcher(
      `${CLOUDFLARE}/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ ttl: ICE_TTL_SECONDS }),
      },
    );
  } catch {
    return refuse(502, "turn-upstream", "Cloudflare TURN could not be reached.", "Try again.");
  }
  if (!answer.ok) {
    return refuse(502, "turn-upstream", `Cloudflare TURN answered ${answer.status}.`, "Try again.");
  }
  const body = (await answer.json().catch(() => null)) as { iceServers?: unknown } | null;
  const servers = Array.isArray(body?.iceServers) ? body.iceServers : [];
  // Checked like any network answer; the app checks it again (readIceAnswer).
  const iceServers = cleanIceServers(
    servers.filter(
      (entry): entry is { urls: string | string[]; username?: string; credential?: string } =>
        typeof entry === "object" && entry !== null && "urls" in entry,
    ),
  );
  const out: IceAnswer = {
    ok: true,
    iceServers,
    expiresAt: new Date(Date.now() + ICE_TTL_SECONDS * 1000).toISOString(),
  };
  return json(out);
}

export async function handleTurn(
  request: Request,
  env: TurnEnv,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.headers.get("origin") !== null) {
    return refuse(403, "turn-browser", "The relay service does not answer web pages.");
  }
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/status") {
    return json({ ok: true, configured: configured(env) });
  }
  if (request.method !== "POST" || path !== "/ice")
    return refuse(404, "turn-not-found", "Not found.");
  const client = request.headers.get("cf-connecting-ip") ?? "unknown";
  if (env.LIMITER !== undefined && !(await env.LIMITER.limit({ key: client })).success) {
    return refuse(429, "turn-busy", "Too many requests from here.", "Wait a minute and try again.");
  }
  return mintIce(env, fetcher);
}

export default {
  fetch: (request: Request, env: TurnEnv): Promise<Response> => handleTurn(request, env),
};
