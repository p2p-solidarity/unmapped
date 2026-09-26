// Blobs by hash over HTTP (rev 6 phase 3 D9, phase 4 D7): `GET <http base>/v1/worlds/<id>/blobs/
// <sha256 hex>` with `X-Unmapped-Auth` signed by the page's WebCrypto device key (method, exact
// path, whole seconds, the empty body's sha256). The HTTP base is the service URL with ws → http,
// wss → https. What comes back is kept only if it hashes to the hash asked for, and never if it is
// larger than a pack may be — the same rule as main's `fetchBlob` (main/histories/blobClient.ts).
//
// A page on another origin needs the service to answer CORS for its origin (the service's
// `--browser-origin` flag); without it the browser refuses the request and this says so.

import type { ContentHash } from "@shared/cartridge";
import { HISTORY_LIMITS } from "@shared/history/bodies";
import { CONTENT_HASH, contentHash } from "@shared/history/ids";
import { err, ok, type Result } from "@shared/result";
import { type BrowserSigner, blobAuthWith } from "./signer";

export const BLOB_MAX_BYTES = HISTORY_LIMITS.packBytes;
const BLOB_TIMEOUT_MS = 60_000;

export function httpBase(serviceUrl: string): string {
  return serviceUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:").replace(/\/+$/, "");
}

export function blobPathOf(world: string, hash: string): string {
  return `/v1/worlds/${world}/blobs/${hash.slice("sha256:".length)}`;
}

/** Bytes that arrived from a service, kept only when they are a pack's size and hash to `hash`. */
export function verifyBlob(bytes: Uint8Array, hash: string): Result<Uint8Array> {
  if (!CONTENT_HASH.test(hash)) return err("blob-hash-invalid", "Not a content hash.");
  if (bytes.length > BLOB_MAX_BYTES) {
    return err("blob-too-large", "The pack is larger than 32 MiB.");
  }
  return contentHash(bytes) === hash
    ? ok(bytes)
    : err(
        "blob-tampered",
        "The pack that arrived does not match the hash the world announced.",
        "The service or the network altered it; try again, or ask the owner to share the world again.",
      );
}

async function refusal(response: Response): Promise<Result<never>> {
  const text = await response.text().catch(() => "");
  let message = `The world's service answered ${response.status}.`;
  try {
    const parsed = JSON.parse(text) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === "string") message = parsed.error.message.slice(0, 300);
  } catch {
    // not JSON: keep the status line
  }
  return err("blob-http-failed", message, "Try again once the world's service is reachable.");
}

/** Fetches one blob of `world` from its service and verifies it against `hash`. */
export async function fetchBlob(
  serviceUrl: string,
  world: string,
  hash: ContentHash | string,
  signer: BrowserSigner,
  fetchImpl: typeof fetch = fetch,
): Promise<Result<Uint8Array>> {
  if (!CONTENT_HASH.test(hash)) return err("blob-hash-invalid", "Not a content hash.");
  const path = blobPathOf(world, hash);
  const ts = Math.floor(Date.now() / 1000);
  const auth = await blobAuthWith(signer, { method: "GET", path, ts, body: new Uint8Array() });
  let response: Response;
  try {
    response = await fetchImpl(`${httpBase(serviceUrl)}${path}`, {
      method: "GET",
      headers: { "X-Unmapped-Auth": auth },
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
  } catch (error) {
    return err(
      "blob-http-failed",
      (error as Error).message,
      "Check the connection; a service on another origin must allow this page (--browser-origin).",
    );
  }
  if (!response.ok) return refusal(response);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > BLOB_MAX_BYTES) {
    return err("blob-too-large", "The pack is larger than 32 MiB.");
  }
  return verifyBlob(new Uint8Array(await response.arrayBuffer()), hash);
}
