// World services: where a shared world's history lives (rev 6 phase 3, D9–D11). The list is a
// per-device preference (localStorage, Rule 2), read by the door when the owner shares a world.
// There is no default: no service is run for everyone, so a device lists the ones it trusts, and an
// empty list says so where it matters (Settings → Shared worlds, the door's "Share" step).
//
// An address is `wss://…`, or `ws://` only to this machine (`isServiceUrl`, the same rule main,
// the IPC schemas and invites use). `probeService` is the settings' "Test": main fetches
// `/v1/health` and reads the WebSocket challenge (a page cannot: the service sends no CORS headers).

import { isServiceUrl } from "@shared/history/bodies";
import { err, ok, type Result } from "@shared/result";
import type { ServiceProbe } from "@shared/worldApi";

/** Comma separated service URLs (the `unwritten.*` prefix every device preference keeps). */
export const WORLD_SERVICES_KEY = "unwritten.worldServices";

/** Longer than an IPC schema allows is not an address anyone typed. */
const MAX_URL = 200;

/** `wss://…` anywhere, `ws://` on loopback only; trailing slashes are dropped. */
export function normalizeServiceUrl(text: string): string | null {
  const trimmed = text.trim().replace(/\/+$/, "");
  return trimmed.length > 0 && trimmed.length <= MAX_URL && isServiceUrl(trimmed) ? trimmed : null;
}

/** Splits what the player typed (commas, spaces or lines) into services and entries that are not. */
export function parseServiceList(text: string): { urls: string[]; invalid: string[] } {
  const urls: string[] = [];
  const invalid: string[] = [];
  for (const entry of text.split(/[\s,]+/)) {
    if (entry.length === 0) continue;
    const url = normalizeServiceUrl(entry);
    if (url === null) invalid.push(entry);
    else if (!urls.includes(url)) urls.push(url);
  }
  return { urls, invalid };
}

/** This device's world services, in the order the player listed them (empty: none yet). */
export function worldServices(): string[] {
  try {
    return parseServiceList(localStorage.getItem(WORLD_SERVICES_KEY) ?? "").urls;
  } catch {
    // Storage can be disabled; the settings panel says so when saving.
    return [];
  }
}

/** Keeps `urls` as this device's list; an empty list removes it. */
export function setWorldServices(urls: readonly string[]): Result<void> {
  try {
    if (urls.length === 0) localStorage.removeItem(WORLD_SERVICES_KEY);
    else localStorage.setItem(WORLD_SERVICES_KEY, urls.join(","));
    return ok(undefined);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return err(
      "world-services-not-saved",
      `This device's world services could not be saved: ${reason}`,
      "Storage may be disabled for this app; the services in use did not change.",
    );
  }
}

/** Both halves of a service's address, tested from main; an address that is not one never goes. */
export async function probeService(url: string): Promise<Result<ServiceProbe>> {
  const address = normalizeServiceUrl(url);
  if (address === null) {
    return err(
      "world-service-url",
      `"${url}" is not a world service address.`,
      "Use wss://…, or ws://127.0.0.1:<port> for a service on this machine.",
    );
  }
  return window.seed.world.probe(address);
}

/** The host and port of a service, for a badge ("shared on 127.0.0.1:8787"). */
export function serviceLabel(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}
