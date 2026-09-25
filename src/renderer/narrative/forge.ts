import { parseScene, serializeRules, serializeScene } from "@dsl";
import { assetsForScene, builtinAssetPack } from "@shared/assets";
import type { CapabilityContext, CapabilityResolution } from "@shared/capabilities";
import {
  CARTRIDGE_FORMAT_VERSION,
  type CartridgeManifest,
  dialogueKey,
  ENGINE_API_VERSION,
  type InstanceMeta,
  NETWORK_PROTOCOL_VERSION,
  type PublishCartridgeInput,
  SAVE_SCHEMA_VERSION,
} from "@shared/cartridge";
import { hashText } from "@shared/content-hash";
import { kitFor, rulesFor } from "@shared/forge";
import type { GameDefinition, NarrativeLayer } from "@shared/game-definition";
import type { GameplayRules } from "@shared/gameplay";
import { EMPTY_MOD_LOCK } from "@shared/mods";
import { err, ok, type Result } from "@shared/result";
import type { AuthoringSnapshot, SceneGallerySlot } from "@shared/scene-gallery";
import type { PropKind, SceneGraph } from "@shared/world";

function sourceText(graph: SceneGraph): string {
  return `${serializeScene(graph).replace(/\n*$/, "")}\n`;
}

function selected(slot: SceneGallerySlot) {
  return slot.candidates.find((candidate) => candidate.candidateId === slot.selectedCandidateId);
}

function combinedRules(contexts: CapabilityContext[]): GameplayRules {
  const available = contexts.filter((context) => context.profile !== null);
  const first = rulesFor(available[0]?.profile ?? { entries: [] });
  const all = available.map((context) => rulesFor(context.profile ?? { entries: [] }));
  return {
    ...first,
    kits: [...new Map(all.flatMap((rules) => rules.kits).map((kit) => [kit.id, kit])).values()],
    weapons: [
      ...new Map(
        all.flatMap((rules) => rules.weapons).map((weapon) => [weapon.id, weapon]),
      ).values(),
    ],
    progression: [
      ...new Map(
        all.flatMap((rules) => rules.progression).map((rule) => [rule.kind, rule]),
      ).values(),
    ],
    combat: all.find((rules) => rules.combat !== null)?.combat ?? null,
    party: all.find((rules) => rules.party !== null)?.party ?? null,
  };
}

/** The empty story layer of a cartridge forged without one: blank, never invented text. */
function emptyNarrative(snapshot: AuthoringSnapshot): NarrativeLayer {
  return {
    required: false,
    premise: "",
    finale: "",
    scenes: snapshot.gallery.slots.map((slot) => ({
      sceneId: slot.slotId,
      title: slot.title,
      summary: "",
      objective: "",
    })),
  };
}

export async function buildCartridge(
  snapshot: AuthoringSnapshot,
  resolution: CapabilityResolution,
): Promise<Result<PublishCartridgeInput>> {
  const requiredMissing = resolution.missingModules.filter((requirement) => requirement.required);
  if (resolution.conflicts.length > 0 || requiredMissing.length > 0) {
    return err("forge-capabilities-blocked", "Resolve every required capability before Forge.");
  }
  const slots = snapshot.gallery.slots;
  if (slots.length === 0 || slots.some((slot) => selected(slot) === undefined)) {
    return err(
      "forge-scenes-incomplete",
      "Create or select one scene for every scene slot before Forge.",
    );
  }
  const entry = snapshot.gallery.entrySlotId;
  if (entry === null || snapshot.gallery.endingSlotIds.length === 0) {
    return err("forge-route-incomplete", "Choose an entry and at least one ending scene.");
  }
  const contextMap = new Map(resolution.contexts.map((context) => [context.contextId, context]));
  if (slots.some((slot) => contextMap.get(slot.contextId)?.profile == null)) {
    return err("forge-context-missing", "Every scene must select a ready capability context.");
  }

  const profileSeed = resolution.contexts.map((context) => ({
    contextId: context.contextId,
    profile: context.profile,
  }));
  const profileHash = await hashText(JSON.stringify(profileSeed));
  const profileId = `profile-${profileHash.slice(7, 19)}`;
  const scenes: Record<string, string> = {};
  const dialogues: Record<string, string> = {};
  const frozenScenes: GameDefinition["scenes"] = [];
  const kinds = new Set<PropKind>();
  const transitions: GameDefinition["scenePlan"]["transitions"] = [];
  const contextTransitions: GameDefinition["capabilityProfile"]["transitions"] = [];

  for (const [index, slot] of slots.entries()) {
    const candidate = selected(slot);
    const context = contextMap.get(slot.contextId);
    if (candidate === undefined || context?.profile == null) continue;
    const parsed = parseScene(candidate.sceneSource);
    if (!parsed.ok) return err("forge-scene-invalid", parsed.error.message, parsed.error.hint);
    const next = slots[index + 1];
    const terminal = snapshot.gallery.endingSlotIds.includes(slot.slotId);
    const requiredModules = context.selectedModules.map((module) => module.moduleId);
    const graph: SceneGraph = {
      ...parsed.value,
      contract: {
        ...(parsed.value.contract ?? {
          sceneId: slot.slotId,
          kit: rulesFor(context.profile).defaultKit,
          requiresFlags: [],
          requiresItems: [],
          inventoryPolicy: "carry",
          grantsFlags: [],
          terminal,
        }),
        sceneId: slot.slotId,
        // Always the slot's current context: a candidate generated before the modes changed still
        // carries its old kit, and publish rejects a kit that disagrees with the frozen context.
        kit: kitFor(context.profile),
        terminal,
        requiredProfileId: profileId,
        requiredContextId: slot.contextId,
        requiredModules,
      },
      exits:
        parsed.value.exits.length === 0
          ? []
          : parsed.value.exits.map((exit, exitIndex) =>
              exitIndex === 0
                ? {
                    ...exit,
                    targetSceneId: terminal ? null : (next?.slotId ?? null),
                    to: terminal ? "Finish" : (next?.title ?? "Exit"),
                  }
                : exit,
            ),
    };
    if (!terminal && next === undefined) {
      return err(
        "forge-route-incomplete",
        `${slot.title} has no following scene or ending marker.`,
      );
    }
    const source = sourceText(graph);
    const sourceHash = await hashText(source);
    const assets = assetsForScene(graph);
    // Only voices whose NPC survived into the published scene travel with the cartridge.
    for (const npc of graph.npcs) {
      const voice = candidate.dialogues[npc.id];
      if (voice !== undefined && voice.trim().length > 0) {
        dialogues[dialogueKey(slot.slotId, npc.id)] = voice;
      }
    }
    for (const prop of graph.props) kinds.add(prop.kind);
    scenes[slot.slotId] = source;
    frozenScenes.push({
      sceneId: slot.slotId,
      slotId: slot.slotId,
      candidateId: candidate.candidateId,
      sourceHash,
      requiredProfileId: profileId,
      requiredContextId: slot.contextId,
      requiredModules,
      assets,
    });
    if (!terminal && next !== undefined) {
      transitions.push({
        fromSceneId: slot.slotId,
        toSceneId: next.slotId,
        triggerId: "exit",
        requiresFlags: [],
      });
      if (next.contextId !== slot.contextId) {
        contextTransitions.push({
          fromContextId: slot.contextId,
          toContextId: next.contextId,
          trigger: "scene_exit",
          triggerId: slot.slotId,
        });
      }
    }
  }

  const definition: GameDefinition = {
    formatVersion: 2,
    gameId: snapshot.draft.cartridgeId,
    title: snapshot.draft.name,
    description: snapshot.narrative?.premise || snapshot.draft.brief,
    author: snapshot.draft.author,
    modeSelection: snapshot.draft.selection,
    capabilityProfile: {
      profileId,
      defaultContextId: contextMap.has(slots[0]?.contextId ?? "")
        ? (slots[0]?.contextId ?? "main")
        : (resolution.contexts[0]?.contextId ?? "main"),
      contexts: resolution.contexts.flatMap((context) =>
        context.profile === null
          ? []
          : [{ contextId: context.contextId, profile: context.profile }],
      ),
      transitions: contextTransitions,
    },
    assetPacks: kinds.size === 0 ? [] : [builtinAssetPack([...kinds])],
    scenePlan: {
      orderedSceneIds: slots.map((slot) => slot.slotId),
      entrySceneId: entry,
      endingSceneIds: snapshot.gallery.endingSlotIds,
      transitions,
    },
    scenes: frozenScenes,
    narrative: snapshot.narrative ?? emptyNarrative(snapshot),
    moduleLock: { entries: resolution.selectedModules },
    modLock: EMPTY_MOD_LOCK,
    provenance: {
      source: "new",
      parent: null,
      generation: slots.flatMap((slot) => {
        const candidate = selected(slot);
        return candidate === undefined ? [] : [candidate.receipt];
      }),
    },
  };
  return ok({
    manifest: {
      formatVersion: CARTRIDGE_FORMAT_VERSION,
      cartridgeId: snapshot.draft.cartridgeId,
      version: "1.0.0",
      name: snapshot.draft.name,
      description: definition.description,
      author: snapshot.draft.author,
      createdAt: new Date().toISOString(),
      engineApiVersion: ENGINE_API_VERSION,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      networkProtocolVersion: NETWORK_PROTOCOL_VERSION,
      definition,
      lineage: { kind: "revision", parent: null },
    },
    rules: `${serializeRules(combinedRules(resolution.contexts))}\n`,
    scenes,
    dialogues,
  });
}

/**
 * The next free patch version for this cartridge id. Forging twice from one draft is ordinary —
 * the author fixes a line and forges again — and a revision is immutable, so the second forge is
 * 1.0.1, not a "version already exists" dead end. The build timestamp is part of the hashed
 * manifest, so even an unchanged draft is genuinely different content.
 */
async function nextVersion(cartridgeId: string): Promise<Result<string>> {
  const library = await window.seed.cartridges.list();
  if (!library.ok) return library;
  const patches = library.value
    .filter((manifest) => manifest.cartridgeId === cartridgeId)
    .map((manifest) => /^1\.0\.(\d+)$/.exec(manifest.version))
    .flatMap((match) => (match?.[1] === undefined ? [] : [Number(match[1])]));
  return ok(`1.0.${patches.length === 0 ? 0 : Math.max(...patches) + 1}`);
}

export async function forgeAuthoring(
  snapshot: AuthoringSnapshot,
  resolution: CapabilityResolution,
  createInstance: boolean,
): Promise<Result<{ manifest: CartridgeManifest; instance: InstanceMeta | null }>> {
  const input = await buildCartridge(snapshot, resolution);
  if (!input.ok) return input;
  const version = await nextVersion(input.value.manifest.cartridgeId);
  if (!version.ok) return version;
  const published = await window.seed.cartridges.publish({
    ...input.value,
    manifest: { ...input.value.manifest, version: version.value },
  });
  if (!published.ok) return published;
  if (!createInstance) return ok({ manifest: published.value, instance: null });
  const created = await window.seed.instances.create({
    cartridgeId: published.value.cartridgeId,
    version: published.value.version,
    name: published.value.name,
  });
  return created.ok
    ? ok({ manifest: published.value, instance: created.value.instance.meta })
    : created;
}
