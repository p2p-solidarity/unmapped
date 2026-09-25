import { parseRules, parseScene, serializeRules, serializeScene } from "@dsl/index";
import {
  assetsForScene,
  builtinAssetKind,
  builtinAssetPack,
  validateAssetRef,
} from "@shared/assets";
import type { CapabilitySpec } from "@shared/capabilities";
import { BUILTIN_MODULES } from "@shared/capability-modules";
import type { CartridgeRevision, PublishCartridgeInput } from "@shared/cartridge";
import { compareCartridgeVersions } from "@shared/cartridge";
import type { GameDefinition } from "@shared/game-definition";
import type { GameplayRules } from "@shared/gameplay";
import { seedModProposalSchema } from "@shared/mod-proposal-schema";
import type { ModProposalPreview, SeedModProposal } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { canonicalJson, sha256 } from "../cartridges/integrity";

/** Validated trusted base -> immutable publication input. Never writes a live save. */
export function previewModProposal(
  base: CartridgeRevision,
  input: SeedModProposal,
): Result<ModProposalPreview> {
  const parsed = seedModProposalSchema.safeParse(input);
  if (!parsed.success)
    return err("mod-proposal-invalid", parsed.error.issues[0]?.message ?? "Invalid proposal.");
  const proposal = parsed.data;
  const manifest = base.manifest;
  if (
    manifest.cartridgeId !== proposal.base.cartridgeId ||
    manifest.version !== proposal.base.version ||
    manifest.contentHash !== proposal.base.contentHash
  )
    return err(
      "mod-base-mismatch",
      "The proposal targets a different cartridge revision.",
      "Generate a new proposal against this exact revision.",
    );
  if (manifest.formatVersion !== 2)
    return err(
      "mod-v2-required",
      "Typed structural mods require a v2 cartridge.",
      "Create a v2 cartridge before proposing a structural mod.",
    );
  const parsedRules = parseRules(base.rules);
  if (!parsedRules.ok) return parsedRules;
  let rules: GameplayRules = structuredClone(parsedRules.value);
  const definition: GameDefinition = structuredClone(manifest.definition);
  const graphs: Record<string, SceneGraph> = {};
  for (const [id, source] of Object.entries(base.scenes)) {
    const graph = parseScene(source);
    if (!graph.ok) return graph;
    graphs[id] = graph.value;
  }
  const affected = new Set<string>();
  const reasons: string[] = [];
  let runtimeChanged = false;
  for (const op of proposal.operations) {
    if (op.type === "add_weapon") {
      if (rules.combat === null)
        return err(
          "mod-combat-required",
          "This cartridge has no combat module.",
          "Choose a cartridge with combat enabled.",
        );
      if (rules.weapons.some((w) => w.id === op.weapon.weaponId))
        return err("mod-weapon-exists", `Weapon ${op.weapon.weaponId} already exists.`);
      const ref = definition.assetPacks
        .flatMap((pack) => pack.assets)
        .find((asset) => asset.assetId === op.weapon.assetId);
      if (ref === undefined)
        return err(
          "mod-asset-missing",
          `Weapon asset ${op.weapon.assetId} is not declared.`,
          "Choose a declared cartridge asset.",
        );
      const valid = validateAssetRef(ref);
      if (!valid.ok) return valid;
      const w = op.weapon;
      // New weapon is equipped on the new run; the previous version keeps its original loadout.
      rules = {
        ...rules,
        weapons: [
          {
            id: w.weaponId,
            name: w.name,
            kind: w.kind,
            damage: w.damage,
            range: w.range,
            cooldownMs: w.cooldownMs,
            magazine: w.magazine,
            assetId: w.assetId,
          },
          ...rules.weapons,
        ],
      };
      runtimeChanged = true;
      reasons.push(`Adds ${w.name}; a new run starts with this weapon equipped.`);
    } else if (op.type === "change_timing") {
      const current = rules.timing?.system ?? "realtime";
      if (current !== op.change.from)
        return err("mod-timing-stale", `Timing is ${current}, not ${op.change.from}.`);
      const spec: CapabilitySpec = `timing:${op.change.to}`;
      const module = BUILTIN_MODULES.find((m) => m.provides.includes(spec));
      if (module === undefined)
        return err("mod-module-missing", `No installed module provides ${spec}.`);
      rules = {
        ...rules,
        timing:
          op.change.to === "realtime"
            ? null
            : {
                system: op.change.to,
                resolution: op.change.resolution,
                turnSeconds: (op.change.turnDurationMs ?? 0) / 1000,
              },
      };
      for (const ctx of definition.capabilityProfile.contexts) {
        ctx.profile.entries = [
          ...ctx.profile.entries.filter((e) => e.key !== "timing"),
          { key: "timing", value: op.change.to, moduleId: module.moduleId },
        ];
      }
      if (!definition.moduleLock.entries.some((m) => m.moduleId === module.moduleId))
        definition.moduleLock.entries.push(structuredClone(module));
      runtimeChanged = true;
      reasons.push(
        `Changes timing from ${current} to ${op.change.to}; existing saves remain on the old rules.`,
      );
    } else if (op.type === "add_capability_module") {
      const module = BUILTIN_MODULES.find(
        (m) => m.moduleId === op.moduleId && m.version === op.version,
      );
      if (!module)
        return err("mod-module-missing", `Module ${op.moduleId}@${op.version} is not installed.`);
      if (definition.moduleLock.entries.some((m) => m.moduleId === op.moduleId))
        return err("mod-module-exists", `${op.moduleId} is already locked.`);
      if (
        module.requires.some((id) => !definition.moduleLock.entries.some((m) => m.moduleId === id))
      )
        return err("mod-dependency-missing", "Add required modules before their dependent module.");
      definition.moduleLock.entries.push(structuredClone(module));
      runtimeChanged = true;
      reasons.push(`Locks installed module ${module.moduleId}@${module.version}.`);
    } else {
      const graph = graphs[op.sceneId];
      if (!graph) return err("mod-scene-missing", `Scene ${op.sceneId} does not exist.`);
      affected.add(op.sceneId);
      if (op.type === "asset_patch") {
        for (const ref of op.assets) {
          const valid = validateAssetRef(ref);
          if (!valid.ok) return valid;
        }
        // A reference alone cannot invent placements or silently replace unrelated geometry.
        const expected = assetsForScene(graph);
        if (
          canonicalJson([...op.assets].sort((a, b) => a.assetId.localeCompare(b.assetId))) !==
          canonicalJson(expected.sort((a, b) => a.assetId.localeCompare(b.assetId)))
        )
          return err(
            "mod-asset-placement-required",
            "Asset refs must match the scene's actual placements.",
            "Use scene_patch to replace or move an asset first.",
          );
      } else
        for (const change of op.patch.operations) {
          if (change.type === "set_objective")
            graph.quests = [{ id: "objective", text: change.text }];
          if (change.type === "set_contract") {
            if (change.contract.sceneId !== op.sceneId)
              return err("mod-contract-id", "A scene patch cannot change stable scene identity.");
            graph.contract = change.contract;
            runtimeChanged = true;
          }
          if (change.type === "replace_asset") {
            const kind = builtinAssetKind(change.toAssetId);
            if (kind === null)
              return err("asset-missing", `Asset ${change.toAssetId} is not installed.`);
            if (!graph.props.some((p) => (p.assetId ?? `builtin:${p.kind}`) === change.fromAssetId))
              return err("mod-asset-missing", `Scene does not contain ${change.fromAssetId}.`);
            graph.props = graph.props.map((p) =>
              (p.assetId ?? `builtin:${p.kind}`) === change.fromAssetId
                ? { ...p, kind, assetId: change.toAssetId }
                : p,
            );
          }
          if (change.type === "move_asset") {
            if (change.x >= graph.floor.width || change.z >= graph.floor.depth)
              return err("mod-position-invalid", "Asset position lies outside this scene.");
            if (!graph.props.some((p) => (p.assetId ?? `builtin:${p.kind}`) === change.assetId))
              return err("mod-asset-missing", `Scene does not contain ${change.assetId}.`);
            graph.props = graph.props.map((p) =>
              (p.assetId ?? `builtin:${p.kind}`) === change.assetId
                ? { ...p, x: change.x, z: change.z }
                : p,
            );
          }
        }
    }
  }
  const scenes: Record<string, string> = {};
  for (const [id, graph] of Object.entries(graphs)) {
    const selected = definition.scenes.find((s) => s.sceneId === id);
    if (!selected || graph.contract === null)
      return err("mod-scene-invalid", `Scene ${id} has no definition or contract.`);
    const ctx = definition.capabilityProfile.contexts.find(
      (c) => c.contextId === (graph.contract?.requiredContextId ?? selected.requiredContextId),
    );
    if (!ctx) return err("mod-context-missing", `Scene ${id} refers to an unknown context.`);
    const requiredModules = [...new Set(ctx.profile.entries.map((e) => e.moduleId))];
    graph.contract = {
      ...graph.contract,
      requiredProfileId: definition.capabilityProfile.profileId,
      requiredContextId: ctx.contextId,
      requiredModules,
    };
    const source = `${serializeScene(graph).trimEnd()}\n`;
    scenes[id] = source;
    selected.sourceHash = sha256(source);
    selected.requiredModules = requiredModules;
    selected.requiredContextId = ctx.contextId;
    selected.assets = assetsForScene(graph);
  }
  definition.assetPacks = [
    builtinAssetPack(Object.values(graphs).flatMap((g) => g.props.map((p) => p.kind))),
  ];
  definition.provenance = { ...definition.provenance, source: "remix", parent: proposal.base };
  const entry = {
    name: `proposal-${proposal.proposalId}`,
    version: "1.0.0",
    contentHash: sha256(canonicalJson(proposal.operations)),
    affectsRuntime: runtimeChanged,
    provides: proposal.operations.map((op) => op.type),
  };
  definition.modLock.entries.push(entry);
  definition.modLock.lockHash = sha256(canonicalJson(definition.modLock.entries));
  const [major, minor, patch] = manifest.version.split(/[.+-]/).slice(0, 3).map(Number);
  const defaultVersion = runtimeChanged
    ? `${(major ?? 0) + 1}.0.0`
    : `${major}.${minor}.${(patch ?? 0) + 1}`;
  const version = proposal.targetVersion ?? defaultVersion;
  if (
    compareCartridgeVersions(version, manifest.version) <= 0 ||
    (runtimeChanged && Number(version.split(".")[0]) <= (major ?? 0))
  )
    return err(
      "mod-version-invalid",
      runtimeChanged
        ? "Runtime changes require a higher major version."
        : "Choose a version newer than the base cartridge.",
    );
  const { contentHash: _contentHash, files: _files, ...core } = manifest;
  const revision: PublishCartridgeInput = {
    manifest: {
      ...core,
      definition,
      version,
      createdAt: proposal.generatedAt,
      lineage: { kind: "revision", parent: proposal.base },
    },
    rules: serializeRules(rules),
    scenes,
  };
  return ok({
    proposal,
    revision,
    compatibility: {
      status: "compatible",
      reasons,
      affectedScenes: runtimeChanged ? Object.keys(scenes) : [...affected],
      saveImpact: runtimeChanged ? "new_instance" : "none",
      networkImpact: "new_effective_hash",
    },
  });
}
