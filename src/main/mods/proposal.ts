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
import { activateModule, installedModule, installedModuleList, lockModule } from "./modules";

/** Validated trusted base -> immutable publication input. Never writes a live save. */
export function previewModProposal(
  base: CartridgeRevision,
  input: SeedModProposal,
  /** Versions this cartridge already has; the default new version skips them. */
  taken: readonly string[] = [],
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
      // A weapon needs combat: a cartridge without it gets the combat module, not a refusal.
      const combat = installedModule("shooter_combat");
      if (rules.combat === null && combat !== null) {
        const turned = activateModule(rules, definition, combat);
        rules = turned.rules;
        reasons.push(...turned.notes);
      }
      const w = op.weapon;
      // Two weapons may share a name, never an id: a clash gets the next free suffix.
      let weaponId = w.weaponId;
      for (let n = 2; rules.weapons.some((one) => one.id === weaponId); n += 1) {
        weaponId = `${w.weaponId}_${n}`.slice(0, 80);
      }
      // A look the cartridge cannot draw is dropped, not a reason to refuse the weapon.
      const declared = definition.assetPacks
        .flatMap((pack) => pack.assets)
        .some((asset) => asset.assetId === w.assetId);
      const assetId = declared || builtinAssetKind(w.assetId) !== null ? w.assetId : undefined;
      if (assetId === undefined) reasons.push(`${w.name} uses the default weapon look.`);
      // New weapon is equipped on the new run; the previous version keeps its original loadout.
      rules = {
        ...rules,
        weapons: [
          {
            id: weaponId,
            name: w.name,
            kind: w.kind,
            damage: w.damage,
            range: w.range,
            cooldownMs: w.cooldownMs,
            magazine: w.magazine,
            ...(assetId === undefined ? {} : { assetId }),
          },
          ...rules.weapons,
        ],
      };
      runtimeChanged = true;
      reasons.push(`Adds ${w.name}; a new run starts with this weapon equipped.`);
    } else if (op.type === "change_timing") {
      // The model's idea of the current pacing does not matter; the rules say what it is.
      const current = rules.timing?.system ?? "realtime";
      const spec: CapabilitySpec = `timing:${op.change.to}`;
      const module = BUILTIN_MODULES.find((m) => m.provides.includes(spec));
      if (module === undefined)
        return err(
          "mod-module-missing",
          `This engine has no module that provides ${spec}.`,
          `Installed: ${installedModuleList()}.`,
        );
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
      const locked = lockModule(definition, module);
      if (locked.length > 0) reasons.push(`Adds ${locked.join(", ")} to the cartridge.`);
      runtimeChanged = true;
      reasons.push(
        `Changes timing from ${current} to ${op.change.to}; existing saves remain on the old rules.`,
      );
    } else if (op.type === "add_capability_module") {
      const module = installedModule(op.moduleId, op.version);
      if (module === null)
        return err(
          "mod-module-missing",
          `This engine has no module called ${op.moduleId}.`,
          `Installed: ${installedModuleList()}.`,
        );
      const turned = activateModule(rules, definition, module);
      rules = turned.rules;
      reasons.push(...turned.notes);
      if (turned.changed) runtimeChanged = true;
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
          if (change.type === "add_monster") {
            // A monster with no combat to fight it would only stand there: combat comes with it.
            const combat = installedModule("shooter_combat");
            if (rules.combat === null && combat !== null) {
              const turned = activateModule(rules, definition, combat);
              rules = turned.rules;
              reasons.push(...turned.notes);
              runtimeChanged = true;
            }
            let n = graph.monsters.length + 1;
            while (graph.monsters.some((m) => m.id === `monster_${n}`)) n += 1;
            graph.monsters = [
              ...graph.monsters,
              {
                id: `monster_${n}`,
                kind: change.kind,
                x: Math.min(change.x, Math.max(0, graph.floor.width - 1)),
                z: Math.min(change.z, Math.max(0, graph.floor.depth - 1)),
                level: change.level,
                weakness: change.weakness,
                size: 1,
                color: null,
              },
            ];
            reasons.push(`Places a level ${change.level} ${change.kind} in ${op.sceneId}.`);
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
  let bump = 1;
  const next = (): string =>
    runtimeChanged ? `${(major ?? 0) + bump}.0.0` : `${major}.${minor}.${(patch ?? 0) + bump}`;
  while (taken.includes(next())) bump += 1;
  const defaultVersion = next();
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
    // Everything a mod does not touch travels with the revision: the world bible and its story
    // (without them the land could no longer be witnessed), baked dialogues and packed assets.
    dialogues: base.dialogues,
    assets: base.assets,
    ...(base.bible === null ? {} : { bible: base.bible }),
    ...(base.story === null || base.story === undefined ? {} : { story: base.story }),
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
