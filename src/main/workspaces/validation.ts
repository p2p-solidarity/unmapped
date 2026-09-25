import { parseRules, parseScene } from "@dsl/index";
import { assetsForScene, validateAssetRef } from "@shared/assets";
import {
  ENGINE_API_VERSION,
  SAVE_SCHEMA_VERSION,
  type WorkspacePreview,
  type WorkspaceRecord,
  type WorkspaceValidationCheck,
} from "@shared/cartridge";
import type { SceneContract } from "@shared/gameplay";
import { canonicalJson, sha256 } from "../cartridges/integrity";
import { reachableScenes } from "../cartridges/routes";

function check(
  id: WorkspaceValidationCheck["id"],
  label: string,
  messages: string[],
): WorkspaceValidationCheck {
  return { id, label, ok: messages.length === 0, messages };
}

export function validateWorkspace(workspace: WorkspaceRecord): WorkspacePreview {
  const { meta, rules: source, scenes: sources } = workspace;
  const ids = meta.scenes.map((scene) => scene.id);
  const idSet = new Set(ids);
  const engine =
    meta.engineApiVersion <= ENGINE_API_VERSION
      ? []
      : [
          `Requires engine API ${meta.engineApiVersion}; this build provides ${ENGINE_API_VERSION}.`,
        ];
  const save =
    meta.saveSchemaVersion === SAVE_SCHEMA_VERSION
      ? []
      : [
          `Requires save schema ${meta.saveSchemaVersion}; this build writes ${SAVE_SCHEMA_VERSION}.`,
        ];
  const catalog: string[] = [];
  if (idSet.size !== ids.length) catalog.push("Scene ids are not unique.");
  if (!idSet.has(meta.entrySceneId)) catalog.push(`Entry scene ${meta.entrySceneId} is missing.`);
  for (const id of ids) if (sources[id] === undefined) catalog.push(`${id}.oui is missing.`);
  for (const id of Object.keys(sources))
    if (!idSet.has(id)) catalog.push(`${id}.oui is undeclared.`);
  if (meta.story !== undefined) {
    const storyIds = new Set(meta.story.scenes.map((scene) => scene.id));
    if (storyIds.size !== meta.story.scenes.length) catalog.push("Story scene ids are not unique.");
    for (const id of ids)
      if (!storyIds.has(id)) catalog.push(`${id} is missing from the story outline.`);
    for (const id of storyIds) if (!idSet.has(id)) catalog.push(`Story scene ${id} is undeclared.`);
  }
  const definition =
    meta.sourceManifest?.formatVersion === 2 ? meta.sourceManifest.definition : null;
  if (definition !== null) {
    const frozenIds = definition.scenePlan.orderedSceneIds;
    if (canonicalJson(frozenIds) !== canonicalJson(ids)) {
      catalog.push("The workspace scene order does not match its frozen v2 definition.");
    }
    const selectedIds = definition.scenes.map((scene) => scene.sceneId).sort();
    if (canonicalJson(selectedIds) !== canonicalJson([...ids].sort())) {
      catalog.push("The v2 selected scenes do not match the workspace scene catalog.");
    }
  }

  const parsedRules = parseRules(source);
  const ruleMessages = parsedRules.ok ? [] : [parsedRules.error.message];
  const configured = new Set(parsedRules.ok ? parsedRules.value.kits.map((kit) => kit.id) : []);
  const contractMessages: string[] = [];
  const kitMessages: string[] = [];
  const prerequisiteMessages: string[] = [];
  const routeMessages: string[] = [];
  const endingMessages: string[] = [];
  const routes = new Map<string, string[]>();
  const terminals = new Set<string>();
  const contracts = new Map<string, SceneContract>();

  if (parsedRules.ok) {
    for (const kit of meta.requiredKits ?? []) {
      if (!configured.has(kit)) kitMessages.push(`${kit} is required but not configured.`);
    }
  }
  for (const id of ids) {
    const source = sources[id];
    if (source === undefined) continue;
    const scene = parseScene(source);
    if (!scene.ok) {
      contractMessages.push(`${id}.oui: ${scene.error.message}`);
      continue;
    }
    const contract = scene.value.contract;
    if (contract === null || contract.sceneId !== id) {
      contractMessages.push(`${id}.oui needs Contract("${id}", ...).`);
      continue;
    }
    contracts.set(id, contract);
    if (
      !configured.has(contract.kit) ||
      (meta.requiredKits !== undefined && !meta.requiredKits.includes(contract.kit))
    ) {
      kitMessages.push(`${id}.oui selects unavailable kit ${contract.kit}.`);
    }
    if (definition !== null) {
      const selected = definition.scenes.find((item) => item.sceneId === id);
      const contextIds = new Set(
        definition.capabilityProfile.contexts.map((context) => context.contextId),
      );
      const moduleIds = new Set(definition.moduleLock.entries.map((module) => module.moduleId));
      if (
        selected === undefined ||
        selected.requiredProfileId !== definition.capabilityProfile.profileId ||
        !contextIds.has(selected.requiredContextId) ||
        selected.requiredModules.some((moduleId) => !moduleIds.has(moduleId))
      ) {
        contractMessages.push(`${id}.oui has an invalid frozen capability context.`);
      } else if (
        contract.requiredProfileId !== selected.requiredProfileId ||
        contract.requiredContextId !== selected.requiredContextId ||
        canonicalJson(contract.requiredModules ?? []) !== canonicalJson(selected.requiredModules)
      ) {
        contractMessages.push(`${id}.oui does not match its frozen capability context.`);
      }
      if (selected !== undefined) {
        if (
          selected.sourceHash !== sha256(`${source.replace(/\r\n?/g, "\n").replace(/\n*$/, "")}\n`)
        ) {
          contractMessages.push(`${id}.oui does not match its frozen source hash.`);
        }
        const actualAssets = assetsForScene(scene.value);
        const selectedAssets = [...selected.assets].sort((a, b) =>
          a.assetId.localeCompare(b.assetId),
        );
        if (canonicalJson(actualAssets) !== canonicalJson(selectedAssets)) {
          catalog.push(`${id}.oui asset references do not match its frozen definition.`);
        }
        for (const asset of selectedAssets) {
          const valid = validateAssetRef(asset);
          if (!valid.ok) catalog.push(valid.error.message);
        }
      }
    }
    const targets: string[] = [];
    let endingGate = false;
    for (const exit of scene.value.exits) {
      if (exit.targetSceneId === null) {
        if (!contract.terminal)
          routeMessages.push(`${id}.oui has an untargeted non-terminal exit.`);
        else endingGate = true;
      } else if (!idSet.has(exit.targetSceneId)) {
        routeMessages.push(`${id}.oui exits to undeclared scene ${exit.targetSceneId}.`);
      } else targets.push(exit.targetSceneId);
    }
    if (contract.terminal) {
      terminals.add(id);
      if (!endingGate) endingMessages.push(`${id}.oui is terminal but has no ending gate.`);
    }
    routes.set(id, targets);
  }

  const grantedFlags = new Set([...contracts.values()].flatMap((contract) => contract.grantsFlags));
  for (const [id, contract] of contracts) {
    if (contract.requiresItems.length > 0) {
      prerequisiteMessages.push(
        `${id}.oui requires items with no deterministic cartridge grant: ${contract.requiresItems.join(", ")}.`,
      );
    }
    const missing = contract.requiresFlags.filter((flag) => !grantedFlags.has(flag));
    if (missing.length > 0) {
      prerequisiteMessages.push(`${id}.oui requires flags no scene grants: ${missing.join(", ")}.`);
    }
  }
  const reachable = reachableScenes(meta.entrySceneId, routes, contracts);
  const reachesEnding = [...reachable].some((id) => terminals.has(id));
  if (!reachesEnding) endingMessages.push("No terminal scene is reachable from the entry scene.");
  if (definition?.scenePlan.endingSceneIds.some((id) => !terminals.has(id))) {
    endingMessages.push("A declared v2 ending scene is not terminal.");
  }

  const checks = [
    check("engine", "Engine API", engine),
    check("save", "Save schema", save),
    check("rules", "Gameplay rules", ruleMessages),
    check("catalog", "Scene catalog", catalog),
    check("contracts", "Scene parsing and contracts", contractMessages),
    check("kits", "Gameplay kit compatibility", kitMessages),
    check("prerequisites", "Offline prerequisites", prerequisiteMessages),
    check("routes", "Scene references", routeMessages),
    check("ending", "Offline completion route", endingMessages),
  ];
  return { workspace, checks, valid: checks.every((item) => item.ok) };
}
