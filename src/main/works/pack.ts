// A work pack (rev 6 phase 3, D10; phase 4, D4–D5): one immutable AI-world revision
// (`works/<workId>/<version>/`) as a reproducible zip, so an otherworld place or an AI-work chapter
// can travel to a friend — or in a `.world` file — as a content-addressed blob. `work.json`
// (canonical JSON) + main.js, style.css, assets.json, the world's own images and, when the revision
// has one, its main-owned `licences.json` (D4), entries in `hashOrder`, fixed 1980 mtime: the same
// revision is the same bytes on every machine.
//
// Receiving is strict and pure (@shared/workPack, shared with the world service and
// `verifyWorldBundle`): every limit is checked from the zip's central directory before a byte is
// inflated, the blob must hash to the announced pack hash, the archive must hold only those files,
// every file must match the manifest and the manifest its content hash, and the revision must be
// exactly the announced `workId@version#contentHash`. A revision already installed under that id and
// version with another content hash is refused (`work-version-conflict`): `publishRevision` never
// overwrites (works/store.ts), and neither does this. The received world stays in `works/` beside
// the device's own; the caller lists it in the history's `received-works.json` so the otherworld
// picker never offers it as this device's work.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@shared/canonical";
import type { ContentHash } from "@shared/cartridge";
import { contentHash } from "@shared/history/ids";
import { LICENCES_FILE, type LicenceFile, parseLicenceFile } from "@shared/images";
import { err, ok, type Result, toError } from "@shared/result";
import {
  contentFiles,
  matchingLicences,
  readWorkPack,
  type UnpackedWork,
  WORK_PACK_MANIFEST,
} from "@shared/workPack";
import type { WorkManifest, WorkRef } from "@shared/works";
import { strToU8 } from "fflate";
import { reproducibleZip } from "../blobs/zip";
import { readRevision, type WorkDirs, type WorkRevision, writeContent } from "./store";

export type WorkPackRef = WorkRef & { pack: ContentHash };

/** The reproducible pack of an installed revision, with its pictures' licences when it has them. */
export function packWork(
  revision: WorkRevision,
  licences: LicenceFile | null = null,
): Result<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    [WORK_PACK_MANIFEST]: strToU8(canonicalJson(revision.manifest)),
  };
  for (const [path, bytes] of contentFiles(revision.content)) {
    entries[path] = typeof bytes === "string" ? strToU8(bytes) : bytes;
  }
  if (licences !== null) entries[LICENCES_FILE] = strToU8(canonicalJson(licences));
  return reproducibleZip(entries);
}

/** Reads a pack and proves it is exactly the revision its manifest claims (pre-inflate limits). */
export function unpackWork(bytes: Uint8Array): Result<UnpackedWork> {
  return readWorkPack(bytes);
}

function refused(message: string): Result<never> {
  return err(
    "work-pack-invalid",
    message,
    "The otherworld's pack is damaged or was altered; ask its owner to share the world again.",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export interface InstalledWork {
  manifest: WorkManifest;
  /** False when this exact revision was already on the device (own work, or received before). */
  installed: boolean;
}

/**
 * Installs a received pack as exactly `expected`. Same revision already present: a no-op. Same
 * id and version with other content, or an unreadable copy in the way: refused, never replaced.
 */
export async function installWorkPack(
  dirs: WorkDirs,
  bytes: Uint8Array,
  expected: WorkPackRef,
): Promise<Result<InstalledWork>> {
  if (contentHash(bytes) !== expected.pack) {
    return refused("The pack that arrived does not match the hash its place announced.");
  }
  const unpacked = unpackWork(bytes);
  if (!unpacked.ok) return unpacked;
  const { manifest, content, licences } = unpacked.value;
  if (
    manifest.workId !== expected.workId ||
    manifest.version !== expected.version ||
    manifest.contentHash !== expected.contentHash
  ) {
    return refused(
      `The pack holds ${manifest.workId}@${manifest.version}, not ${expected.workId}@${expected.version}.`,
    );
  }
  const destination = join(dirs.worksDir, manifest.workId, manifest.version);
  if (await exists(destination)) {
    const present = await readRevision(dirs, manifest.workId, manifest.version);
    if (present.ok && present.value.manifest.contentHash === manifest.contentHash) {
      return ok({ manifest: present.value.manifest, installed: false });
    }
    return err(
      "work-version-conflict",
      `${manifest.workId}@${manifest.version} already exists on this device with other content.`,
      "This device made or received a different world under the same name and version; it was left as it is.",
    );
  }
  const staging = `${destination}.${randomBytes(6).toString("hex")}.staging`;
  try {
    await mkdir(join(dirs.worksDir, manifest.workId), { recursive: true });
    await writeContent(staging, content);
    await writeFile(
      join(staging, WORK_PACK_MANIFEST),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    if (licences !== null) {
      await writeFile(join(staging, LICENCES_FILE), `${canonicalJson(licences)}\n`, "utf8");
    }
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return err("work-install-failed", toError(error).message);
  }
  const check = await readRevision(dirs, manifest.workId, manifest.version);
  return check.ok ? ok({ manifest: check.value.manifest, installed: true }) : check;
}

/**
 * An installed revision's `licences.json` as a pack carries it: only the entries whose hash is
 * still their picture's (as `readWorkLicences` reads them), or null when it has none.
 */
async function installedLicences(
  dirs: WorkDirs,
  revision: WorkRevision,
): Promise<LicenceFile | null> {
  const { workId, version } = revision.manifest;
  const path = join(dirs.worksDir, workId, version, LICENCES_FILE);
  const text = await readFile(path, "utf8").catch(() => null);
  const stored = text === null ? null : parseLicenceFile(text);
  return stored === null ? null : matchingLicences(stored, revision.content.images);
}

/** Packs the installed revision `ref`, refusing one whose files no longer match `ref`. */
export async function packInstalledWork(dirs: WorkDirs, ref: WorkRef): Promise<Result<Uint8Array>> {
  const revision = await readRevision(dirs, ref.workId, ref.version);
  if (!revision.ok) return revision;
  if (revision.value.manifest.contentHash !== ref.contentHash) {
    return err(
      "work-mismatch",
      `${ref.workId}@${ref.version} on this device has a different content hash.`,
    );
  }
  return packWork(revision.value, await installedLicences(dirs, revision.value));
}
