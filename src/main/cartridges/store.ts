import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseRules, parseScene } from "@dsl/index";
import type {
  CartridgeFileIntegrity,
  CartridgeManifest,
  CartridgeManifestCore,
  CartridgeRevision,
  PublishCartridgeInput,
} from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { cartridgeContentHash, fileIntegrity } from "./integrity";
import {
  cartridgeDir,
  cartridgeRevisionDir,
  cartridgeScenePath,
  isCartridgeId,
  isCartridgeVersion,
  isSceneId,
} from "./paths";
import { cartridgeManifestCoreSchema, cartridgeManifestSchema } from "./schemas";

const MANIFEST_FILE = "manifest.json";
const RULES_FILE = "rules.oui";

function normaliseSource(source: string): string {
  const lf = source.replace(/\r\n?/g, "\n").replace(/\n*$/, "");
  return `${lf}\n`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function validateIdentity(cartridgeId: string, version: string): Result<void> {
  if (!isCartridgeId(cartridgeId)) {
    return err(
      "cartridge-id-invalid",
      `Invalid cartridge id: ${cartridgeId}`,
      "Use lowercase letters, digits, and hyphens.",
    );
  }
  if (!isCartridgeVersion(version)) {
    return err(
      "cartridge-version-invalid",
      `Invalid cartridge version: ${version}`,
      "Use a strict SemVer such as 1.0.0.",
    );
  }
  return ok(undefined);
}

function prepare(input: PublishCartridgeInput): Result<CartridgeRevision> {
  const parsed = cartridgeManifestCoreSchema.safeParse(input.manifest);
  if (!parsed.success) {
    return err(
      "cartridge-manifest-invalid",
      parsed.error.issues[0]?.message ?? "Invalid manifest",
      "Fix the cartridge manifest before publishing.",
    );
  }
  const manifest = parsed.data;
  const identity = validateIdentity(manifest.cartridgeId, manifest.version);
  if (!identity.ok) return identity;

  const ids = manifest.scenes.map((scene) => scene.id);
  if (new Set(ids).size !== ids.length || ids.some((id) => !isSceneId(id))) {
    return err(
      "cartridge-scenes-invalid",
      "Scene ids must be unique safe identifiers.",
      "Use lowercase letters, digits, underscores, or hyphens.",
    );
  }
  if (!ids.includes(manifest.entrySceneId)) {
    return err(
      "cartridge-entry-missing",
      `Entry scene ${manifest.entrySceneId} is not declared.`,
      "Choose one of the manifest scene ids.",
    );
  }
  const sourceIds = Object.keys(input.scenes).sort();
  const declaredIds = [...ids].sort();
  const storyIds = manifest.story.scenes.map((scene) => scene.id).sort();
  if (JSON.stringify(storyIds) !== JSON.stringify(declaredIds)) {
    return err(
      "cartridge-story-mismatch",
      "The story outline and scene catalog must describe the same scene ids.",
    );
  }
  if (JSON.stringify(sourceIds) !== JSON.stringify(declaredIds)) {
    return err(
      "cartridge-scenes-mismatch",
      "Declared scenes and supplied scene sources do not match.",
      "Supply exactly one source for every declared scene id.",
    );
  }
  if (input.rules.trim().length === 0) {
    return err(
      "cartridge-rules-empty",
      "rules.oui is empty.",
      "A cartridge must declare its gameplay rules.",
    );
  }

  const rules = normaliseSource(input.rules);
  const parsedRules = parseRules(rules);
  if (!parsedRules.ok) {
    return err(
      "cartridge-rules-invalid",
      `rules.oui could not be parsed: ${parsedRules.error.message}`,
      parsedRules.error.hint,
    );
  }
  const declaredRuleKits = new Set(parsedRules.value.kits.map((kit) => kit.id));
  if (manifest.requiredKits.some((kit) => !declaredRuleKits.has(kit))) {
    return err(
      "cartridge-kit-missing",
      "The manifest requires a gameplay kit that rules.oui does not configure.",
      "Declare every required kit exactly once in rules.oui.",
    );
  }
  const scenes: Record<string, string> = {};
  const targets = new Map<string, string[]>();
  const terminalScenes = new Set<string>();
  for (const id of ids) {
    const source = normaliseSource(input.scenes[id] ?? "");
    const scene = parseScene(source);
    if (!scene.ok) {
      return err(
        "cartridge-scene-invalid",
        `${id}.oui could not be parsed: ${scene.error.message}`,
        scene.error.hint,
      );
    }
    const contract = scene.value.contract;
    if (contract === null || contract.sceneId !== id) {
      return err(
        "cartridge-contract-invalid",
        `${id}.oui must declare Contract("${id}", ...).`,
        "A published scene needs one stable contract matching its manifest id.",
      );
    }
    if (!manifest.requiredKits.includes(contract.kit) || !declaredRuleKits.has(contract.kit)) {
      return err(
        "cartridge-kit-missing",
        `${id}.oui selects unavailable kit ${contract.kit}.`,
        "Add the kit to manifest.requiredKits and configure it in rules.oui.",
      );
    }
    const exits: string[] = [];
    let endingGates = 0;
    for (const exit of scene.value.exits) {
      if (exit.targetSceneId === null) {
        // An Exit with no target is the ending gate: allowed only where the contract is terminal.
        if (!contract.terminal) {
          return err(
            "cartridge-route-invalid",
            `${id}.oui has an exit without a declared target scene.`,
            "Set Exit.targetSceneId to one of the manifest scene ids.",
          );
        }
        endingGates += 1;
        continue;
      }
      if (!ids.includes(exit.targetSceneId)) {
        return err(
          "cartridge-route-invalid",
          `${id}.oui exits to undeclared scene ${exit.targetSceneId}.`,
          "Set Exit.targetSceneId to one of the manifest scene ids.",
        );
      }
      exits.push(exit.targetSceneId);
    }
    if (contract.terminal && endingGates === 0) {
      return err(
        "cartridge-ending-missing",
        `${id}.oui is terminal but has no ending gate.`,
        "Give the finale one Exit with no targetSceneId; reaching it completes the cartridge.",
      );
    }
    targets.set(id, exits);
    if (contract.terminal) terminalScenes.add(id);
    scenes[id] = source;
  }
  if (!canReachTerminal(manifest.entrySceneId, targets, terminalScenes)) {
    return err(
      "cartridge-route-invalid",
      "No terminal scene is reachable from the entry scene.",
      "Connect the scene contracts with stable Exit.targetSceneId values.",
    );
  }
  const files: CartridgeFileIntegrity[] = [fileIntegrity(RULES_FILE, rules)];
  for (const id of [...ids].sort()) files.push(fileIntegrity(`scenes/${id}.oui`, scenes[id] ?? ""));
  const contentHash = cartridgeContentHash(manifest, files);
  return ok({ manifest: { ...manifest, contentHash, files }, rules, scenes });
}

function canReachTerminal(
  entry: string,
  targets: ReadonlyMap<string, string[]>,
  terminals: ReadonlySet<string>,
): boolean {
  const pending = [entry];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || seen.has(id)) continue;
    if (terminals.has(id)) return true;
    seen.add(id);
    pending.push(...(targets.get(id) ?? []));
  }
  return false;
}

function manifestCore(manifest: CartridgeManifest): CartridgeManifestCore {
  const { contentHash: _contentHash, files: _files, ...core } = manifest;
  return core;
}

async function writeRevision(
  destination: string,
  revision: CartridgeRevision,
): Promise<Result<void>> {
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const staging = join(
    parent,
    `.staging-${revision.manifest.version}-${process.pid}-${Date.now()}`,
  );
  try {
    await mkdir(join(staging, "scenes"), { recursive: true });
    await writeFile(
      join(staging, MANIFEST_FILE),
      `${JSON.stringify(revision.manifest, null, 2)}\n`,
      "utf8",
    );
    await writeFile(join(staging, RULES_FILE), revision.rules, "utf8");
    for (const [id, source] of Object.entries(revision.scenes)) {
      await writeFile(cartridgeScenePath(staging, id), source, "utf8");
    }
    await rename(staging, destination);
    return ok(undefined);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "cartridge-publish-failed"));
  }
}

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
  const written = await writeRevision(destination, revision);
  return written.ok ? ok(revision.manifest) : written;
}

async function listActualFiles(revisionDir: string): Promise<string[]> {
  const root = (await readdir(revisionDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const sceneEntries = await readdir(join(revisionDir, "scenes"), { withFileTypes: true });
  return [
    ...root,
    ...sceneEntries.filter((entry) => entry.isFile()).map((entry) => `scenes/${entry.name}`),
  ].sort();
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
    const scenes: Record<string, string> = {};
    for (const scene of manifest.scenes) {
      if (!isSceneId(scene.id))
        return err("cartridge-scene-invalid", `Invalid scene id: ${scene.id}`);
      scenes[scene.id] = await readFile(cartridgeScenePath(revisionDir, scene.id), "utf8");
    }
    const files = [fileIntegrity(RULES_FILE, rules)];
    for (const id of manifest.scenes.map((scene) => scene.id).sort()) {
      files.push(fileIntegrity(`scenes/${id}.oui`, scenes[id] ?? ""));
    }
    const declared = [...manifest.files].sort((a, b) => a.path.localeCompare(b.path));
    const expectedPaths = [MANIFEST_FILE, ...files.map((file) => file.path)].sort();
    const actualPaths = await listActualFiles(revisionDir);
    const hash = cartridgeContentHash(manifestCore(manifest), files);
    if (JSON.stringify(files) !== JSON.stringify(declared) || hash !== manifest.contentHash) {
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
    return ok({ manifest, rules, scenes });
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
