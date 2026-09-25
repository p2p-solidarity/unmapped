// `shooter_combat@1` + `turn_scheduler@1` + `team_party@1`, wired into the running 3D scene.
//
// The fight itself — trigger, cooldown, aim preview, other combatants' turns — is `combatLoop.ts`,
// shared with the open land. This component only feeds it the camera's aim and the frame clock,
// and binds the trigger. It renders nothing — the HUD reads the same store.

import { useFrame, useThree } from "@react-three/fiber";
import { useEncounterStore, useEngineStore, useRunStore } from "@renderer/state";
import type { GameplayRules } from "@shared/gameplay";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { RigState } from "../CameraRig";
import type { GameplayKitBehavior } from "../kits/registry";
import { matchesAction, useKeys } from "../useKeys";
import { type CombatAim, fireWeapon, newCombatClock, passTurn, stepCombat } from "./combatLoop";
import { buildEncounter, shotBlockers, shotDirection, shotOrigin } from "./encounter";

export function CombatControl({
  graph,
  rules,
  player,
  facing,
  rig,
  movement,
}: {
  graph: SceneGraph;
  rules: GameplayRules | null;
  player: RefObject<THREE.Vector3>;
  facing: RefObject<number>;
  rig: RefObject<RigState>;
  movement: GameplayKitBehavior["movement"];
}): JSX.Element | null {
  const begin = useEncounterStore((state) => state.begin);
  const clear = useEncounterStore((state) => state.clear);
  const canvas = useThree((state) => state.gl.domElement);
  const blockers = useMemo(() => shotBlockers(graph.walls), [graph.walls]);

  // The run follows the rules, not the scene. The scene is derived from the run's seed, so starting
  // the run on every scene change regenerated the floor, wiped the score and looped.
  useEffect(() => {
    useRunStore.getState().begin(rules?.progression ?? []);
  }, [rules]);

  // A new scene is a new fight. Rebuilding on the scene's identity keeps a reload honest.
  useEffect(() => {
    const built = buildEncounter(graph, rules);
    if (built === null) {
      clear();
      return;
    }
    begin(built);
    return clear;
  }, [graph, rules, begin, clear]);

  const clock = useRef(newCombatClock());

  const aim = useMemo<CombatAim>(
    () => ({
      // The player's line of fire this instant: from the eye, down the reticle.
      ray: () => ({
        ...shotOrigin(movement, player.current),
        ...shotDirection(movement, rig.current.yaw, rig.current.pitch, facing.current),
      }),
      player: () => ({ x: player.current.x, z: player.current.z }),
    }),
    [player, rig, facing, movement],
  );

  const fire = useCallback(() => {
    fireWeapon(clock.current, aim, blockers);
  }, [aim, blockers]);

  const onPress = useCallback(
    (code: string) => {
      const bindings = rules?.bindings;
      if (matchesAction(code, bindings, "fire", ["MouseLeft"])) {
        fire();
        return;
      }
      if (matchesAction(code, bindings, "pause", ["KeyP"])) {
        useEncounterStore.getState().togglePause();
        return;
      }
      // Passing is a legal move: commit an empty action and hand the turn on.
      if (matchesAction(code, bindings, "end_turn", ["KeyR"])) passTurn(clock.current);
    },
    [fire, rules?.bindings],
  );

  useKeys(onPress);

  // The trigger is a mouse button, which `useKeys` never sees.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const engine = useEngineStore.getState();
      if (engine.inputLocked) return;
      // In first person the click that grabs the pointer (CameraRig) is not a shot.
      if (engine.cameraMode === "fps" && document.pointerLockElement !== canvas) return;
      const code = event.button === 0 ? "MouseLeft" : event.button === 2 ? "MouseRight" : null;
      if (code === null) return;
      if (!matchesAction(code, rules?.bindings, "fire", ["MouseLeft"])) return;
      fire();
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    return () => canvas.removeEventListener("pointerdown", onPointerDown);
  }, [canvas, fire, rules?.bindings]);

  useFrame((_, delta) => {
    if (useEngineStore.getState().inputLocked) return;
    stepCombat(clock.current, aim, blockers, rules, delta);
  });

  return null;
}
