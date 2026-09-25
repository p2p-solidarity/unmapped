// Publish-time validation of a cartridge revision: everything `prepare()` checks before a single
// byte is written — manifest identity, scene set agreement, rules and scene parsing, kit and asset
// references, route reachability, and the content hash that becomes the revision's identity.
//
// Split out of store.ts, which keeps only the filesystem half (publish, read, list). Validation
// is pure apart from hashing, so it can be read and changed without touching any I/O.

import { stat } from "node:fs/promises";
import { parseRules, parseScene } from "@dsl/index";
import { assetsForScene, builtinAssetPack, validateAssetRef } from "@shared/assets";
import type {
  CartridgeFileIntegrity,
  CartridgeManifest,
  CartridgeRevision,
  PublishCartridgeInput,
  WorldBible,
} from "@shared/cartridge";
import {
  BIBLE_FILES,
  BIBLE_MAX_CHARS,
  ENGINE_API_VERSION,
  SAVE_SCHEMA_VERSION,
} from "@shared/cartridge";
import { kitFor } from "@shared/forge";
import type { SceneContract } from "@shared/gameplay";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { prepareDialogues } from "./dialogue-files";
import { cartridgeContentHash, fileIntegrity, runtimePinForManifest, sha256 } from "./integrity";
import { isCartridgeId, isCartridgeVersion, isSceneId } from "./paths";
import { reachableScenes } from "./routes";
import { cartridgeManifestCoreSchema } from "./schemas";

export const MANIFEST_FILE = "manifest.json";
export const RULES_FILE = "rules.oui";

export function normaliseSource(source: string): string {
  const lf = source.replace(/\r\n?/g, "\n").replace(/\n*$/, "");
  return `${lf}\n`;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export function validateIdentity(cartridgeId: string, version: string): Result<void> {
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

export function cartridgeCompatibility(manifest: CartridgeManifest): Result<void> {
  if (manifest.engineApiVersion > ENGINE_API_VERSION) {
    return err(
      "cartridge-engine-unsupported",
      `${manifest.cartridgeId}@${manifest.version} needs engine API ${manifest.engineApiVersion}; this build has ${ENGINE_API_VERSION}.`,
      "Update Unwritten Land to play this cartridge.",
    );
  }
  if (manifest.saveSchemaVersion !== SAVE_SCHEMA_VERSION) {
    return err(
      "cartridge-save-unsupported",
      `${manifest.cartridgeId}@${manifest.version} needs save schema ${manifest.saveSchemaVersion}; this build has ${SAVE_SCHEMA_VERSION}.`,
      "Use a compatible Unwritten Land build to play this cartridge.",
    );
  }
  return ok(undefined);
}

export function prepare(input: PublishCartridgeInput): Result<CartridgeRevision> {
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

  const v2 = manifest.formatVersion === 2 ? manifest.definition : null;
  const ids =
    manifest.formatVersion === 1
      ? manifest.scenes.map((scene) => scene.id)
      : manifest.definition.scenePlan.orderedSceneIds;
  if (new Set(ids).size !== ids.length || ids.some((id) => !isSceneId(id))) {
    return err(
      "cartridge-scenes-invalid",
      "Scene ids must be unique safe identifiers.",
      "Use lowercase letters, digits, underscores, or hyphens.",
    );
  }
  const entrySceneId =
    manifest.formatVersion === 1
      ? manifest.entrySceneId
      : manifest.definition.scenePlan.entrySceneId;
  if (!ids.includes(entrySceneId)) {
    return err(
      "cartridge-entry-missing",
      `Entry scene ${entrySceneId} is not declared.`,
      "Choose one of the manifest scene ids.",
    );
  }
  const sourceIds = Object.keys(input.scenes).sort();
  const declaredIds = [...ids].sort();
  const definitionIds = v2?.scenes.map((scene) => scene.sceneId).sort();
  const storyIds =
    manifest.formatVersion === 1
      ? manifest.story.scenes.map((scene) => scene.id).sort()
      : definitionIds;
  if (JSON.stringify(storyIds) !== JSON.stringify(declaredIds)) {
    return err(
      "cartridge-story-mismatch",
      "The frozen definition and scene plan must describe the same scene ids.",
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
  if (
    manifest.formatVersion === 1 &&
    manifest.requiredKits.some((kit) => !declaredRuleKits.has(kit))
  ) {
    return err(
      "cartridge-kit-missing",
      "The manifest requires a gameplay kit that rules.oui does not configure.",
      "Declare every required kit exactly once in rules.oui.",
    );
  }
  const scenes: Record<string, string> = {};
  const targets = new Map<string, string[]>();
  const terminalScenes = new Set<string>();
  const contracts = new Map<string, SceneContract>();
  const graphs = new Map<string, SceneGraph>();
  if (v2 !== null) {
    const contexts = new Set(v2.capabilityProfile.contexts.map((context) => context.contextId));
    const moduleIds = new Set(v2.moduleLock.entries.map((entry) => entry.moduleId));
    const modules = new Set(
      v2.moduleLock.entries.flatMap((entry) => [
        entry.moduleId,
        `${entry.moduleId}@${entry.version}`,
      ]),
    );
    const versionedModules = new Set(
      v2.moduleLock.entries.map((entry) => `${entry.moduleId}@${entry.version}`),
    );
    if (moduleIds.size !== v2.moduleLock.entries.length) {
      return err("cartridge-module-lock-invalid", "Module lock ids must be unique.");
    }
    for (const module of v2.moduleLock.entries) {
      if (module.requires.some((required) => !versionedModules.has(required))) {
        return err(
          "cartridge-module-lock-invalid",
          `${module.moduleId} requires a module absent from moduleLock.`,
        );
      }
    }
    if (!contexts.has(v2.capabilityProfile.defaultContextId)) {
      return err("cartridge-profile-invalid", "The default capability context is missing.");
    }
    if (contexts.size !== v2.capabilityProfile.contexts.length) {
      return err("cartridge-profile-invalid", "Capability context ids must be unique.");
    }
    for (const context of v2.capabilityProfile.contexts) {
      for (const entry of context.profile.entries) {
        const module = v2.moduleLock.entries.find(
          (item) =>
            item.moduleId === entry.moduleId ||
            `${item.moduleId}@${item.version}` === entry.moduleId,
        );
        if (module === undefined || !module.provides.includes(`${entry.key}:${entry.value}`)) {
          return err(
            "cartridge-profile-invalid",
            `${context.contextId} selects a capability its locked module does not provide.`,
          );
        }
      }
    }
    for (const transition of v2.capabilityProfile.transitions) {
      if (!contexts.has(transition.fromContextId) || !contexts.has(transition.toContextId)) {
        return err(
          "cartridge-profile-invalid",
          "A capability transition names an unknown context.",
        );
      }
    }
    const declaredAssets = new Map<string, (typeof v2.assetPacks)[number]["assets"][number]>();
    const declaredPacks = new Set<string>();
    const installedPack = builtinAssetPack();
    for (const pack of v2.assetPacks) {
      const packKey = `${pack.packId}@${pack.version}`;
      if (declaredPacks.has(packKey)) {
        return err("cartridge-assets-invalid", `Asset pack ${packKey} is declared more than once.`);
      }
      declaredPacks.add(packKey);
      if (
        pack.packId !== installedPack.packId ||
        pack.version !== installedPack.version ||
        pack.contentHash !== installedPack.contentHash
      ) {
        return err(
          "asset-pack-missing",
          `Asset pack ${pack.packId}@${pack.version} is not installed or has a different hash.`,
        );
      }
      for (const asset of pack.assets) {
        if (declaredAssets.has(asset.assetId)) {
          return err(
            "cartridge-assets-invalid",
            `Asset ${asset.assetId} is declared more than once.`,
          );
        }
        const validated = validateAssetRef(asset);
        if (!validated.ok) return validated;
        declaredAssets.set(asset.assetId, asset);
      }
    }
    for (const scene of v2.scenes) {
      const context = v2.capabilityProfile.contexts.find(
        (item) => item.contextId === scene.requiredContextId,
      );
      if (scene.requiredProfileId !== v2.capabilityProfile.profileId || context === undefined) {
        return err(
          "cartridge-profile-invalid",
          `${scene.sceneId} selects an unknown capability profile or context.`,
        );
      }
      if (scene.requiredModules.some((moduleId) => !modules.has(moduleId))) {
        return err(
          "cartridge-module-missing",
          `${scene.sceneId} requires a module absent from moduleLock.`,
        );
      }
      const requiredModuleIds = new Set(
        scene.requiredModules.map(
          (reference) =>
            v2.moduleLock.entries.find(
              (module) =>
                module.moduleId === reference ||
                `${module.moduleId}@${module.version}` === reference,
            )?.moduleId,
        ),
      );
      const missingProfileModule = context.profile.entries.find((entry) => {
        const module = v2.moduleLock.entries.find(
          (candidate) =>
            candidate.moduleId === entry.moduleId ||
            `${candidate.moduleId}@${candidate.version}` === entry.moduleId,
        );
        return module === undefined || !requiredModuleIds.has(module.moduleId);
      });
      if (missingProfileModule !== undefined) {
        return err(
          "cartridge-module-missing",
          `${scene.sceneId} does not require every module selected by its capability context.`,
        );
      }
      if (
        scene.assets.some(
          (asset) => declaredAssets.get(asset.assetId)?.contentHash !== asset.contentHash,
        )
      ) {
        return err(
          "cartridge-assets-mismatch",
          `${scene.sceneId} uses an asset absent from its locked packs.`,
        );
      }
    }
    for (const weapon of parsedRules.value.weapons) {
      if (weapon.assetId !== undefined && !declaredAssets.has(weapon.assetId)) {
        return err(
          "cartridge-assets-mismatch",
          `Weapon ${weapon.id} uses undeclared asset ${weapon.assetId}.`,
        );
      }
    }
    const narrativeIds = v2.narrative.scenes.map((scene) => scene.sceneId);
    if (
      new Set(narrativeIds).size !== narrativeIds.length ||
      narrativeIds.some((id) => !ids.includes(id))
    ) {
      return err(
        "cartridge-story-mismatch",
        "The narrative contains an unknown or duplicate scene.",
      );
    }
    if (v2.scenePlan.endingSceneIds.some((id) => !ids.includes(id))) {
      return err("cartridge-ending-missing", "The scene plan names an undeclared ending scene.");
    }
    for (const transition of v2.scenePlan.transitions) {
      if (!ids.includes(transition.fromSceneId) || !ids.includes(transition.toSceneId)) {
        return err(
          "cartridge-route-invalid",
          "The scene plan contains a transition to an undeclared scene.",
        );
      }
    }
  }
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
    contracts.set(id, contract);
    if (
      !declaredRuleKits.has(contract.kit) ||
      (manifest.formatVersion === 1 && !manifest.requiredKits.includes(contract.kit))
    ) {
      return err(
        "cartridge-kit-missing",
        `${id}.oui selects unavailable kit ${contract.kit}.`,
        "Add the kit to manifest.requiredKits and configure it in rules.oui.",
      );
    }
    if (v2 !== null) {
      const selected = v2.scenes.find((item) => item.sceneId === id);
      if (selected === undefined || selected.sourceHash !== sha256(source)) {
        return err(
          "cartridge-scene-hash-mismatch",
          `${id}.oui does not match its selected scene hash.`,
        );
      }
      if (
        contract.requiredProfileId !== selected.requiredProfileId ||
        contract.requiredContextId !== selected.requiredContextId ||
        JSON.stringify(contract.requiredModules ?? []) !== JSON.stringify(selected.requiredModules)
      ) {
        return err(
          "cartridge-contract-invalid",
          `${id}.oui does not match its frozen v2 scene contract.`,
        );
      }
      const context = v2.capabilityProfile.contexts.find(
        (item) => item.contextId === selected.requiredContextId,
      );
      if (context !== undefined && contract.kit !== kitFor(context.profile)) {
        return err(
          "cartridge-contract-invalid",
          `${id}.oui uses a legacy kit that disagrees with its frozen capability context.`,
        );
      }
      const actualAssets = assetsForScene(scene.value);
      const selectedAssets = [...selected.assets].sort((a, b) =>
        a.assetId.localeCompare(b.assetId),
      );
      if (JSON.stringify(actualAssets) !== JSON.stringify(selectedAssets)) {
        return err(
          "cartridge-assets-mismatch",
          `${id}.oui asset references do not match the frozen definition.`,
        );
      }
      for (const asset of selectedAssets) {
        const validated = validateAssetRef(asset);
        if (!validated.ok) return validated;
      }
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
    // Open land has no finale: a scene played on the open-land kit may be terminal without a gate.
    if (contract.terminal && endingGates === 0 && contract.kit !== "tps_exploration@1") {
      return err(
        "cartridge-ending-missing",
        `${id}.oui is terminal but has no ending gate.`,
        "Give the finale one Exit with no targetSceneId; reaching it completes the cartridge.",
      );
    }
    targets.set(id, exits);
    if (contract.terminal) terminalScenes.add(id);
    graphs.set(id, scene.value);
    scenes[id] = source;
  }
  const grantedFlags = new Set([...contracts.values()].flatMap((contract) => contract.grantsFlags));
  for (const [id, contract] of contracts) {
    if (contract.requiresItems.length > 0) {
      return err(
        "cartridge-prerequisite-invalid",
        `${id}.oui requires items that this cartridge cannot grant deterministically: ${contract.requiresItems.join(", ")}.`,
        "Use declarative save flags for offline progression until item grants are part of the cartridge format.",
      );
    }
    const missing = contract.requiresFlags.filter((flag) => !grantedFlags.has(flag));
    if (missing.length > 0) {
      return err(
        "cartridge-prerequisite-invalid",
        `${id}.oui requires flags no scene grants: ${missing.join(", ")}.`,
        "Grant every required flag from a reachable earlier scene.",
      );
    }
  }
  if (!canReachTerminal(entrySceneId, targets, terminalScenes, contracts)) {
    return err(
      "cartridge-route-invalid",
      "No terminal scene is reachable from the entry scene.",
      "Connect the scene contracts with stable Exit.targetSceneId values.",
    );
  }
  const files: CartridgeFileIntegrity[] = [fileIntegrity(RULES_FILE, rules)];
  for (const id of [...ids].sort()) files.push(fileIntegrity(`scenes/${id}.oui`, scenes[id] ?? ""));
  const dialogues = prepareDialogues(input.dialogues, graphs);
  if (!dialogues.ok) return dialogues;
  files.push(...dialogues.value.files);
  const assets = input.assets ?? {};
  for (const [path, bytes] of Object.entries(assets).sort(([a], [b]) => a.localeCompare(b))) {
    if (!/^[a-z0-9][a-z0-9_./-]{0,239}$/.test(path) || path.includes("..")) {
      return err("cartridge-asset-path-invalid", `Unsafe asset path: ${path}`);
    }
    files.push({ path: `assets/${path}`, bytes: bytes.byteLength, contentHash: sha256(bytes) });
  }
  const bible = prepareBible(input.bible);
  if (!bible.ok) return bible;
  files.push(...bibleIntegrity(bible.value));
  const integrity = [...files].sort((a, b) => a.path.localeCompare(b.path));
  const contentHash = cartridgeContentHash(manifest, integrity);
  const revision = {
    manifest: { ...manifest, contentHash, files: integrity },
    rules,
    scenes,
    dialogues: dialogues.value.dialogues,
    assets,
    bible: bible.value,
  };
  const pin = runtimePinForManifest(revision.manifest);
  return pin.ok ? ok(revision) : pin;
}

/** Normalised bible text, or an error when either anchor is empty or too long to inject. */
export function prepareBible(bible: WorldBible | undefined): Result<WorldBible | null> {
  if (bible === undefined) return ok(null);
  const core = normaliseSource(bible.core);
  const style = normaliseSource(bible.style);
  for (const [name, text] of [
    ["core", core],
    ["style", style],
  ] as const) {
    if (text.trim().length === 0 || text.length > BIBLE_MAX_CHARS) {
      return err(
        "cartridge-bible-invalid",
        `bible/${name}.md must hold 1 to ${BIBLE_MAX_CHARS} characters.`,
        "Write the world bible again; it is injected into every witnessing prompt.",
      );
    }
  }
  return ok({ core, style });
}

/** Integrity entries for a bible, in path order. */
export function bibleIntegrity(bible: WorldBible | null): CartridgeFileIntegrity[] {
  return bible === null
    ? []
    : [fileIntegrity(BIBLE_FILES.core, bible.core), fileIntegrity(BIBLE_FILES.style, bible.style)];
}

function canReachTerminal(
  entry: string,
  targets: ReadonlyMap<string, string[]>,
  terminals: ReadonlySet<string>,
  contracts: ReadonlyMap<string, SceneContract>,
): boolean {
  return [...reachableScenes(entry, targets, contracts)].some((id) => terminals.has(id));
}
