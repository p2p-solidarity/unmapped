// Where friends' worlds meet when a direct path fails. Joined worlds talk over WebRTC; STUN finds a
// direct path through most home routers, but a VPN, a symmetric NAT or a strict firewall leaves
// none, and then only a TURN relay carries the data. The TURN service (src/turn, a Cloudflare
// Worker) mints short-lived credentials from Cloudflare Realtime TURN; its API token never leaves
// the Worker. Main fetches them (main/net/ice.ts) and the renderer hands them to the peer
// connection — a peer connection needs them, and they expire, so they are not a secret to keep.
// Both ends parse with `readIceAnswer`: the answer comes over the network.

import { z } from "zod";
import { err, ok, type Result } from "./result";

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

/** What main hands the renderer for one continent: the servers, and whether a relay is among them. */
export interface IceView {
  servers: IceServer[];
  relay: boolean;
}

/** What a device uses with no TURN service: public STUN only (direct paths, no relay). */
export const STUN_ONLY: readonly IceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
];

/** How long minted credentials live (seconds); a continent opened late in that time still works. */
export const ICE_TTL_SECONDS = 6 * 60 * 60;

const MAX_SERVERS = 4;
const MAX_URLS = 8;
const url = z
  .string()
  .max(200)
  .regex(/^(stun|turn|turns):[A-Za-z0-9.-]+(:\d{1,5})?(\?transport=(udp|tcp))?$/);

const serverSchema = z.object({
  urls: z.union([z.string().max(200), z.array(z.string().max(200)).max(32)]),
  username: z.string().max(512).optional(),
  credential: z.string().max(512).optional(),
});

const answerSchema = z.object({
  ok: z.literal(true),
  iceServers: z.array(serverSchema).max(MAX_SERVERS),
  expiresAt: z.string().datetime(),
});

export interface IceAnswer {
  ok: true;
  iceServers: IceServer[];
  expiresAt: string;
}

/**
 * Keeps only URLs a browser can use: stun / turn / turns with a host and optional port and
 * transport. Port 53 is dropped (browsers block it, and it only times out), as is a TURN entry
 * without credentials.
 */
export function cleanIceServers(servers: readonly z.infer<typeof serverSchema>[]): IceServer[] {
  const out: IceServer[] = [];
  for (const server of servers) {
    const listed = typeof server.urls === "string" ? [server.urls] : server.urls;
    const urls = listed
      .filter((entry) => url.safeParse(entry).success && !/:53(\?|$)/.test(entry))
      .slice(0, MAX_URLS);
    if (urls.length === 0) continue;
    const relay = urls.some((entry) => !entry.startsWith("stun:"));
    if (relay && (server.username === undefined || server.credential === undefined)) continue;
    out.push(relay ? { urls, username: server.username, credential: server.credential } : { urls });
  }
  return out;
}

/** The TURN service's answer, checked; anything else is a value error (Rule 5). */
export function readIceAnswer(value: unknown): Result<IceAnswer> {
  const parsed = answerSchema.safeParse(value);
  if (!parsed.success) {
    return err(
      "ice-bad-answer",
      "The relay service answered with something that is not a list of relay servers.",
      "Friends can still join when a direct path exists; try again later.",
    );
  }
  const iceServers = cleanIceServers(parsed.data.iceServers);
  if (!iceServers.some((server) => server.username !== undefined)) {
    return err(
      "ice-no-relay",
      "The relay service answered without any relay server.",
      "Friends can still join when a direct path exists; try again later.",
    );
  }
  return ok({ ok: true, iceServers, expiresAt: parsed.data.expiresAt });
}

/** `window.seed.net.*`: the servers joined worlds use (main/net/ipc.ts; no arguments cross). */
export const NET_IPC = { iceServers: "net:ice-servers" } as const;

export interface NetApi {
  iceServers(): Promise<Result<IceView>>;
}
