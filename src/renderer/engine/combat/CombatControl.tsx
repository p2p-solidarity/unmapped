// `shooter_combat@1` + `turn_scheduler@1` + `team_party@1`, wired into the running scene.
//
// It owns three things: the player's shot, the action bars filling, and the turns that belong to
// somebody other than the player. It renders nothing — the HUD reads the same store.
//
// Rule 4: the bar tick and the resolution timer are refs, because they change every frame. Only a
// bar that actually filled (which changes whose turn it is) is written to the store.

import { useFrame, useThree } from "@react-three/fiber";
import { useEncounterStore, useEngineStore, useRunStore } from "@renderer/state";
import { hitscan, type Ray } from "@shared/combat";
import type { GameplayRules } from "@shared/gameplay";
import { damageAtLevel } from "@shared/progression";
import { activeActor, chargeBars, isContinuous } from "@shared/timing";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { RigState } from "../CameraRig";
import type { GameplayKitBehavior } from "../kits/registry";
import { matchesAction, useKeys } from "../useKeys";
import {
  buildEncounter,
  chooseVictim,
  PLAYER_ID,
  shotBlockers,
  shotDirection,
  shotOrigin,
} from "./encounter";

/** How long a committed action is played out before the turn moves on. */
const RESOLVE_SECONDS = 0.45;

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

  const cooldownRef = useRef(0);
  const resolveRef = useRef(0);
  const tickRef = useRef(0);

  /** Applies a hit and settles everything that follows from it: progression, and the run itself. */
  const strike = useCallback((targetId: string, damage: number, victimLevel: number): boolean => {
    const store = useEncounterStore.getState();
    const killed = store.hit(targetId, damage);
    const run = useRunStore.getState();
    if (killed) run.recordKill(victimLevel);
    const after = useEncounterStore.getState().combatants;
    run.settle({
      playerAlive: (after.find((one) => one.id === PLAYER_ID)?.hp ?? 0) > 0,
      hostilesStanding: after.filter((one) => one.side === "hostile" && one.hp > 0).length,
    });
    return killed;
  }, []);

  /** The player's line of fire this instant: from the eye, down the reticle. */
  const aimRay = useCallback(
    (): Ray => ({
      ...shotOrigin(movement, player.current),
      ...shotDirection(movement, rig.current.yaw, rig.current.pitch, facing.current),
    }),
    [player, rig, facing, movement],
  );

  const fire = useCallback(() => {
    const state = useEncounterStore.getState();
    const weapon = state.weapon;
    if (weapon === null || state.turn === null || state.paused) return;
    // Outside real time, the player may only shoot on their own planning turn.
    const myTurn =
      isContinuous(state.turn.system) ||
      (activeActor(state.turn) === PLAYER_ID && state.turn.phase === "planning");
    if (!myTurn || cooldownRef.current > 0) {
      state.recordShot("wait");
      return;
    }
    const endAction = (): void => {
      cooldownRef.current = weapon.cooldownMs / 1000;
      if (state.turn !== null && !isContinuous(state.turn.system)) {
        state.commitTurn();
        resolveRef.current = RESOLVE_SECONDS;
      }
    };

    // Nothing binds a reload, so a dry trigger reloads: it costs the action, like a shot would.
    if (state.ammo !== null && state.ammo <= 0) {
      state.reload();
      state.recordShot("reload");
      endAction();
      return;
    }

    const hit = hitscan(
      aimRay(),
      weapon,
      state.combatants.filter((one) => one.side === "hostile"),
      blockers,
    );
    // Nothing under the reticle is not a shot. Letting the trigger burn a turn and a round on
    // empty air is the thing that makes aiming feel meaningless — but the click is still answered.
    if (hit === null) {
      state.recordShot("empty");
      return;
    }

    state.spendAmmo();
    // `stat_growth` is the only thing that makes level matter; without it this is a no-op.
    const damage = damageAtLevel(weapon.damage, useRunStore.getState().level);
    const victim = state.combatants.find((one) => one.id === hit.combatantId);
    const killed = strike(hit.combatantId, damage, victim?.level ?? 1);
    state.recordShot(killed ? "kill" : "hit");
    endAction();
  }, [aimRay, blockers, strike]);

  // A fresh slot restarts the tick clock.
  useEffect(() => {
    tickRef.current = 0;
  }, []);

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
      if (matchesAction(code, bindings, "end_turn", ["KeyR"])) {
        // Passing is a legal move: commit an empty action and hand the turn on.
        const state = useEncounterStore.getState();
        if (state.turn === null || isContinuous(state.turn.system)) return;
        if (activeActor(state.turn) !== PLAYER_ID || state.turn.phase !== "planning") return;
        state.commitTurn();
        resolveRef.current = RESOLVE_SECONDS;
      }
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
    if (cooldownRef.current > 0) cooldownRef.current = Math.max(0, cooldownRef.current - delta);

    const store = useEncounterStore.getState();

    // Aim preview: the same hitscan the trigger will use, so the reticle cannot promise a hit the
    // shot would not make. `setAimTarget` only writes when the target identity changes (Rule 4).
    if (store.weapon !== null) {
      const preview = hitscan(
        aimRay(),
        store.weapon,
        store.combatants.filter((one) => one.side === "hostile"),
        blockers,
      );
      store.setAimTarget(preview?.combatantId ?? null);
    }

    const turn = store.turn;
    if (turn === null || isContinuous(turn.system)) return;

    // A committed action is still playing out.
    if (resolveRef.current > 0) {
      resolveRef.current = Math.max(0, resolveRef.current - delta);
      if (resolveRef.current === 0) store.advanceTurn();
      return;
    }

    // Action bars only fill while nobody is mid-turn.
    if (turn.system === "turn_bar" && activeActor(turn) === null) {
      const charged = chargeBars(
        turn,
        store.combatants.map((one) => ({
          id: one.id,
          side: one.side,
          speed: one.speed,
          alive: one.hp > 0,
        })),
        delta,
      );
      if (charged !== turn) store.setTurn(charged);
      return;
    }

    const actor = activeActor(turn);

    // `tick`: the clock, not the player, ends a slot. Standing still simply passes your turn.
    if (turn.system === "tick" && actor === PLAYER_ID) {
      const tickSeconds = rules?.timing?.turnSeconds ?? 0;
      if (tickSeconds <= 0) return; // an untimed tick waits for input, like a plain turn
      tickRef.current += delta;
      if (tickRef.current < tickSeconds) return;
      tickRef.current = 0;
      store.commitTurn();
      resolveRef.current = RESOLVE_SECONDS;
      return;
    }

    if (actor === null || actor === PLAYER_ID) return;

    // Somebody else's turn: act, then resolve. Allies shoot the nearest hostile; hostiles strike
    // the nearest party member. Both use the same declared weapon damage, so there is no hidden
    // second combat model.
    const self = store.combatants.find((one) => one.id === actor);
    const weapon = store.weapon;
    if (self === undefined || weapon === null) {
      store.commitTurn();
      resolveRef.current = RESOLVE_SECONDS;
      return;
    }

    // The player is the only combatant that moves, so its live position wins over the roster's.
    const foes = store.combatants
      .filter((one) => one.side !== self.side)
      .map((one) =>
        one.id === PLAYER_ID ? { ...one, x: player.current.x, z: player.current.z } : one,
      );
    // Walls block their shots exactly as they block yours; nobody in sight passes the turn.
    const victimId = chooseVictim(self, foes, weapon, blockers);
    if (victimId !== null) {
      const victim = store.combatants.find((one) => one.id === victimId);
      strike(victimId, weapon.damage, victim?.level ?? 1);
    }
    store.commitTurn();
    resolveRef.current = RESOLVE_SECONDS;
  });

  return null;
}
