// Descending a floor: ask the narrative layer for the next scene, and only when it parses do we
// swap the world. A failure is an overlay with Retry/Stay — never a hand-written fallback floor
// (Rule 2 / Rule 7). The transition lives in the session store (`busy` + `floorFailure`) so the
// input lock and the overlay read the same value instead of each re-deriving it.

import { translate } from "@renderer/i18n";
import { generateSceneArtifact, generationEventLabel } from "@renderer/narrative";
import { requestRoomTransition } from "@renderer/net/sync";
import { useEngineStore, useRunStore, useSessionStore, useWorldStore } from "@renderer/state";
import { assetsForScene } from "@shared/assets";
import { ready } from "@shared/result";
import { WORLD_FILES } from "@shared/world";
import { useCallback } from "react";
import { hasDepths } from "./endlessScene";
import { makeKarmaEntry } from "./karmaFile";
import { hydrateInstance } from "./useInstanceLoader";
import { checkpointCurrentInstance } from "./usePersistWorld";

export interface FloorAdvanceApi {
  /**
   * `to` is the exit label the model wrote (it seeds a legacy floor's prompt); `targetSceneId` is a
   * cartridge exit's stable destination, null at the ending gate.
   */
  advance(to: string, targetSceneId: string | null): void;
  retry(): void;
  stay(): void;
  cancel(): void;
  /** Below the ending: the next generated floor of the endless depths. */
  descend(): void;
}

let activeFloorGeneration: AbortController | null = null;

export function busyLabel(floor: number): string {
  return `Weaving floor ${floor}…`;
}

/**
 * Cartridge play: a transition to the exit's declared scene, or the ending when the exit has no
 * target. Both are deterministic main-process operations on the pinned revision — no model.
 */
function advanceInstance(instanceId: string, to: string, targetSceneId: string | null): void {
  const session = useSessionStore.getState();
  if (session.networkRole === "peer" && requestRoomTransition(targetSceneId)) {
    session.setBusy(targetSceneId === null ? "Waiting for host…" : "Host is loading next scene…");
    return;
  }
  session.setFloorFailure(null);
  session.setBusy(targetSceneId === null ? "Reaching the ending…" : "Loading next scene…");
  void (async () => {
    const checkpoint = await checkpointCurrentInstance();
    if (!checkpoint.ok) {
      const active = useSessionStore.getState();
      active.setBusy(null);
      active.toast("danger", checkpoint.error.message);
      return;
    }
    const result =
      targetSceneId === null
        ? await window.seed.instances.complete(instanceId)
        : await window.seed.instances.transition(instanceId, targetSceneId);
    const active = useSessionStore.getState();
    active.setBusy(null);
    if (!result.ok) {
      active.toast(
        "danger",
        `${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ""}`,
      );
      return;
    }
    const hydrated = hydrateInstance(result.value);
    if (!hydrated.ok) {
      active.toast("danger", hydrated.error.message);
      return;
    }
    if (targetSceneId === null) {
      const { manifest } = result.value.cartridge;
      useWorldStore.getState().appendKarma(
        makeKarmaEntry({
          floor: useWorldStore.getState().floor,
          action: "floor",
          choice: to,
          effect: "cartridge complete",
        }),
      );
      active.setEnding({
        name: manifest.name,
        finale:
          manifest.formatVersion === 2
            ? manifest.definition.narrative.finale
            : manifest.story.finale,
        depths: hasDepths(result.value.cartridge),
      });
    }
  })();
}

/** One floor deeper. Main only records the depth; the floor is regenerated from it on hydrate. */
function descendInstance(): void {
  const session = useSessionStore.getState();
  const world = useWorldStore.getState();
  if (session.busy !== null || world.origin?.kind !== "instance") return;
  if (session.networkRole === "peer") {
    session.toast("info", "Only the host can take a room into the depths.");
    return;
  }
  const { instanceId } = world.origin;
  const depth = (session.activeInstance?.instance.save.endless?.depth ?? 0) + 1;
  session.setEnding(null);
  session.setFloorFailure(null);
  session.setBusy(translate("descending", { depth }));
  void (async () => {
    const checkpoint = await checkpointCurrentInstance();
    const result = checkpoint.ok ? await window.seed.instances.descend(instanceId) : checkpoint;
    const active = useSessionStore.getState();
    active.setBusy(null);
    if (!result.ok) {
      active.toast(
        "danger",
        `${result.error.message}${result.error.hint ? ` — ${result.error.hint}` : ""}`,
      );
      return;
    }
    // The run carries on: score, kills and level stay, and a cleared floor is running again.
    useRunStore.getState().descend();
    const hydrated = hydrateInstance(result.value);
    if (!hydrated.ok) {
      active.toast("danger", hydrated.error.message);
      return;
    }
    const store = useWorldStore.getState();
    store.appendKarma(
      makeKarmaEntry({
        floor: store.floor,
        action: "floor",
        choice: translate("reachedDepth", { depth }),
        effect: "endless depth",
      }),
    );
    active.toast("success", translate("reachedDepth", { depth }));
  })();
}

function start(to: string, targetSceneId: string | null): void {
  const session = useSessionStore.getState();
  if (session.busy !== null) return;
  const world = useWorldStore.getState();
  if (world.origin?.kind === "instance") {
    advanceInstance(world.origin.instanceId, to, targetSceneId);
    return;
  }
  const { meta, genesis } = world;
  if (meta === null || genesis === null || !("archetype" in genesis)) {
    session.toast("danger", "No world is loaded.");
    return;
  }
  const floor = world.floor + 1;
  if (world.scene.status !== "ready") {
    session.toast("danger", "The current scene is not ready to expand.");
    return;
  }
  const currentScene = world.scene.value;
  session.setFloorFailure(null);
  session.setBusy(busyLabel(floor));
  const controller = new AbortController();
  activeFloorGeneration = controller;
  void (async () => {
    const requestId = crypto.randomUUID();
    const result = await generateSceneArtifact(
      {
        intent: {
          requestId,
          purpose: "expand-room",
          sceneId: `floor-${floor}`,
          language: genesis.language,
          brief: [
            `Expand this world into floor ${floor}.`,
            `World intent: ${genesis.intent}`,
            `The player arrived through the exit labelled "${to}".`,
            "Preserve continuity with the current room and create a complete next room.",
          ]
            .join("\n")
            .slice(0, 2_000),
        },
        state: {
          worldPlan: null,
          currentSceneSource: world.sceneSource,
          flags: meta.flags,
          inventory: world.inventory.items,
          assetCatalog: assetsForScene(currentScene),
          capabilityProfile: { entries: [] },
        },
        maxRepairAttempts: 2,
      },
      (event) => {
        const label = generationEventLabel(event);
        if (label !== null) useSessionStore.getState().setBusy(label);
      },
      controller.signal,
    );
    if (activeFloorGeneration === controller) activeFloorGeneration = null;
    const session2 = useSessionStore.getState();
    session2.setBusy(null);
    if (!result.ok) {
      if (result.error.code === "request-aborted") {
        session2.toast("info", "Scene generation cancelled.");
        return;
      }
      session2.setFloorFailure({ to, floor, error: result.error });
      return;
    }
    const { source, graph } = result.value;
    const store = useWorldStore.getState();
    store.setScene(source, ready(graph));
    store.setFloor(floor);
    store.appendKarma(makeKarmaEntry({ floor, action: "floor", choice: to, effect: graph.name }));
    useEngineStore.getState().resetFloor();
    // meta.json follows from the floor change (usePersistWorld); world.oui is written here.
    const written = await window.seed.worlds.write(meta.id, WORLD_FILES.scene, source);
    if (!written.ok) {
      session2.toast("danger", `world.oui could not be saved: ${written.error.message}`);
    }
  })();
}

export function useFloorAdvance(): FloorAdvanceApi {
  const advance = useCallback(
    (to: string, targetSceneId: string | null) => start(to, targetSceneId),
    [],
  );

  // Only legacy floors can fail to be written (they are generated); a retry re-asks for `to`.
  const retry = useCallback(() => {
    const failure = useSessionStore.getState().floorFailure;
    if (failure !== null) start(failure.to, null);
  }, []);

  const stay = useCallback(() => {
    useSessionStore.getState().setFloorFailure(null);
  }, []);

  const cancel = useCallback(() => {
    const controller = activeFloorGeneration;
    if (controller === null) return;
    useSessionStore.getState().setBusy("Cancelling scene generation…");
    controller.abort();
  }, []);

  const descend = useCallback(() => descendInstance(), []);

  return { advance, retry, stay, cancel, descend };
}
