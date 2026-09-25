// Pure SceneGraph edits for the effects that change what is standing on the floor. Nothing here
// touches a store, the DSL serializer or IPC — the effect provider does that — so the rules about
// what a tool may do to a floor are testable on their own.
//
// Every id in a scene is unique across NPCs, monsters, treasures, triggers and quests: the engine
// and the dialogue layer both address entities by id alone, so a duplicate would make "talk to
// gate_7" ambiguous. A spawn that would collide fails instead of overwriting.

import type { GameEffect } from "@shared/effects";
import type { SceneGraph } from "@shared/world";

export type SceneEdit =
  | { ok: true; scene: SceneGraph; message: string }
  | { ok: false; message: string };

/** Effects that rewrite the floor, as opposed to the atmosphere, the inventory or a flag. */
export type SceneEffect = Extract<
  GameEffect,
  { kind: "spawn_monster" | "spawn_npc" | "remove_entity" | "add_quest" | "complete_quest" }
>;

export function isSceneEffect(effect: GameEffect): effect is SceneEffect {
  return (
    effect.kind === "spawn_monster" ||
    effect.kind === "spawn_npc" ||
    effect.kind === "remove_entity" ||
    effect.kind === "add_quest" ||
    effect.kind === "complete_quest"
  );
}

/** Every id currently taken on this floor. */
export function sceneIds(scene: SceneGraph): string[] {
  return [
    ...scene.npcs.map((npc) => npc.id),
    ...scene.monsters.map((monster) => monster.id),
    ...scene.treasures.map((treasure) => treasure.id),
    ...scene.triggers.map((trigger) => trigger.id),
    ...scene.quests.map((quest) => quest.id),
  ];
}

function taken(scene: SceneGraph, id: string): boolean {
  return sceneIds(scene).includes(id);
}

export function applySceneEffect(scene: SceneGraph, effect: SceneEffect): SceneEdit {
  switch (effect.kind) {
    case "spawn_monster": {
      const { monster } = effect;
      if (taken(scene, monster.id)) {
        return { ok: false, message: `id "${monster.id}" is already used on this floor` };
      }
      return {
        ok: true,
        scene: { ...scene, monsters: [...scene.monsters, monster] },
        message: `spawned ${monster.kind} "${monster.id}" at ${monster.x},${monster.z}`,
      };
    }

    case "spawn_npc": {
      const { npc } = effect;
      if (taken(scene, npc.id)) {
        return { ok: false, message: `id "${npc.id}" is already used on this floor` };
      }
      return {
        ok: true,
        scene: { ...scene, npcs: [...scene.npcs, npc] },
        message: `${npc.name} (${npc.id}) is now on this floor`,
      };
    }

    case "remove_entity": {
      const { id } = effect;
      const next: SceneGraph = {
        ...scene,
        npcs: scene.npcs.filter((npc) => npc.id !== id),
        monsters: scene.monsters.filter((monster) => monster.id !== id),
        treasures: scene.treasures.filter((treasure) => treasure.id !== id),
        triggers: scene.triggers.filter((trigger) => trigger.id !== id),
      };
      const removed =
        scene.npcs.length -
        next.npcs.length +
        (scene.monsters.length - next.monsters.length) +
        (scene.treasures.length - next.treasures.length) +
        (scene.triggers.length - next.triggers.length);
      if (removed === 0) return { ok: false, message: `no entity "${id}" on this floor` };
      return { ok: true, scene: next, message: `removed "${id}"` };
    }

    case "add_quest": {
      const { quest } = effect;
      if (taken(scene, quest.id)) {
        return { ok: false, message: `id "${quest.id}" is already used on this floor` };
      }
      return {
        ok: true,
        scene: { ...scene, quests: [...scene.quests, quest] },
        message: `added quest "${quest.id}"`,
      };
    }

    case "complete_quest": {
      const { id } = effect;
      const quests = scene.quests.filter((quest) => quest.id !== id);
      if (quests.length === scene.quests.length) {
        return { ok: false, message: `no quest "${id}" on this floor` };
      }
      return { ok: true, scene: { ...scene, quests }, message: `completed quest "${id}"` };
    }
  }
}
