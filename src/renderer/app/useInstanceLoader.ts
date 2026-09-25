import { parseRules, parseScene } from "@dsl/index";
import { behaviorForKit, resolveSceneKit } from "@renderer/engine/kits/registry";
import { clearPlayerSample } from "@renderer/engine/playerProbe";
import { useEngineStore, useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import { emptyProgress } from "@renderer/state/landStore";
import { bibleLanguage, type InstanceMeta, type ResolvedInstance } from "@shared/cartridge";
import { err, ok, type Result, ready } from "@shared/result";
import { rulesForSceneContext } from "@shared/runtime-context";
import type { WorldMeta } from "@shared/world";
import { endlessScene } from "./endlessScene";
import { loadLand } from "./land/loadLand";

function toastError(message: string, hint?: string): void {
  useSessionStore.getState().toast("danger", `${message}${hint ? ` — ${hint}` : ""}`);
}

export function hydrateInstance(resolved: ResolvedInstance): Result<InstanceMeta> {
  const { instance, cartridge } = resolved;
  const authoredSource = cartridge.scenes[instance.save.currentSceneId];
  if (authoredSource === undefined) {
    return err(
      "instance-scene-missing",
      `Scene ${instance.save.currentSceneId} is absent from the pinned cartridge.`,
      "Restore the exact cartridge revision used by this instance.",
    );
  }
  const rules = parseRules(cartridge.rules);
  if (!rules.ok) return rules;
  // Below the ending the floor is generated from the save's depth; above it, it is the authored scene.
  const endless = endlessScene(cartridge, instance.save, rules.value);
  if (!endless.ok) return endless;
  const authored = parseScene(authoredSource);
  if (!authored.ok) return authored;
  const source = endless.value?.source ?? authoredSource;
  const scene = endless.value?.graph ?? authored.value;
  // A generated floor plays under the capability context of the authored scene it continues.
  const contextScene = endless.value?.template ?? authored.value;
  const selectedRules =
    cartridge.manifest.formatVersion === 2
      ? rulesForSceneContext(cartridge.manifest.definition, rules.value, contextScene)
      : rules;
  if (!selectedRules.ok) return selectedRules;
  const runtimeGraph =
    cartridge.manifest.formatVersion === 2 && scene.contract !== null
      ? { ...scene, contract: { ...scene.contract, kit: selectedRules.value.defaultKit } }
      : scene;
  const kit = resolveSceneKit(selectedRules.value, runtimeGraph);
  if (!kit.ok) return kit;

  const worldMeta: WorldMeta = {
    id: instance.meta.instanceId,
    name: instance.meta.name,
    ...(cartridge.manifest.formatVersion === 1
      ? { archetype: cartridge.manifest.genesis.archetype }
      : {}),
    createdAt: instance.meta.createdAt,
    updatedAt: instance.meta.updatedAt,
    floor:
      endless.value === null
        ? instance.save.completedSceneIds.length + 1
        : instance.save.completedSceneIds.length + endless.value.depth,
    mutation: instance.save.mutation,
    flags: instance.save.flags,
    mods: [],
  };
  clearPlayerSample();
  useWorldStore.getState().loadInstance({
    instanceId: instance.meta.instanceId,
    meta: worldMeta,
    genesis:
      cartridge.manifest.formatVersion === 1
        ? cartridge.manifest.genesis
        : {
            language: bibleLanguage(cartridge.bible) ?? navigator.language,
            intent:
              cartridge.manifest.definition.narrative.premise || cartridge.manifest.description,
          },
    sceneSource: source,
    scene: ready(runtimeGraph),
    karma: instance.karma,
    inventory: instance.save.inventory,
    gameplayRules: selectedRules.value,
  });
  useEngineStore.getState().setCameraMode(behaviorForKit(kit.value.id).camera);
  useEngineStore.getState().resetFloor();
  useSessionStore.getState().setActiveInstance(resolved);
  // A visitor walks the host's land, which arrives through the room — never from this disk.
  if (useSessionStore.getState().networkRole !== "peer") {
    if (useLandStore.getState().instanceId !== instance.meta.instanceId) {
      void loadLand(instance.meta.instanceId);
    }
    useLandStore.getState().setProgress(instance.save.land ?? emptyProgress());
  }
  return ok(instance.meta);
}

export async function openInstance(instanceId: string): Promise<void> {
  const resolved = await window.seed.instances.resolve(instanceId);
  if (!resolved.ok) {
    toastError(resolved.error.message, resolved.error.hint);
    return;
  }
  const hydrated = hydrateInstance(resolved.value);
  if (!hydrated.ok) {
    toastError(hydrated.error.message, hydrated.error.hint);
    return;
  }
  useSessionStore.getState().setScreen("play");
}
