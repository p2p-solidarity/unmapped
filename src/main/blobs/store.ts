// Content-addressed blobs (rev 6 phase 3, D1, D10): `<userData>/blobs/<sha256 hex>` holds cartridge
// and work packs. A blob's name is its hash, and every read proves it: bytes that no longer hash to
// their name (a disk error, a hand edit) are refused, never served. Writing the same bytes twice is
// a no-op; writing the right bytes over a damaged file repairs it (temp file + rename). No eviction
// yet (phase 3 out of scope).

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContentHash } from "@shared/cartridge";
import { CONTENT_HASH, contentHash } from "@shared/history/ids";
import { err, fail, ok, type Result, toError } from "@shared/result";

export const BLOBS_DIR = "blobs";

export interface StoredBlob {
  hash: ContentHash;
  bytes: number;
}

/** Where a blob lives, or null when `hash` is not a well-formed content hash (never a path). */
export function blobPath(blobsDir: string, hash: string): string | null {
  return CONTENT_HASH.test(hash) ? join(blobsDir, hash.slice("sha256:".length)) : null;
}

function badHash(hash: string): Result<never> {
  return err("blob-hash-invalid", `${hash.slice(0, 80)} is not a content hash.`);
}

export async function putBlob(blobsDir: string, bytes: Uint8Array): Promise<Result<StoredBlob>> {
  const hash = contentHash(bytes) as ContentHash;
  const path = blobPath(blobsDir, hash);
  if (path === null) return badHash(hash);
  const existing = await readBlob(blobsDir, hash);
  if (existing.ok) return ok({ hash, bytes: bytes.length });
  const staged = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await mkdir(blobsDir, { recursive: true });
    await writeFile(staged, bytes);
    await rename(staged, path);
    return ok({ hash, bytes: bytes.length });
  } catch (error) {
    await rm(staged, { force: true }).catch(() => undefined);
    return fail(toError(error, "blob-write-failed"));
  }
}

/** The bytes named `hash`, proven: `blob-missing`, or `blob-tampered` when they no longer match. */
export async function readBlob(blobsDir: string, hash: string): Promise<Result<Uint8Array>> {
  const path = blobPath(blobsDir, hash);
  if (path === null) return badHash(hash);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path));
  } catch {
    return err("blob-missing", `Pack ${hash.slice(0, 19)}… is not on this device.`);
  }
  return contentHash(bytes) === hash
    ? ok(bytes)
    : err(
        "blob-tampered",
        `Pack ${hash.slice(0, 19)}… on this device no longer matches its hash.`,
        "It was damaged on disk; fetch it again from the world's service.",
      );
}

/** Whether a file by that name exists (not whether it verifies: `readBlob` does that). */
export async function hasBlob(blobsDir: string, hash: string): Promise<boolean> {
  const path = blobPath(blobsDir, hash);
  if (path === null) return false;
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Bytes that arrived from elsewhere (a service), accepted only when they hash to `expected`. */
export function verifyBlobBytes(bytes: Uint8Array, expected: string): Result<Uint8Array> {
  return contentHash(bytes) === expected
    ? ok(bytes)
    : err(
        "blob-tampered",
        "The pack that arrived does not match the hash the world announced.",
        "The service or the network altered it; try again, or ask the owner to share the world again.",
      );
}
