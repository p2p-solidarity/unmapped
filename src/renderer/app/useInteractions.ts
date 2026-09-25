// The engine publishes "the player pressed E on this target"; this turns it into the app-level
// consequence. Everything it reports comes from the parsed scene — when the scene has no such
// entity we say so instead of inventing loot or a line.

import { foreignDoorOf } from "@renderer/engine/home";
import { translate } from "@renderer/i18n";
import { startDialogue } from "@renderer/narrative";
import { sendRoomInteraction } from "@renderer/net/sync";
import {
  useContinentStore,
  useEncounterStore,
  useEngineStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { parseChapterTarget } from "@shared/chapter";
import { endlessObjectiveOf } from "@shared/endless";
import type { NearbyTarget } from "@shared/events";
import { parsePlaceTarget } from "@shared/places";
import { parseEpisodeTarget } from "@shared/story";
import type { SceneGraph } from "@shared/world";
import { useEffect, useRef } from "react";
import { makeKarmaEntry } from "./karmaFile";
import { openChapterTreasure, talkChapter } from "./land/chapters";
import { searchAt } from "./land/errands";
import { enterPlace, leavePlace } from "./land/places";
import { talkOnLand } from "./land/talk";

export interface InteractionHandlers {
  /**
   * PlayScreen owns the floor-transition overlay, so the exit handler is injected. `targetSceneId`
   * is the stable destination of a cartridge exit; null means the ending gate (or a legacy exit).
   */
  onAdvanceFloor(to: string, targetSceneId: string | null): void;
  /** Stairs on a generated floor below the ending: one depth further down. */
  onDescend(): void;
}

function session() {
  return useSessionStore.getState();
}

function currentScene(): SceneGraph | null {
  // Inside a place, what the player can touch is the place's.
  const place = useSessionStore.getState().place;
  if (place !== null) return place.graph;
  const scene = useWorldStore.getState().scene;
  return scene.status === "ready" ? scene.value : null;
}

function openTreasure(target: NearbyTarget, scene: SceneGraph | null): void {
  const treasure = scene?.treasures.find((item) => item.id === target.id);
  if (treasure === undefined) {
    session().toast("danger", translate("hud.treasureMissing", { id: target.id }));
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
    treasure.loot.length > 0
      ? translate("hud.found", { loot: treasure.loot.join(", ") })
      : translate("hud.chestEmpty"),
  );
}

function inspectMonster(target: NearbyTarget, scene: SceneGraph | null): void {
  const monster = scene?.monsters.find((item) => item.id === target.id);
  const weakness = monster?.weakness.trim() ?? "";
  session().toast(
    "info",
    weakness.length > 0
      ? translate("hud.noCombatWeakness", { weakness })
      : translate("hud.noCombat"),
  );
}

function pullTrigger(target: NearbyTarget, scene: SceneGraph | null): void {
  const trigger = scene?.triggers.find((item) => item.id === target.id);
  if (trigger === undefined) {
    session().toast("danger", translate("hud.triggerMissing", { id: target.id }));
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

type Handlers = Pick<InteractionHandlers, "onAdvanceFloor" | "onDescend">;

/** How much of a generated floor's objective is still undone; 0 lets the stairs open. */
function objectiveLeft(scene: SceneGraph): number {
  const objective = endlessObjectiveOf(scene);
  if (objective === "clear") {
    return useEncounterStore
      .getState()
      .combatants.filter((one) => one.side === "hostile" && one.hp > 0).length;
  }
  if (objective === "loot") {
    const opened = useEngineStore.getState().openedTreasures;
    return scene.treasures.filter((one) => !opened.includes(one.id)).length;
  }
  return 0;
}

function descend(target: NearbyTarget, scene: SceneGraph | null, handlers: Handlers): void {
  const exit =
    scene?.exits.find((item) => item.to === target.id) ??
    scene?.exits.find((item) => item.to === target.label);

  // A floor of the endless depths: its stairs lead one depth down once its objective is done.
  if (scene !== null && useSessionStore.getState().activeInstance?.instance.save.endless) {
    const left = objectiveLeft(scene);
    if (left > 0) {
      session().toast("info", translate("depths.objectiveUnmet", { left }));
      return;
    }
    handlers.onDescend();
    return;
  }

  const to = exit?.to ?? target.label.trim();
  if (to.length === 0) {
    session().toast("danger", translate("hud.exitNoLabel"));
    return;
  }
  handlers.onAdvanceFloor(to, exit?.targetSceneId ?? null);
}

function dispatch(target: NearbyTarget, handlers: Handlers): void {
  const scene = currentScene();
  switch (target.kind) {
    case "npc":
      // Someone of the story's chapter: their words were written with the chapter.
      if (parseChapterTarget(target.id) !== null) {
        talkChapter(target.id);
        return;
      }
      // Open land: every word was written when the place was witnessed; nothing is generated now.
      if (useEngineStore.getState().chunk !== null) {
        talkOnLand(target.id);
        return;
      }
      startDialogue(target.id).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        session().toast("danger", translate("hud.dialogueFailed", { reason: message }));
      });
      return;
    case "altar":
      session().openAltar();
      return;
    case "treasure":
      if (parseChapterTarget(target.id) !== null) openChapterTreasure(target.id);
      else openTreasure(target, scene);
      return;
    case "exit": {
      // A place's exits lead back out onto the land; its far end counts as crossing it.
      const place = session().place;
      if (place !== null) {
        const exit = place.graph.exits.find((one) => one.to === target.label);
        leavePlace(exit?.x === place.goalExit.x && exit?.z === place.goalExit.z);
        return;
      }
      descend(target, scene, handlers);
      return;
    }
    case "monster":
      inspectMonster(target, scene);
      return;
    case "trigger":
      pullTrigger(target, scene);
      return;
    case "search":
      searchAt(target.id);
      return;
    case "door": {
      if (document.pointerLockElement !== null) document.exitPointerLock();
      // Another world's door on the continent opens its card; home's own door opens the dials.
      const foreign = foreignDoorOf(target.id);
      if (foreign !== null) useContinentStore.getState().openDoorCard(foreign);
      else session().openDoor();
      return;
    }
    case "episode": {
      const id = parseEpisodeTarget(target.id);
      if (id !== null) session().openEpisode(id);
      return;
    }
    case "place": {
      const id = parsePlaceTarget(target.id);
      if (id !== null) enterPlace(id);
      return;
    }
  }
}

export function useInteractions({ onAdvanceFloor, onDescend }: InteractionHandlers): void {
  const handlersRef = useRef<Handlers>({ onAdvanceFloor, onDescend });
  useEffect(() => {
    handlersRef.current = { onAdvanceFloor, onDescend };
  }, [onAdvanceFloor, onDescend]);

  useEffect(() => {
    let seen = useEngineStore.getState().interactSeq;
    return useEngineStore.subscribe((state) => {
      if (state.interactSeq === seen) return;
      seen = state.interactSeq;
      const target = state.lastInteract;
      if (target === null) return;
      // A visitor reads open-land words from the mirrored land; only other interactions go to the host.
      const readsLocally = target.kind === "npc" && useEngineStore.getState().chunk !== null;
      if (
        !readsLocally &&
        useSessionStore.getState().networkRole === "peer" &&
        sendRoomInteraction(target)
      ) {
        return;
      }
      dispatch(target, handlersRef.current);
    });
  }, []);
}
