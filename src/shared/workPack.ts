// Reading an AI-world pack (rev 6 phase 3, D10; phase 4, D5): the pure half of main's
// `works/pack.ts`, so the desktop app, the world service and `verifyWorldBundle` prove a work pack
// is exactly the revision it claims with one piece of code. Packing stays in main (the reproducible
// zip); every byte read here goes through ./archive, which refuses a zip bomb or an oversized entry
// from the central directory before anything is inflated.
//
// A pack holds `work.json` (canonical JSON), main.js, style.css, assets.json, the world's own
// images, and — for a revision published since phase 4 — the main-owned `licences.json` that names
// each picture's licence (D4). The content hash covers the content files only, never the licences.
//
// `contentFiles`, `workContentHash` and `checkContent` moved here from `main/works/store.ts`
// unchanged (it re-exports them), so every revision published before keeps its content hash.

import { strFromU8 } from "fflate";
import { z } from "zod";
import { type ArchiveLimits, unzipWithin } from "./archive";
import { canonicalJson } from "./canonical";
import type { CartridgeFileIntegrity, ContentHash } from "./cartridge";
import { hashOrder } from "./hashOrder";
import { LICENCES_FILE, type LicenceFile, parseLicenceFile } from "./images";
import { sha256 } from "./integrity";
import { err, ok, type Result } from "./result";
import {
  assetMapSchema,
  WORK_ASSET_FILE,
  WORK_CODE_FILES,
  WORK_FORMAT,
  WORK_FORMAT_VERSION,
  WORK_HOST_API,
  WORK_ID,
  WORK_LIMITS,
  type WorkManifest,
  type WorkManifestCore,
  type WorkText,
} from "./works";

export const WORK_PACK_MANIFEST = "work.json";

const KiB = 1024;
const MiB = 1024 * KiB;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
/** work.json and licences.json: a few dozen file entries each, far below this. */
const SIDE_FILE_BYTES = 256 * KiB;

/**
 * What a work pack may hold, checked from its central directory before anything is inflated: one
 * pack blob (≤ 32 MiB), the manifest, the three code files, the images the limits allow, the
 * licences, and each file within what `checkContent` would accept anyway.
 */
export const WORK_PACK_LIMITS: ArchiveLimits = {
  archiveBytes: 32 * MiB,
  entries: WORK_LIMITS.assetCount + WORK_CODE_FILES.length + 2,
  entryBytes: Math.max(WORK_LIMITS.codeBytes, WORK_LIMITS.assetBytes, SIDE_FILE_BYTES),
  totalBytes:
    WORK_CODE_FILES.length * WORK_LIMITS.codeBytes +
    WORK_LIMITS.totalAssetBytes +
    2 * SIDE_FILE_BYTES,
};

const PACK_CODES = {
  directory: "work-pack-invalid",
  unreadable: "work-pack-invalid",
  tooLarge: "work-pack-too-large",
};

/** A world's files as stored: the three text files plus its own images. */
export interface WorkContent {
  text: WorkText;
  images: Record<string, Uint8Array>;
}

export function contentFiles(content: WorkContent): Array<[string, Uint8Array | string]> {
  return [
    ["main.js", content.text.main],
    ["style.css", content.text.style],
    ["assets.json", content.text.assets],
    ...Object.entries(content.images),
  ];
}

export function workContentHash(
  core: WorkManifestCore,
  files: CartridgeFileIntegrity[],
): ContentHash {
  const sorted = [...files].sort((a, b) => hashOrder(a.path, b.path));
  return sha256(canonicalJson({ manifest: core, files: sorted }));
}

/** Every rule a stored world must satisfy, applied again on every read (files can be edited). */
export function checkContent(content: WorkContent): Result<void> {
  for (const [path, bytes] of contentFiles(content)) {
    const size = typeof bytes === "string" ? new TextEncoder().encode(bytes).length : bytes.length;
    const limit = typeof bytes === "string" ? WORK_LIMITS.codeBytes : WORK_LIMITS.assetBytes;
    if (size > limit) return err("work-too-large", `${path} is ${size} bytes (limit ${limit}).`);
  }
  const images = Object.entries(content.images);
  if (images.length > WORK_LIMITS.assetCount) return err("work-too-large", "Too many images.");
  const total = images.reduce((sum, [, bytes]) => sum + bytes.length, 0);
  if (total > WORK_LIMITS.totalAssetBytes) return err("work-too-large", "Images exceed 6 MB.");
  for (const [path] of images) {
    if (!WORK_ASSET_FILE.test(path))
      return err("work-invalid", `${path} is not an allowed image path.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.text.assets);
  } catch {
    return err("work-invalid", "assets.json is not valid JSON.");
  }
  const assets = assetMapSchema.safeParse(parsed);
  if (!assets.success) return err("work-invalid", "assets.json does not match the asset map.");
  for (const entry of Object.values(assets.data)) {
    if (entry.src?.startsWith("assets/") && content.images[entry.src] === undefined) {
      return err("work-invalid", `assets.json points at ${entry.src}, which is not in this world.`);
    }
  }
  return ok(undefined);
}

const hash = z.custom<ContentHash>((value) => typeof value === "string" && HASH.test(value));
const refSchema = z.strictObject({
  workId: z.string().regex(WORK_ID),
  version: z.string().regex(SEMVER),
  contentHash: hash,
});

/** Strict: a received manifest carries nothing a published one would not. */
export const workManifestSchema: z.ZodType<WorkManifest> = z.strictObject({
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
    .max(WORK_LIMITS.assetCount + WORK_CODE_FILES.length),
  contentHash: hash,
});

/** A pack read and proved: the revision, and its pictures' licences when it carries them. */
export interface UnpackedWork {
  manifest: WorkManifest;
  content: WorkContent;
  licences: LicenceFile | null;
}

function refused(message: string): Result<never> {
  return err(
    "work-pack-invalid",
    message,
    "The otherworld's pack is damaged or was altered; ask its owner to share the world again.",
  );
}

function fileList(content: WorkContent): WorkManifest["files"] {
  return contentFiles(content).map(([path, bytes]) =>
    typeof bytes === "string"
      ? { path, bytes: new TextEncoder().encode(bytes).length, contentHash: sha256(bytes) }
      : { path, bytes: bytes.length, contentHash: sha256(bytes) },
  );
}

/** Reads a pack and proves it is exactly the revision its manifest claims. */
export function readWorkPack(bytes: Uint8Array): Result<UnpackedWork> {
  const unzipped = unzipWithin(bytes, WORK_PACK_LIMITS, PACK_CODES);
  if (!unzipped.ok) {
    return unzipped.error.code === PACK_CODES.tooLarge
      ? err(unzipped.error.code, unzipped.error.message, "The otherworld's pack is too large.")
      : refused(unzipped.error.message);
  }
  const files = new Map(unzipped.value.map((file) => [file.name, file.bytes]));
  const images: Record<string, Uint8Array> = {};
  for (const [name, raw] of files) {
    if (name === WORK_PACK_MANIFEST || name === LICENCES_FILE) continue;
    if ((WORK_CODE_FILES as readonly string[]).includes(name)) continue;
    if (!WORK_ASSET_FILE.test(name)) return refused(`Unexpected entry ${name.slice(0, 120)}.`);
    images[name] = raw;
  }
  const text = (name: string): string | null => {
    const raw = files.get(name);
    return raw === undefined ? null : strFromU8(raw);
  };
  const [manifestText, main, style, assets] = [WORK_PACK_MANIFEST, ...WORK_CODE_FILES].map(text);
  if (manifestText == null || main == null || style == null || assets == null) {
    return refused("The pack is missing work.json or one of its code files.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(manifestText);
  } catch {
    return refused("work.json is not JSON.");
  }
  const parsed = workManifestSchema.safeParse(raw);
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
  const licenceText = text(LICENCES_FILE);
  const licences = licenceText === null ? null : parseLicenceFile(licenceText);
  if (licenceText !== null && licences === null) return refused("licences.json does not read.");
  const wrong = licences === null ? null : licenceMismatch(licences, images);
  if (wrong !== null) return refused(`licences.json names ${wrong.slice(0, 120)} wrongly.`);
  return ok({ manifest, content, licences });
}

/** Only the entries that name a picture of `images` with exactly its hash (what a pack carries). */
export function matchingLicences(
  licences: LicenceFile,
  images: Readonly<Record<string, Uint8Array>>,
): LicenceFile {
  const pictures: LicenceFile["pictures"] = {};
  for (const [path, entry] of Object.entries(licences.pictures)) {
    const bytes = images[path];
    if (bytes !== undefined && sha256(bytes) === entry.sha256) pictures[path] = entry;
  }
  return { v: 1, pictures };
}

/**
 * The first picture `licences.json` names that is not in the pack with exactly that hash, or null.
 * Publishing writes it from the same pictures the content hash seals, so any difference means the
 * pack was altered; a picture with no entry is simply `unknown` (a revision from before D4).
 */
export function licenceMismatch(
  licences: LicenceFile,
  images: Readonly<Record<string, Uint8Array>>,
): string | null {
  for (const [path, entry] of Object.entries(licences.pictures)) {
    const bytes = images[path];
    if (bytes === undefined || sha256(bytes) !== entry.sha256) return path;
  }
  return null;
}
