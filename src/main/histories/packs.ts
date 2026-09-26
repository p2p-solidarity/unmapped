// Packs as blobs (rev 6 phase 3, D10): the cartridge a world plays on and the AI works its places
// and chapters open, each as a reproducible zip stored under its sha256. Identical revisions give
// identical bytes on every machine, so the `pack` event and every `work.pack` hash a migration
// plans are the same on every rerun.
//
// The cartridge pack is re-zipped from `packCartridge`'s entries through `reproducibleZip` until
// cartridges/pack.ts itself zips reproducibly (the deferred wiring pass); the entries, order,
// level and mtime are then identical, so the bytes do not change when that lands.
//
// `packPinnedRevision` is the one way a genesis's revision is packed from what is installed here:
// a `.world` export (bundles/export.ts) and the pack a built-in world's owner announces once it is
// shared (./builtInPack) both use it, so the file and the service carry the same bytes.

import type { CartridgeRef, CartridgeRevision, ContentHash } from "@shared/cartridge";
import { contentHash } from "@shared/history/ids";
import { err, ok, type Result, toError } from "@shared/result";
import type { WorkRef } from "@shared/works";
import { unzipSync } from "fflate";
import { putBlob, type StoredBlob } from "../blobs/store";
import { reproducibleZip } from "../blobs/zip";
import { packCartridge } from "../cartridges/pack";
import { readCartridgeRevision } from "../cartridges/store";
import { packInstalledWork } from "../works/pack";
import type { WorkDirs } from "../works/store";
import { isBuiltIn } from "./builtIn";

export function packCartridgeReproducibly(revision: CartridgeRevision): Result<Uint8Array> {
  const packed = packCartridge(revision);
  if (!packed.ok) return packed;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(packed.value);
  } catch (error) {
    return err("cartridge-pack-failed", toError(error).message);
  }
  return reproducibleZip(entries);
}

/**
 * The reproducible pack of exactly the revision `ref` names, from this device's installed copy (a
 * shipped built-in is installed from this build first). Null when that revision is not here, or an
 * installed revision under its id@version has another content hash.
 */
export async function packPinnedRevision(
  deps: { cartridgesDir: string; ensureBaseGame(): Promise<Result<unknown>> },
  ref: CartridgeRef,
): Promise<Result<{ hash: ContentHash; bytes: Uint8Array } | null>> {
  if (isBuiltIn(ref)) {
    const base = await deps.ensureBaseGame();
    if (!base.ok) return base;
  }
  const revision = await readCartridgeRevision(deps.cartridgesDir, ref.cartridgeId, ref.version);
  if (!revision.ok || revision.value.manifest.contentHash !== ref.contentHash) return ok(null);
  const bytes = packCartridgeReproducibly(revision.value);
  if (!bytes.ok) return bytes;
  return ok({ hash: contentHash(bytes.value) as ContentHash, bytes: bytes.value });
}

export async function storeCartridgePack(
  blobsDir: string,
  revision: CartridgeRevision,
): Promise<Result<StoredBlob>> {
  const bytes = packCartridgeReproducibly(revision);
  return bytes.ok ? putBlob(blobsDir, bytes.value) : bytes;
}

export async function storeWorkPack(
  blobsDir: string,
  dirs: WorkDirs,
  ref: WorkRef,
): Promise<Result<ContentHash>> {
  const bytes = await packInstalledWork(dirs, ref);
  if (!bytes.ok) return bytes;
  const stored = await putBlob(blobsDir, bytes.value);
  return stored.ok ? ok(stored.value.hash) : stored;
}
