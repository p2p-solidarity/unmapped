import { parseRules, parseScene } from "@dsl/index";
import {
  ENGINE_API_VERSION,
  SAVE_SCHEMA_VERSION,
  type WorkspacePreview,
  type WorkspaceRecord,
  type WorkspaceValidationCheck,
} from "@shared/cartridge";
import type { SceneContract } from "@shared/gameplay";
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
  const storyIds = new Set(meta.story.scenes.map((scene) => scene.id));
  if (storyIds.size !== meta.story.scenes.length) catalog.push("Story scene ids are not unique.");
  for (const id of ids)
    if (!storyIds.has(id)) catalog.push(`${id} is missing from the story outline.`);
  for (const id of storyIds) if (!idSet.has(id)) catalog.push(`Story scene ${id} is undeclared.`);

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
    for (const kit of meta.requiredKits) {
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
    if (!meta.requiredKits.includes(contract.kit) || !configured.has(contract.kit)) {
      kitMessages.push(`${id}.oui selects unavailable kit ${contract.kit}.`);
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
