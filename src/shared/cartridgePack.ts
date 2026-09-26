// Reading a `.cartridge` (rev 6 phase 4, WP "integrity"): the pure half of main's pack module, so
// the desktop app, the world service and `verifyWorldBundle` prove a genesis pack is exactly the
// revision it claims with one piece of code. Packing stays in main (`cartridges/pack.ts`, the
// reproducible zip); every byte read here goes through ./archive, which refuses a zip bomb or an
// oversized entry from the central directory before anything is inflated.

import { strFromU8 } from "fflate";
import { type ArchiveLimits, unzipWithin } from "./archive";
import { BIBLE_FILES, type CartridgeRevision, dialogueFile, dialogueKeyOfFile } from "./cartridge";
import { CARTRIDGE_FILES_MAX, cartridgeManifestSchema } from "./cartridgeSchemas";
import { hashOrder } from "./hashOrder";
import {
  bibleIntegrity,
  cartridgeContentHash,
  fileIntegrity,
  manifestCore,
  sha256,
} from "./integrity";
import { err, ok, type Result, toError } from "./result";
import { parseStoryText, STORY_FILE, type StoryPlan } from "./story";

export const MANIFEST_FILE = "manifest.json";
export const RULES_FILE = "rules.oui";
const SCENE_ENTRY = /^scenes\/([a-z0-9][a-z0-9_-]{0,79})\.oui$/;
const SHAPE_HINT =
  "A .cartridge holds manifest.json, rules.oui, scenes/<id>.oui, dialogue/<sceneId>/<npcId>.oui and declared assets.";

const TOO_LARGE_HINT =
  "A cartridge travels as one pack of at most 32 MiB (64 MiB unpacked); ask for a smaller export.";

const MiB = 1024 * 1024;

/**
 * What a `.cartridge` may hold, checked from its central directory before anything is inflated.
 * The archive is one pack blob, so it is as large as a blob may be (P3 D9: ≤ 32 MiB); it holds the
 * manifest, the ≤ 4,098 files its integrity table lists, and a few folder entries other zip tools
 * add; no single file may inflate past a blob, and all of them together past 64 MiB.
 */
export const CARTRIDGE_PACK_LIMITS: ArchiveLimits = {
  archiveBytes: 32 * MiB,
  entries: CARTRIDGE_FILES_MAX + 64,
  entryBytes: 32 * MiB,
  totalBytes: 64 * MiB,
};

const PACK_CODES = {
  directory: "cartridge-pack-duplicate",
  unreadable: "cartridge-pack-unreadable",
  tooLarge: "cartridge-pack-too-large",
};

function unsafeEntry(name: string): boolean {
  return (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.split(/[\\/]/).some((segment) => segment === "..")
  );
}

/**
 * Reads a `.cartridge` and proves it is exactly the revision its manifest claims: within the pack
 * limits, no extra or traversing entries, every declared scene present, every file hash and the
 * root hash matching.
 */
export function unpackCartridge(bytes: Uint8Array): Result<CartridgeRevision> {
  const unzipped = unzipWithin(bytes, CARTRIDGE_PACK_LIMITS, PACK_CODES);
  if (!unzipped.ok) {
    const { code, message } = unzipped.error;
    if (code === PACK_CODES.unreadable) {
      return err(
        code,
        "That file is not a readable .cartridge archive.",
        `Export it again from UNMAPPED. (${message})`,
      );
    }
    return code === PACK_CODES.tooLarge ? err(code, message, TOO_LARGE_HINT) : err(code, message);
  }
  const sceneSources = new Map<string, string>();
  const dialogueSources = new Map<string, string>();
  const assets = new Map<string, Uint8Array>();
  let manifestText: string | null = null;
  let rules: string | null = null;
  const bibleText = new Map<string, string>();
  let storyRaw: string | null = null;
  for (const { name, bytes: raw } of unzipped.value) {
    if (unsafeEntry(name)) {
      return err("cartridge-pack-unsafe", `Refusing archive entry ${name}.`, SHAPE_HINT);
    }
    if (name.endsWith("/")) {
      if (
        name !== "scenes/" &&
        name !== "bible/" &&
        !name.startsWith("assets/") &&
        !name.startsWith("dialogue/")
      ) {
        return err("cartridge-pack-unknown-file", `Unexpected entry ${name}.`, SHAPE_HINT);
      }
      continue;
    }
    if (name === MANIFEST_FILE) manifestText = strFromU8(raw);
    else if (name === RULES_FILE) rules = strFromU8(raw);
    else if (name === BIBLE_FILES.core || name === BIBLE_FILES.style) {
      bibleText.set(name, strFromU8(raw));
    } else if (name === STORY_FILE) {
      storyRaw = strFromU8(raw);
    } else if (name.startsWith("assets/")) {
      const relative = name.slice("assets/".length);
      if (!/^[a-z0-9][a-z0-9_./-]{0,239}$/.test(relative) || relative.includes("..")) {
        return err("cartridge-pack-unsafe", `Refusing archive entry ${name}.`, SHAPE_HINT);
      }
      assets.set(relative, raw);
    } else if (name.startsWith("dialogue/")) {
      const key = dialogueKeyOfFile(name);
      if (key === null) {
        return err("cartridge-pack-unsafe", `Refusing archive entry ${name}.`, SHAPE_HINT);
      }
      dialogueSources.set(key, strFromU8(raw));
    } else {
      const match = SCENE_ENTRY.exec(name);
      if (match?.[1] === undefined) {
        return err("cartridge-pack-unknown-file", `Unexpected entry ${name}.`, SHAPE_HINT);
      }
      sceneSources.set(match[1], strFromU8(raw));
    }
  }
  if (manifestText === null || rules === null) {
    return err("cartridge-pack-incomplete", "manifest.json or rules.oui is missing.", SHAPE_HINT);
  }
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestText);
  } catch (error) {
    return err("cartridge-manifest-invalid", `manifest.json: ${toError(error).message}`);
  }
  const parsed = cartridgeManifestSchema.safeParse(rawManifest);
  if (!parsed.success) {
    return err(
      "cartridge-manifest-invalid",
      parsed.error.issues[0]?.message ?? "Invalid manifest",
      SHAPE_HINT,
    );
  }
  const manifest = parsed.data;
  const declared = [
    ...(manifest.formatVersion === 1
      ? manifest.scenes.map((scene) => scene.id)
      : manifest.definition.scenePlan.orderedSceneIds),
  ].sort();
  const supplied = [...sceneSources.keys()].sort();
  if (JSON.stringify(declared) !== JSON.stringify(supplied)) {
    return err(
      "cartridge-pack-incomplete",
      "The scenes in the archive do not match the manifest's scene catalog.",
      SHAPE_HINT,
    );
  }
  const scenes: Record<string, string> = {};
  const files = [fileIntegrity(RULES_FILE, rules)];
  for (const id of declared) {
    const source = sceneSources.get(id) ?? "";
    scenes[id] = source;
    files.push(fileIntegrity(`scenes/${id}.oui`, source));
  }
  const dialogues: Record<string, string> = {};
  for (const key of [...dialogueSources.keys()].sort()) {
    const source = dialogueSources.get(key) ?? "";
    dialogues[key] = source;
    files.push(fileIntegrity(dialogueFile(key), source));
  }
  const packedAssets: Record<string, Uint8Array> = {};
  for (const [path, raw] of [...assets].sort(([a], [b]) => hashOrder(a, b))) {
    packedAssets[path] = raw;
    files.push({ path: `assets/${path}`, bytes: raw.byteLength, contentHash: sha256(raw) });
  }
  const core = bibleText.get(BIBLE_FILES.core);
  const style = bibleText.get(BIBLE_FILES.style);
  if ((core === undefined) !== (style === undefined)) {
    return err(
      "cartridge-pack-incomplete",
      "The world bible is missing one of its files.",
      SHAPE_HINT,
    );
  }
  const bible = core === undefined || style === undefined ? null : { core, style };
  files.push(...bibleIntegrity(bible));
  let story: StoryPlan | null = null;
  if (storyRaw !== null) {
    const read = parseStoryText(storyRaw);
    if (!read.ok) return read;
    story = read.value;
    files.push(fileIntegrity(STORY_FILE, storyRaw));
  }
  files.sort((a, b) => hashOrder(a.path, b.path));
  const declaredFiles = [...manifest.files].sort((a, b) => hashOrder(a.path, b.path));
  const hash = cartridgeContentHash(manifestCore(manifest), files);
  if (JSON.stringify(files) !== JSON.stringify(declaredFiles) || hash !== manifest.contentHash) {
    return err(
      "cartridge-integrity-failed",
      `${manifest.cartridgeId}@${manifest.version} does not match its content hash.`,
      "The archive was modified after export; ask for a fresh export.",
    );
  }
  return ok({ manifest, rules, scenes, dialogues, assets: packedAssets, bible, story });
}
