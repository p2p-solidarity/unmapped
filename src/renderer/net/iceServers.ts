// The servers a joined world uses to reach friends (@shared/ice): public STUN always, plus a TURN
// relay when main has one (src/turn). Read once when the app starts and again when the minted
// credentials near their end; a continent opened before the answer arrives starts on STUN and
// takes the relay for every connection it makes after (continent.ts listens). Kept outside zustand:
// only the net layer reads it.

import { type IceServer, STUN_ONLY } from "@shared/ice";

/** Ask main again after this long (main keeps the credentials cached until near expiry). */
const REFRESH_MS = 60 * 60 * 1000;

let servers: IceServer[] = [...STUN_ONLY];
let relay = false;
let askedAt = 0;
let asking: Promise<void> | null = null;
const listeners = new Set<(next: IceServer[]) => void>();

export function currentIceServers(): IceServer[] {
  return servers;
}

/** Whether a TURN relay is among the current servers (a hint for the "cannot connect" error). */
export function hasRelay(): boolean {
  return relay;
}

export function onIceServers(listener: (next: IceServer[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Fetches the servers from main unless a recent answer is kept; errors leave STUN in place. */
export function prefetchIceServers(now: number = Date.now()): Promise<void> {
  if (asking !== null) return asking;
  if (askedAt > 0 && now - askedAt < REFRESH_MS) return Promise.resolve();
  asking = window.seed.net
    .iceServers()
    .then((answer) => {
      askedAt = Date.now();
      if (!answer.ok) {
        // Friends still meet when a direct path exists; the continent says so if none does.
        console.warn(`[ice] ${answer.error.code}: ${answer.error.message}`);
        return;
      }
      servers = answer.value.servers;
      relay = answer.value.relay;
      for (const listener of listeners) listener(servers);
    })
    .finally(() => {
      asking = null;
    });
  return asking;
}
