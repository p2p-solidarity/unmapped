// The engine publishes "the player pressed E on this target"; this turns it into the app-level
// consequence. Everything it reports comes from the parsed scene — when the scene has no such
// entity we say so instead of inventing loot or a line.

import { startDialogue } from "@renderer/narrative";
import { useEngineStore, useSessionStore, useWorldStore } from "@renderer/state";
import type { NearbyTarget } from "@shared/events";
import type { SceneGraph } from "@shared/world";
import { useEffect, useRef } from "react";
import { makeKarmaEntry } from "./karmaFile";

export interface InteractionHandlers {
  /**
   * PlayScreen owns the floor-transition overlay, so the exit handler is injected. `targetSceneId`
   * is the stable destination of a cartridge exit; null means the ending gate (or a legacy exit).
   */
  onAdvanceFloor(to: string, targetSceneId: string | null): void;
}

function session() {
  return useSessionStore.getState();
}

function currentScene(): SceneGraph | null {
  const scene = useWorldStore.getState().scene;
  return scene.status === "ready" ? scene.value : null;
}

function openTreasure(target: NearbyTarget, scene: SceneGraph | null): void {
  const treasure = scene?.treasures.find((item) => item.id === target.id);
  if (treasure === undefined) {
    session().toast("danger", `Treasure "${target.id}" is not in the current scene.`);
    return;
  }
  const world = useWorldStore.getState();
  const engine = useEngineStore.getState();
  if (engine.openedTreasures.includes(treasure.id)) return;
  engine.markTreasureOpened(treasure.id);
  if (treasure.loot.length > 0) world.addMaterials(treasure.loot);
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "trade",
      choice: `opened ${treasure.id}`,
      effect: treasure.loot.join(", "),
    }),
  );
  session().toast(
    treasure.loot.length > 0 ? "success" : "info",
    treasure.loot.length > 0 ? `Found: ${treasure.loot.join(", ")}` : "The chest is empty.",
  );
}

function inspectMonster(target: NearbyTarget, scene: SceneGraph | null): void {
  const monster = scene?.monsters.find((item) => item.id === target.id);
  const weakness = monster?.weakness.trim() ?? "";
  session().toast(
    "info",
    weakness.length > 0
      ? `Combat is not in this build yet — the model gave it weakness: ${weakness}`
      : "Combat is not in this build yet.",
  );
}

function pullTrigger(target: NearbyTarget, scene: SceneGraph | null): void {
  const trigger = scene?.triggers.find((item) => item.id === target.id);
  if (trigger === undefined) {
    session().toast("danger", `Trigger "${target.id}" is not in the current scene.`);
    return;
  }
  const world = useWorldStore.getState();
  world.appendKarma(
    makeKarmaEntry({
      floor: world.floor,
      action: "talk",
      choice: target.label.trim().length > 0 ? target.label : trigger.id,
      effect: trigger.event,
    }),
  );
  session().toast("info", trigger.event);
}

type Advance = InteractionHandlers["onAdvanceFloor"];

function descend(target: NearbyTarget, scene: SceneGraph | null, advance: Advance): void {
  const exit =
    scene?.exits.find((item) => item.to === target.id) ??
    scene?.exits.find((item) => item.to === target.label);
  const to = exit?.to ?? target.label.trim();
  if (to.length === 0) {
    session().toast("danger", "This exit has no destination label.");
    return;
  }
  advance(to, exit?.targetSceneId ?? null);
}

function dispatch(target: NearbyTarget, advance: Advance): void {
  const scene = currentScene();
  switch (target.kind) {
    case "npc":
      startDialogue(target.id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        session().toast("danger", `Dialogue failed: ${message}`);
      });
      return;
    case "altar":
      session().openAltar();
      return;
    case "treasure":
      openTreasure(target, scene);
      return;
    case "exit":
      descend(target, scene, advance);
      return;
    case "monster":
      inspectMonster(target, scene);
      return;
    case "trigger":
      pullTrigger(target, scene);
      return;
  }
}

export function useInteractions({ onAdvanceFloor }: InteractionHandlers): void {
  const advanceRef = useRef(onAdvanceFloor);
  useEffect(() => {
    advanceRef.current = onAdvanceFloor;
  }, [onAdvanceFloor]);

  useEffect(() => {
    let seen = useEngineStore.getState().interactSeq;
    return useEngineStore.subscribe((state) => {
      if (state.interactSeq === seen) return;
      seen = state.interactSeq;
      const target = state.lastInteract;
      if (target === null) return;
      dispatch(target, (to, targetSceneId) => advanceRef.current(to, targetSceneId));
    });
  }, []);
}
