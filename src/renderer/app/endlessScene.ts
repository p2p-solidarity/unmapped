// The generated floor a save is standing on, rebuilt from its endless depth.
//
// The floor goes through the DSL like any other scene: generated as a graph, written out as an
// OpenUI Lang program, and parsed back (Rule 7), so clamps and limits apply to it exactly as they
// apply to authored content.

import { parseScene, serializeScene } from "@dsl/index";
import { translate } from "@renderer/i18n";
import type { CartridgeRevision, SaveState } from "@shared/cartridge";
import { type AuthoredScene, endlessFloor, endlessTemplate } from "@shared/endless";
import type { GameplayRules } from "@shared/gameplay";
import { err, ok, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";

function authoredScenes(cartridge: CartridgeRevision): Result<AuthoredScene[]> {
  const { manifest } = cartridge;
  const ids =
    manifest.formatVersion === 1
      ? manifest.scenes.map((scene) => scene.id)
      : manifest.definition.scenePlan.orderedSceneIds;
  const scenes: AuthoredScene[] = [];
  for (const sceneId of ids) {
    const parsed = parseScene(cartridge.scenes[sceneId] ?? "");
    if (!parsed.ok) return parsed;
    scenes.push({ sceneId, graph: parsed.value });
  }
  return ok(scenes);
}

/** True when this cartridge has a scene the depths can continue from. */
export function hasDepths(cartridge: CartridgeRevision): boolean {
  const scenes = authoredScenes(cartridge);
  return scenes.ok && endlessTemplate(scenes.value) !== null;
}

export interface EndlessScene {
  source: string;
  graph: SceneGraph;
  /** The authored scene whose capability context the floor plays under. */
  template: SceneGraph;
  depth: number;
}

export function endlessScene(
  cartridge: CartridgeRevision,
  save: SaveState,
  rules: GameplayRules,
): Result<EndlessScene | null> {
  const endless = save.endless;
  if (endless === undefined) return ok(null);
  const scenes = authoredScenes(cartridge);
  if (!scenes.ok) return scenes;
  const floor = endlessFloor({
    scenes: scenes.value,
    seed: endless.seed,
    depth: endless.depth,
    combat: rules.combat !== null,
    objectiveText: {
      clear: translate("depths.objectiveClear"),
      loot: translate("depths.objectiveLoot"),
      reach: translate("depths.objectiveReach"),
    },
  });
  if (floor === null) {
    return err(
      "endless-unavailable",
      "This cartridge has no scene you can walk in, so it has no depths below it.",
      "Restore the exact cartridge revision this save was pinned to.",
    );
  }
  const source = `${serializeScene(floor.graph)}\n`;
  const graph = parseScene(source);
  if (!graph.ok) return graph;
  return ok({ source, graph: graph.value, template: floor.template.graph, depth: endless.depth });
}
