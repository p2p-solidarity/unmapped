// A `.cartridge` is a content-only zip of one immutable revision: manifest.json, rules.oui and
// scenes/<id>.oui — never a save (plan §一: sharing a cartridge never carries progress). Pure
// fflate + hash logic; the OS dialogs live in ./ipc.ts.

import {
  BIBLE_FILES,
  type CartridgeRevision,
  dialogueFile,
  dialogueKeyOfFile,
} from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { parseStoryText, STORY_FILE, type StoryPlan, storyText } from "@shared/story";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { validateArchiveEntryNames } from "../archive";
import { cartridgeContentHash, fileIntegrity, manifestCore, sha256 } from "./integrity";
import { cartridgeManifestSchema } from "./schemas";
import { bibleIntegrity } from "./validate-revision";

const MANIFEST_FILE = "manifest.json";
const RULES_FILE = "rules.oui";
const SCENE_ENTRY = /^scenes\/([a-z0-9][a-z0-9_-]{0,79})\.oui$/;
const ZIP_LEVEL = 6;
const SHAPE_HINT =
  "A .cartridge holds manifest.json, rules.oui, scenes/<id>.oui, dialogue/<sceneId>/<npcId>.oui and declared assets.";

export function packCartridge(revision: CartridgeRevision): Result<Uint8Array> {
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_FILE]: strToU8(`${JSON.stringify(revision.manifest, null, 2)}\n`),
    [RULES_FILE]: strToU8(revision.rules),
  };
  const sceneIds =
    revision.manifest.formatVersion === 1
      ? revision.manifest.scenes.map((scene) => scene.id)
      : revision.manifest.definition.scenePlan.orderedSceneIds;
  for (const sceneId of sceneIds) {
    const source = revision.scenes[sceneId];
    if (source === undefined) {
      return err("cartridge-scenes-mismatch", `Scene ${sceneId} has no source to pack.`);
    }
    entries[`scenes/${sceneId}.oui`] = strToU8(source);
  }
  for (const [key, source] of Object.entries(revision.dialogues)) {
    entries[dialogueFile(key)] = strToU8(source);
  }
  for (const [path, bytes] of Object.entries(revision.assets)) entries[`assets/${path}`] = bytes;
  if (revision.bible !== null) {
    entries[BIBLE_FILES.core] = strToU8(revision.bible.core);
    entries[BIBLE_FILES.style] = strToU8(revision.bible.style);
  }
  if (revision.story !== null && revision.story !== undefined) {
    entries[STORY_FILE] = strToU8(storyText(revision.story));
  }
  try {
    return ok(zipSync(entries, { level: ZIP_LEVEL }));
  } catch (error) {
    return fail(toError(error, "cartridge-pack-failed"));
  }
}

function unsafeEntry(name: string): boolean {
  return (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.split(/[\\/]/).some((segment) => segment === "..")
  );
}

/**
 * Reads a `.cartridge` and proves it is exactly the revision its manifest claims: no extra or
 * traversing entries, every declared scene present, every file hash and the root hash matching.
 */
export function unpackCartridge(bytes: Uint8Array): Result<CartridgeRevision> {
  const names = validateArchiveEntryNames(bytes, "cartridge-pack-duplicate");
  if (!names.ok) return names;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    return err(
      "cartridge-pack-unreadable",
      "That file is not a readable .cartridge archive.",
      `Export it again from UNMAPPED. (${toError(error).message})`,
    );
  }
  const sceneSources = new Map<string, string>();
  const dialogueSources = new Map<string, string>();
  const assets = new Map<string, Uint8Array>();
  let manifestText: string | null = null;
  let rules: string | null = null;
  const bibleText = new Map<string, string>();
  let storyRaw: string | null = null;
  for (const [name, raw] of Object.entries(unzipped)) {
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
  for (const [path, bytes] of [...assets].sort(([a], [b]) => a.localeCompare(b))) {
    packedAssets[path] = bytes;
    files.push({ path: `assets/${path}`, bytes: bytes.byteLength, contentHash: sha256(bytes) });
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
    const parsed = parseStoryText(storyRaw);
    if (!parsed.ok) return parsed;
    story = parsed.value;
    files.push(fileIntegrity(STORY_FILE, storyRaw));
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const declaredFiles = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
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
