// Main's side of the relay service (src/turn, @shared/ice): the relay servers joined worlds may use
// when no direct path exists. The service URL is UNMAPPED_TURN_URL, else the baked TURN_URL (the
// project's deployed Worker). If it cannot be reached, the answer is an error and the renderer keeps
// public STUN — friends still meet when a direct path exists. Minted credentials are kept until
// shortly before they expire.

import { type IceView, readIceAnswer, STUN_ONLY } from "@shared/ice";
import { err, ok, type Result } from "@shared/result";

/**
 * The relay service asked when UNMAPPED_TURN_URL is not set: the project's Worker (web/turn,
 * deployed 2026-09-26). Set UNMAPPED_TURN_URL to use your own.
 */
export const TURN_URL: string | null = "https://unmapped-turn.gimmychang.workers.dev";

const ASK_MS = 8_000;
/** Ask again this long before the credentials expire. */
const MARGIN_MS = 30 * 60 * 1000;

let cached: { view: IceView; until: number } | null = null;

/** The relay service's origin, or null when none (or not http/https) is set. */
export function turnUrl(env: NodeJS.ProcessEnv): string | null {
  const raw = env.UNMAPPED_TURN_URL?.trim() || TURN_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function iceServers(
  env: NodeJS.ProcessEnv = process.env,
  now: number = Date.now(),
): Promise<Result<IceView>> {
  const base = turnUrl(env);
  if (base === null) return ok({ servers: [...STUN_ONLY], relay: false });
  if (cached !== null && cached.until > now) return ok(cached.view);
  let body: unknown;
  try {
    const response = await fetch(`${base}/ice`, {
      method: "POST",
      signal: AbortSignal.timeout(ASK_MS),
    });
    body = await response.json();
  } catch {
    return err(
      "ice-unreachable",
      `The relay service at ${base} did not answer.`,
      "Friends can still join when a direct path exists. Check the connection, or UNMAPPED_TURN_URL in .env.",
    );
  }
  const refused = body as { ok?: unknown; error?: { code?: unknown; message?: unknown } } | null;
  if (refused?.ok === false && typeof refused.error?.message === "string") {
    return err(
      "ice-refused",
      `The relay service refused: ${refused.error.message.slice(0, 200)}`,
      "Friends can still join when a direct path exists; try again later.",
    );
  }
  const answer = readIceAnswer(body);
  if (!answer.ok) return answer;
  const view: IceView = { servers: [...STUN_ONLY, ...answer.value.iceServers], relay: true };
  const expires = Date.parse(answer.value.expiresAt);
  cached = { view, until: Math.min(expires - MARGIN_MS, now + 12 * 60 * 60 * 1000) };
  return ok(view);
}
