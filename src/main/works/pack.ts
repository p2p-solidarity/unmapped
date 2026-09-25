// A work pack (rev 6 phase 3, D10): one immutable AI-world revision (`works/<workId>/<version>/`)
// as a reproducible zip, so an otherworld place or an AI-work chapter can travel to a friend as a
// content-addressed blob. `work.json` (canonical JSON) + main.js, style.css, assets.json and the
// world's own images, entries in `hashOrder`, fixed 1980 mtime: the same revision is the same
// bytes on every machine.
//
// Receiving is strict. The blob must hash to the announced pack hash, the archive must hold only
// those files, every file must match the manifest and the manifest its content hash, and the
// revision must be exactly the announced `workId@version#contentHash`. A revision already installed
// under that id and version with another content hash is refused (`work-version-conflict`):
// `publishRevision` never overwrites (works/store.ts), and neither does this. The received world
// stays in `works/` beside the device's own; the caller lists it in the history's
// `received-works.json` so the otherworld picker never offers it as this device's work.

import { randomBytes } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson } from "@shared/canonical";
import type { ContentHash } from "@shared/cartridge";
import { contentHash } from "@shared/history/ids";
import { err, ok, type Result, toError } from "@shared/result";
import {
  WORK_ASSET_FILE,
  WORK_FORMAT,
  WORK_FORMAT_VERSION,
  WORK_HOST_API,
  WORK_ID,
  WORK_LIMITS,
  type WorkManifest,
  type WorkRef,
} from "@shared/works";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { z } from "zod";
import { validateArchiveEntryNames } from "../archive";
import { reproducibleZip } from "../blobs/zip";
import { sha256 } from "../cartridges/integrity";
import {
  checkContent,
  contentFiles,
  readRevision,
  type WorkContent,
  type WorkDirs,
  type WorkRevision,
  workContentHash,
  writeContent,
} from "./store";

const MANIFEST = "work.json";
const CODE_FILES = ["main.js", "style.css", "assets.json"] as const;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
/** Whole pack, compressed; the uncompressed content is bounded again by `checkContent`. */
const PACK_MAX_BYTES = 32 * 1024 * 1024;

export type WorkPackRef = WorkRef & { pack: ContentHash };

const hash = z.custom<ContentHash>((value) => typeof value === "string" && HASH.test(value));
const refSchema = z.strictObject({
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  contentHash: hash,
});

/** Strict: a received manifest carries nothing a published one would not. */
const manifestSchema: z.ZodType<WorkManifest> = z.strictObject({
  format: z.literal(WORK_FORMAT),
  formatVersion: z.literal(WORK_FORMAT_VERSION),
  hostApi: z.literal(WORK_HOST_API),
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  title: z.string().min(1).max(120),
  description: z.string().max(WORK_LIMITS.summaryChars),
  createdAt: z.string().min(1).max(40),
  lineage: z.strictObject({
    kind: z.enum(["new", "revision"]),
    parent: refSchema.nullable(),
    draftId: z.string().max(64).nullable(),
  }),
  files: z
    .array(
      z.strictObject({
        path: z.string().min(1).max(120),
        bytes: z.number().int().min(0),
        contentHash: hash,
      }),
    )
    .max(WORK_LIMITS.assetCount + CODE_FILES.length),
  contentHash: hash,
});

function fileList(content: WorkContent): WorkManifest["files"] {
  return contentFiles(content).map(([path, bytes]) => {
    const data = typeof bytes === "string" ? strToU8(bytes) : bytes;
    return { path, bytes: data.length, contentHash: sha256(data) };
  });
}

/** The reproducible pack of an installed revision. */
export function packWork(revision: WorkRevision): Result<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    [MANIFEST]: strToU8(canonicalJson(revision.manifest)),
  };
  for (const [path, bytes] of contentFiles(revision.content)) {
    entries[path] = typeof bytes === "string" ? strToU8(bytes) : bytes;
  }
  return reproducibleZip(entries);
}

function refused(message: string): Result<never> {
  return err(
    "work-pack-invalid",
    message,
    "The otherworld's pack is damaged or was altered; ask its owner to share the world again.",
  );
}

/** Reads a pack and proves it is exactly the revision its manifest claims. */
export function unpackWork(bytes: Uint8Array): Result<WorkRevision> {
  if (bytes.length > PACK_MAX_BYTES) return refused("The pack is too large.");
  const names = validateArchiveEntryNames(bytes, "work-pack-invalid");
  if (!names.ok) return names;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (error) {
    return refused(`The pack is not a readable archive (${toError(error).message}).`);
  }
  const images: Record<string, Uint8Array> = {};
  for (const name of Object.keys(files)) {
    if (name === MANIFEST || (CODE_FILES as readonly string[]).includes(name)) continue;
    if (!WORK_ASSET_FILE.test(name)) return refused(`Unexpected entry ${name.slice(0, 120)}.`);
    images[name] = files[name] ?? new Uint8Array();
  }
  const text = (name: string): string | null => {
    const raw = files[name];
    return raw === undefined ? null : strFromU8(raw);
  };
  const [manifestText, main, style, assets] = [MANIFEST, ...CODE_FILES].map(text);
  if (manifestText == null || main == null || style == null || assets == null) {
    return refused("The pack is missing work.json or one of its code files.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    return refused("work.json is not JSON.");
  }
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) return refused(`work.json: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  const manifest = parsed.data;
  const content: WorkContent = { text: { main, style, assets }, images };
  const checked = checkContent(content);
  if (!checked.ok) return checked;
  const actual = fileList(content);
  const { files: declared, contentHash: declaredHash, ...core } = manifest;
  const byPath = (list: WorkManifest["files"]) =>
    canonicalJson([...list].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)));
  if (byPath(actual) !== byPath(declared) || workContentHash(core, actual) !== declaredHash) {
    return refused(`${manifest.workId}@${manifest.version} does not match its content hash.`);
  }
  return ok({ manifest, content });
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
  const { manifest, content } = unpacked.value;
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
    await writeFile(join(staging, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return err("work-install-failed", toError(error).message);
  }
  const check = await readRevision(dirs, manifest.workId, manifest.version);
  return check.ok ? ok({ manifest: check.value.manifest, installed: true }) : check;
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
  return packWork(revision.value);
}
