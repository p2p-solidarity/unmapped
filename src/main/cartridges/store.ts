import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BIBLE_FILES,
  type CartridgeManifest,
  type CartridgeRevision,
  dialogueKeyOfFile,
  type PublishCartridgeInput,
  type WorldBible,
} from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import {
  cartridgeContentHash,
  fileIntegrity,
  manifestCore,
  runtimePinForManifest,
  sha256,
} from "./integrity";
import {
  cartridgeDir,
  cartridgeRevisionDir,
  cartridgeScenePath,
  isCartridgeId,
  isCartridgeVersion,
  isSceneId,
} from "./paths";
import { listRevisionFiles, writeRevisionFiles } from "./revision-files";
import { cartridgeManifestSchema } from "./schemas";
import {
  bibleIntegrity,
  cartridgeCompatibility,
  exists,
  MANIFEST_FILE,
  prepare,
  RULES_FILE,
  validateIdentity,
} from "./validate-revision";

export { cartridgeCompatibility };

export async function publishCartridgeRevision(
  cartridgesDir: string,
  input: PublishCartridgeInput,
): Promise<Result<CartridgeManifest>> {
  const prepared = prepare(input);
  if (!prepared.ok) return prepared;
  const revision = prepared.value;
  const { cartridgeId, version, contentHash } = revision.manifest;
  const destination = cartridgeRevisionDir(cartridgesDir, cartridgeId, version);
  if (await exists(destination)) {
    const existing = await readCartridgeRevision(cartridgesDir, cartridgeId, version);
    if (existing.ok && existing.value.manifest.contentHash === contentHash) {
      return ok(existing.value.manifest);
    }
    return err(
      "cartridge-version-conflict",
      `${cartridgeId}@${version} already exists with different content.`,
      "Publish a new SemVer; immutable revisions are never overwritten.",
    );
  }
  const written = await writeRevisionFiles(destination, revision);
  if (written.ok) return ok(revision.manifest);
  // Someone published the same revision a moment earlier: identical bytes are not a conflict.
  const raced = await readCartridgeRevision(cartridgesDir, cartridgeId, version);
  return raced.ok && raced.value.manifest.contentHash === contentHash
    ? ok(raced.value.manifest)
    : written;
}

export async function readCartridgeRevision(
  cartridgesDir: string,
  cartridgeId: string,
  version: string,
): Promise<Result<CartridgeRevision>> {
  const identity = validateIdentity(cartridgeId, version);
  if (!identity.ok) return identity;
  const revisionDir = cartridgeRevisionDir(cartridgesDir, cartridgeId, version);
  try {
    const rawManifest: unknown = JSON.parse(
      await readFile(join(revisionDir, MANIFEST_FILE), "utf8"),
    );
    const parsed = cartridgeManifestSchema.safeParse(rawManifest);
    if (!parsed.success) {
      return err(
        "cartridge-manifest-invalid",
        parsed.error.issues[0]?.message ?? "Invalid manifest",
        "Reinstall this cartridge revision.",
      );
    }
    const manifest = parsed.data;
    if (manifest.cartridgeId !== cartridgeId || manifest.version !== version) {
      return err(
        "cartridge-identity-mismatch",
        "The manifest identity does not match its directory.",
        "Reinstall this cartridge revision.",
      );
    }
    const rules = await readFile(join(revisionDir, RULES_FILE), "utf8");
    const sceneIds =
      manifest.formatVersion === 1
        ? manifest.scenes.map((scene) => scene.id)
        : manifest.definition.scenePlan.orderedSceneIds;
    const scenes: Record<string, string> = {};
    for (const id of sceneIds) {
      if (!isSceneId(id)) return err("cartridge-scene-invalid", `Invalid scene id: ${id}`);
      scenes[id] = await readFile(cartridgeScenePath(revisionDir, id), "utf8");
    }
    const files = [fileIntegrity(RULES_FILE, rules)];
    for (const id of [...sceneIds].sort()) {
      files.push(fileIntegrity(`scenes/${id}.oui`, scenes[id] ?? ""));
    }
    const dialogues: Record<string, string> = {};
    for (const declaredFile of manifest.files) {
      const key = dialogueKeyOfFile(declaredFile.path);
      if (key === null) continue;
      const source = await readFile(join(revisionDir, declaredFile.path), "utf8");
      dialogues[key] = source;
      files.push(fileIntegrity(declaredFile.path, source));
    }
    const assets: Record<string, Uint8Array> = {};
    for (const declaredFile of manifest.files) {
      if (!declaredFile.path.startsWith("assets/")) continue;
      const relative = declaredFile.path.slice("assets/".length);
      if (!/^[a-z0-9][a-z0-9_./-]{0,239}$/.test(relative) || relative.includes("..")) {
        return err("cartridge-asset-path-invalid", `Unsafe asset path: ${relative}`);
      }
      const bytes = await readFile(join(revisionDir, declaredFile.path));
      assets[relative] = bytes;
      files.push({ path: declaredFile.path, bytes: bytes.byteLength, contentHash: sha256(bytes) });
    }
    let bible: WorldBible | null = null;
    if (manifest.files.some((file) => file.path === BIBLE_FILES.core)) {
      bible = {
        core: await readFile(join(revisionDir, BIBLE_FILES.core), "utf8"),
        style: await readFile(join(revisionDir, BIBLE_FILES.style), "utf8"),
      };
      files.push(...bibleIntegrity(bible));
    }
    const declared = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
    const actualIntegrity = [...files].sort((a, b) => a.path.localeCompare(b.path));
    const expectedPaths = [MANIFEST_FILE, ...actualIntegrity.map((file) => file.path)].sort();
    const actualPaths = await listRevisionFiles(revisionDir);
    const hash = cartridgeContentHash(manifestCore(manifest), actualIntegrity);
    if (
      JSON.stringify(actualIntegrity) !== JSON.stringify(declared) ||
      hash !== manifest.contentHash
    ) {
      return err(
        "cartridge-integrity-failed",
        `${cartridgeId}@${version} does not match its content hash.`,
        "Reinstall the cartridge; published files must not be edited.",
      );
    }
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
      return err(
        "cartridge-files-invalid",
        `${cartridgeId}@${version} contains undeclared files.`,
        "Reinstall the cartridge from a trusted package.",
      );
    }
    const pin = runtimePinForManifest(manifest);
    if (!pin.ok) return pin;
    return ok({ manifest, rules, scenes, dialogues, assets, bible });
  } catch (error) {
    return fail(toError(error, "cartridge-read-failed"));
  }
}

export async function listCartridgeRevisions(
  cartridgesDir: string,
): Promise<Result<CartridgeManifest[]>> {
  if (!(await exists(cartridgesDir))) return ok([]);
  try {
    const manifests: CartridgeManifest[] = [];
    const cartridges = await readdir(cartridgesDir, { withFileTypes: true });
    for (const cartridge of cartridges) {
      if (!cartridge.isDirectory() || !isCartridgeId(cartridge.name)) continue;
      const versions = await readdir(cartridgeDir(cartridgesDir, cartridge.name), {
        withFileTypes: true,
      });
      for (const version of versions) {
        if (!version.isDirectory() || !isCartridgeVersion(version.name)) continue;
        const revision = await readCartridgeRevision(cartridgesDir, cartridge.name, version.name);
        if (!revision.ok) return revision;
        manifests.push(revision.value.manifest);
      }
    }
    manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return ok(manifests);
  } catch (error) {
    return fail(toError(error, "cartridge-list-failed"));
  }
}
