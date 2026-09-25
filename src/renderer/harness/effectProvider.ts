// The one place a model tool call becomes a change to the running game (Rule 11). The harness
// validates a `GameEffect` against its schema and hands it here; this provider maps it onto the
// zustand stores and the world's dotfiles, and answers with an `EffectOutcome` the model sees.
//
// The outcomes are honest: an effect that did nothing says so, a save that failed says why, and an
// effect the engine cannot honour yet returns `ok: false` instead of pretending (Rule 2). The model
// reads these messages, so they are written to be read by it.

import { parseScene, serializeScene } from "@dsl";
import { useSessionStore } from "@renderer/state/sessionStore";
import { useWorldStore } from "@renderer/state/worldStore";
import type { EffectOutcome, GameEffect, WorldFlags } from "@shared/effects";
import type { AppError } from "@shared/result";
import { ready } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { CARTRIDGE_IMMUTABLE, persistInventory, persistMeta, persistScene } from "./persist";
import { applySceneEffect, isSceneEffect, type SceneEffect } from "./sceneEdits";

const failed = (message: string): EffectOutcome => ({ ok: false, message });
const done = (message: string): EffectOutcome => ({ ok: true, message });

function saveFailed(what: string, error: AppError): EffectOutcome {
  const hint = error.hint === undefined ? "" : ` (${error.hint})`;
  return failed(`${what} but could not be saved: ${error.message}${hint}`);
}

/**
 * The scene the next edit builds on. `sceneSource` is what is actually in `world.oui`, so basing
 * edits on it keeps the persisted atmosphere overlay out of the file — `setScene` re-applies the
 * overlay to what the engine renders. If the source will not parse (a player mid-edit), the graph
 * the engine is already rendering is the only truthful base.
 */
function baseScene(): SceneGraph | null {
  const world = useWorldStore.getState();
  const parsed = parseScene(world.sceneSource);
  if (parsed.ok) return parsed.value;
  return world.scene.status === "ready" ? world.scene.value : null;
}

async function commitScene(effect: SceneEffect): Promise<EffectOutcome> {
  // Instance play runs a published revision: the floor is not the model's to rewrite (plan §三).
  if (useWorldStore.getState().origin?.kind === "instance") {
    return failed(`${CARTRIDGE_IMMUTABLE.message} ${CARTRIDGE_IMMUTABLE.hint}`);
  }
  const base = baseScene();
  if (base === null) return failed("there is no floor loaded to change");

  const edit = applySceneEffect(base, effect);
  if (!edit.ok) return failed(edit.message);

  // Round-trip through the DSL: the parser is the source of truth, so an edit that cannot be
  // written as a valid program never reaches the engine or the file (Rule 7).
  const source = serializeScene(edit.scene);
  const parsed = parseScene(source);
  if (!parsed.ok) {
    return failed(`${edit.message}, but the floor no longer parses: ${parsed.error.message}`);
  }

  useWorldStore.getState().setScene(source, ready(parsed.value));
  const error = await persistScene(source);
  return error === null ? done(edit.message) : saveFailed(edit.message, error);
}

async function commitInventory(message: string): Promise<EffectOutcome> {
  const error = await persistInventory(useWorldStore.getState().inventory);
  return error === null ? done(message) : saveFailed(message, error);
}

async function commitMeta(message: string): Promise<EffectOutcome> {
  const meta = useWorldStore.getState().meta;
  if (meta === null) return failed("no world is loaded");
  const error = await persistMeta(meta);
  return error === null ? done(message) : saveFailed(message, error);
}

function mutateWorld(effect: Extract<GameEffect, { kind: "mutate_world" }>): EffectOutcome {
  const world = useWorldStore.getState();
  if (world.meta === null) return failed("no world is loaded");
  if (world.scene.status !== "ready") return failed("there is no floor loaded to change");
  if (effect.skyColor === null && effect.fogDensity === null && effect.biome === null) {
    return failed("nothing to change: sky colour, fog density and biome were all left empty");
  }
  world.applyMutation({
    skyColor: effect.skyColor,
    fogDensity: effect.fogDensity,
    biome: effect.biome,
  });
  const changed = [
    effect.skyColor === null ? null : `sky ${effect.skyColor}`,
    effect.fogDensity === null ? null : `fog ${effect.fogDensity}`,
    effect.biome === null ? null : `biome ${effect.biome}`,
  ].filter((part): part is string => part !== null);
  return done(`the world shifted: ${changed.join(", ")}`);
}

/** Only materials the player actually carries can be spent; the rest are reported as untouched. */
function splitCarried(materials: string[]): { taken: string[]; missing: string[] } {
  const pool = [...useWorldStore.getState().inventory.materials];
  const takenNames: string[] = [];
  const missing: string[] = [];
  for (const material of materials) {
    const index = pool.indexOf(material);
    if (index < 0) missing.push(material);
    else {
      pool.splice(index, 1);
      takenNames.push(material);
    }
  }
  return { taken: takenNames, missing };
}

async function apply(effect: GameEffect): Promise<EffectOutcome> {
  if (isSceneEffect(effect)) return commitScene(effect);

  switch (effect.kind) {
    case "mutate_world": {
      const outcome = mutateWorld(effect);
      if (!outcome.ok) return outcome;
      return commitMeta(outcome.message);
    }

    case "grant_materials": {
      if (effect.materials.length === 0) return failed("no materials were named");
      useWorldStore.getState().addMaterials(effect.materials);
      return commitInventory(`granted ${effect.materials.join(", ")}`);
    }

    case "consume_materials": {
      if (effect.materials.length === 0) return failed("no materials were named");
      const { taken, missing } = splitCarried(effect.materials);
      if (taken.length === 0) {
        return failed(`the player carries none of: ${effect.materials.join(", ")}`);
      }
      useWorldStore.getState().consumeMaterials(taken);
      const note =
        missing.length === 0 ? "" : ` (not carried, so untouched: ${missing.join(", ")})`;
      return commitInventory(`consumed ${taken.join(", ")}${note}`);
    }

    case "grant_item": {
      useWorldStore.getState().addItem(effect.item);
      return commitInventory(`granted the item "${effect.item.name}"`);
    }

    case "set_flag": {
      const meta = useWorldStore.getState().meta;
      if (meta === null) return failed("no world is loaded");
      const flags: WorldFlags = { ...meta.flags, [effect.key]: effect.value };
      useWorldStore.getState().setMeta({ ...meta, flags });
      return commitMeta(`flag ${effect.key} = ${String(effect.value)}`);
    }

    // The engine has no way to move the player's body from outside its own controller yet, so this
    // is refused rather than silently dropped.
    case "teleport_player":
      return failed("teleport is not available in this build");

    case "narrate": {
      const text = effect.text.trim();
      if (text.length === 0) return failed("there was nothing to narrate");
      useSessionStore.getState().toast("info", text);
      return done("told the player");
    }
  }
}

/** The function handed to `ctx.effects.provider`. */
export function createEffectProvider(): (effect: GameEffect) => Promise<EffectOutcome> {
  return async (effect: GameEffect): Promise<EffectOutcome> => {
    try {
      return await apply(effect);
    } catch (error) {
      return failed(
        `the world refused that change: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
