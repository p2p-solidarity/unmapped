import { parseRules, parseScene } from "@dsl/index";
import { resolveSceneKit } from "@renderer/engine/kits/registry";
import { useEngineStore, useSessionStore, useWorldStore } from "@renderer/state";
import type { InstanceMeta, ResolvedInstance } from "@shared/cartridge";
import { err, ok, type Result, ready } from "@shared/result";
import type { WorldMeta } from "@shared/world";

function toastError(message: string, hint?: string): void {
  useSessionStore.getState().toast("danger", `${message}${hint ? ` — ${hint}` : ""}`);
}

export function hydrateInstance(resolved: ResolvedInstance): Result<InstanceMeta> {
  const { instance, cartridge } = resolved;
  const source = cartridge.scenes[instance.save.currentSceneId];
  if (source === undefined) {
    return err(
      "instance-scene-missing",
      `Scene ${instance.save.currentSceneId} is absent from the pinned cartridge.`,
      "Restore the exact cartridge revision used by this instance.",
    );
  }
  const scene = parseScene(source);
  if (!scene.ok) return scene;
  const rules = parseRules(cartridge.rules);
  if (!rules.ok) return rules;
  const kit = resolveSceneKit(rules.value, scene.value);
  if (!kit.ok) return kit;

  const worldMeta: WorldMeta = {
    id: instance.meta.instanceId,
    name: instance.meta.name,
    archetype: cartridge.manifest.genesis.archetype,
    createdAt: instance.meta.createdAt,
    updatedAt: instance.meta.updatedAt,
    floor: instance.save.completedSceneIds.length + 1,
    mutation: instance.save.mutation,
    flags: instance.save.flags,
    mods: [],
  };
  useWorldStore.getState().loadInstance({
    instanceId: instance.meta.instanceId,
    meta: worldMeta,
    genesis: cartridge.manifest.genesis,
    sceneSource: source,
    scene: ready(scene.value),
    karma: instance.karma,
    inventory: instance.save.inventory,
    gameplayRules: rules.value,
  });
  const camera = {
    "tps_exploration@1": "orbit",
    "fps_puzzle@1": "fps",
    "platformer_2_5d@1": "side",
    "topdown_puzzle@1": "topdown",
  } as const;
  useEngineStore.getState().setCameraMode(camera[kit.value.id]);
  useEngineStore.getState().resetFloor();
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
