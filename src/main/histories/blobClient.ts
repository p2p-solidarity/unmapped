// Blobs over HTTP (rev 6 phase 3, D9): `PUT` / `GET <http base>/v1/worlds/<id>/blobs/<sha256 hex>`
// with a signed `X-Unmapped-Auth` header (the device key over method, path, whole seconds and the
// body's sha256; valid ±300 s). The HTTP base is the service URL with ws → http, wss → https.
// Everything that comes back is verified against the hash it was asked for before anyone uses it.
//
// The auth time is the real clock, never the test clock (`UNMAPPED_TEST_CLOCK_DAYS` shifts receipt
// and beat times only): the service checks it against its own wall clock.

import type { ContentHash } from "@shared/cartridge";
import { CONTENT_HASH } from "@shared/history/ids";
import { err, ok, type Result } from "@shared/result";
import { verifyBlobBytes } from "../blobs/store";
import type { DeviceKey } from "../identity/deviceKey";

const BLOB_TIMEOUT_MS = 60_000;
const BLOB_MAX_BYTES = 32 * 1024 * 1024;

export function httpBase(serviceUrl: string): string {
  return serviceUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
}

export function blobPathOf(world: string, hash: string): string {
  return `/v1/worlds/${world}/blobs/${hash.slice("sha256:".length)}`;
}

function auth(key: DeviceKey, method: string, path: string, body: Uint8Array): string {
  return key.blobAuth({ method, path, ts: Math.floor(Date.now() / 1000), body });
}

async function refusal(response: Response): Promise<Result<never>> {
  const text = await response.text().catch(() => "");
  let message = `The world's service answered ${response.status}.`;
  try {
    const parsed = JSON.parse(text) as { error?: { code?: unknown; message?: unknown } };
    if (typeof parsed.error?.message === "string") message = parsed.error.message.slice(0, 300);
  } catch {
    // not JSON: keep the status line
  }
  return err("blob-http-failed", message, "Try again once the world's service is reachable.");
}

export async function fetchBlob(
  serviceUrl: string,
  world: string,
  hash: ContentHash,
  key: DeviceKey,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<Uint8Array>> {
  if (!CONTENT_HASH.test(hash)) return err("blob-hash-invalid", "Not a content hash.");
  const path = blobPathOf(world, hash);
  let response: Response;
  try {
    response = await fetchImpl(`${httpBase(serviceUrl)}${path}`, {
      method: "GET",
      headers: { "X-Unmapped-Auth": auth(key, "GET", path, new Uint8Array()) },
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
  } catch (error) {
    return err("blob-http-failed", (error as Error).message, "Check the connection and try again.");
  }
  if (!response.ok) return refusal(response);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > BLOB_MAX_BYTES)
    return err("blob-too-large", "The pack is larger than 32 MiB.");
  return verifyBlobBytes(bytes, hash);
}

export async function uploadBlob(
  serviceUrl: string,
  world: string,
  hash: ContentHash,
  bytes: Uint8Array,
  key: DeviceKey,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<void>> {
  const checked = verifyBlobBytes(bytes, hash);
  if (!checked.ok) return checked;
  const path = blobPathOf(world, hash);
  let response: Response;
  try {
    response = await fetchImpl(`${httpBase(serviceUrl)}${path}`, {
      method: "PUT",
      headers: {
        "X-Unmapped-Auth": auth(key, "PUT", path, bytes),
        "Content-Type": "application/octet-stream",
      },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
  } catch (error) {
    return err("blob-http-failed", (error as Error).message, "Check the connection and try again.");
  }
  return response.ok ? ok(undefined) : refusal(response);
}
