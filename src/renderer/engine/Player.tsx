// The player: a Rapier kinematic capsule driven by a character controller. Movement is camera
// relative (WASD + arrows, Shift to sprint, Space to jump) and is clamped to the floor rectangle.
// Detailed multi-class 3D character avatar with procedural locomotion and jump physics.

import { useFrame } from "@react-three/fiber";
import {
  CapsuleCollider,
  type RapierCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from "@react-three/rapier";
import { useCharacterStore, useEngineStore, usePlatformStore } from "@renderer/state";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, useCallback, useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { ISO_YAW, type RigState } from "./CameraRig";
import { CharacterModel } from "./CharacterModel";
import {
  clampToFloor,
  PLAYER_FOOT_OFFSET,
  PLAYER_HALF_HEIGHT,
  PLAYER_RADIUS,
  spawnPoint,
  TILE_TOP,
  type Vec3,
} from "./colliders";
import type { GameplayKitBehavior } from "./kits/registry";
import { allPlatformBodies, bouncePadAt } from "./platformBoxes";
import { isActionPressed, isSprinting, matchesAction, moveAxis, useKeys } from "./useKeys";

const BOUNCE_SPEED = 13.0;
const TERMINAL_VELOCITY = 22;
/** Skin width fed to the Rapier character controller. */
const CONTROLLER_OFFSET = 0.02;
const MAX_STEP_SECONDS = 0.05;
const JUMP_KEYS = new Set(["Space"]);
/** Slack when deciding whether an upward move was blocked by a ceiling. */
const CEILING_EPSILON = 1e-4;

export function Player({
  graph,
  player,
  rig,
  kit,
  behavior,
  bindings,
}: {
  graph: SceneGraph;
  player: RefObject<THREE.Vector3>;
  rig: RefObject<RigState>;
  kit: GameplayKitRules;
  behavior: GameplayKitBehavior;
  bindings?: GameplayRules["bindings"];
}): JSX.Element {
  const { world } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const modelGroupRef = useRef<THREE.Group>(null);
  const controller = useRef<ReturnType<typeof world.createCharacterController> | null>(null);
  const verticalVelocity = useRef(0);
  const facingYaw = useRef(0);
  const mode = useEngineStore((state) => state.cameraMode);
  const floorKey = graph.name;

  // Bounce pads come from both sources: baked scene platforms and unsaved editor drafts. The list
  // only changes when the scene or the editor does, so the frame loop just reads it.
  const drafts = usePlatformStore((state) => state.drafts);
  const pads = useMemo(
    () => allPlatformBodies(graph.platforms, drafts).filter((body) => body.bounce),
    [graph.platforms, drafts],
  );

  // Character preferences
  const charClass = useCharacterStore((state) => state.classId);
  const charTheme = useCharacterStore((state) => state.colorTheme);
  const showWeapon = useCharacterStore((state) => state.showWeapon);
  const showAura = useCharacterStore((state) => state.showAura);

  // Animation states
  const isMovingRef = useRef(false);
  const isJumpingRef = useRef(false);

  // Recomputed only when the floor changes
  const spawnRef = useRef<Vec3 | null>(null);
  const spawnFloor = useRef<string | null>(null);
  if (spawnFloor.current !== floorKey) {
    spawnFloor.current = floorKey;
    spawnRef.current = spawnPoint(graph);
  }
  const spawn = spawnRef.current ?? spawnPoint(graph);

  const onPress = useCallback(
    (code: string) => {
      const engine = useEngineStore.getState();
      if (engine.inputLocked) return;
      if (matchesAction(code, bindings, "interact", ["KeyE"])) {
        if (engine.nearby !== null) engine.interact(engine.nearby);
        return;
      }
    },
    [bindings],
  );

  const keys = useKeys(onPress);

  useEffect(() => {
    const kinematic = world.createCharacterController(CONTROLLER_OFFSET);
    kinematic.setUp({ x: 0, y: 1, z: 0 });
    kinematic.setSlideEnabled(true);
    kinematic.enableAutostep(0.35, 0.2, false);
    kinematic.enableSnapToGround(0.35);
    kinematic.setApplyImpulsesToDynamicBodies(false);
    controller.current = kinematic;
    return () => {
      controller.current = null;
      world.removeCharacterController(kinematic);
    };
  }, [world]);

  // Respawn at centre and clear per-floor engine state
  // biome-ignore lint/correctness/useExhaustiveDependencies: floorKey is the deliberate trigger
  useEffect(() => {
    const body = bodyRef.current;
    const [x, y, z] = spawnRef.current ?? [0.5, 0, 0.5];
    player.current.set(x, y, z);
    verticalVelocity.current = 0;
    if (body !== null) {
      body.setTranslation({ x, y, z }, true);
      body.setNextKinematicTranslation({ x, y, z });
    }
    useEngineStore.getState().resetFloor();
  }, [floorKey, player]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const kinematic = controller.current;
    if (body === null || collider === null || kinematic === null) return;

    const step = Math.min(delta, MAX_STEP_SECONDS);
    const engine = useEngineStore.getState();
    const held = keys.current;
    const axis = engine.inputLocked ? { forward: 0, strafe: 0 } : moveAxis(held, bindings);
    const isMoving = !engine.inputLocked && (axis.forward !== 0 || axis.strafe !== 0);
    isMovingRef.current = isMoving;

    const speed =
      behavior.sprint && !engine.inputLocked && isSprinting(held, bindings)
        ? kit.sprintSpeed
        : kit.moveSpeed;
    const yaw = engine.cameraMode === "iso" ? ISO_YAW : rig.current.yaw;

    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const dx =
      behavior.movement === "side" || behavior.movement === "topdown"
        ? axis.strafe * speed * step
        : (forwardX * axis.forward + rightX * axis.strafe) * speed * step;
    const dz =
      behavior.movement === "side"
        ? 0
        : behavior.movement === "topdown"
          ? -axis.forward * speed * step
          : (forwardZ * axis.forward + rightZ * axis.strafe) * speed * step;

    // Smooth model yaw rotation toward movement direction
    if (isMoving && (dx !== 0 || dz !== 0)) {
      const targetYaw = Math.atan2(dx, dz);
      const diff = targetYaw - facingYaw.current;
      const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
      facingYaw.current += wrappedDiff * Math.min(1, step * 14);
    }
    if (modelGroupRef.current) {
      modelGroupRef.current.rotation.y = facingYaw.current;
    }

    // Apply gravity
    verticalVelocity.current = Math.max(
      -TERMINAL_VELOCITY,
      verticalVelocity.current - kit.gravity * step,
    );

    const dy = verticalVelocity.current * step;

    kinematic.computeColliderMovement(collider, { x: dx, y: dy, z: dz });
    const movement = kinematic.computedMovement();
    const current = body.translation();
    const [clampedX, clampedZ] = clampToFloor(
      graph.floor,
      current.x + movement.x,
      current.z + movement.z,
      PLAYER_RADIUS,
    );
    let nextY = current.y + movement.y;
    const groundY = TILE_TOP + PLAYER_FOOT_OFFSET;

    const isGrounded = kinematic.computedGrounded() || nextY <= groundY + 0.05;

    if (nextY <= groundY) {
      nextY = groundY;
      verticalVelocity.current = 0;
    } else if (kinematic.computedGrounded() && verticalVelocity.current < 0) {
      verticalVelocity.current = 0;
    } else if (dy > 0 && movement.y < dy - CEILING_EPSILON) {
      // Head hit the underside of a platform: stop rising instead of grinding against it.
      verticalVelocity.current = 0;
    }

    // Bounce pads: fire only when the soles actually rest on a pad's top face.
    if (isGrounded && pads.length > 0) {
      const feetY = nextY - PLAYER_FOOT_OFFSET;
      if (bouncePadAt(pads, clampedX, clampedZ, feetY) !== null) {
        verticalVelocity.current = BOUNCE_SPEED;
      }
    }

    // Handle spacebar jump
    if (
      isActionPressed(held, bindings, "jump", JUMP_KEYS) &&
      behavior.jump &&
      !engine.inputLocked &&
      isGrounded &&
      verticalVelocity.current <= 0.2
    ) {
      verticalVelocity.current = kit.jumpSpeed;
    }

    isJumpingRef.current = !isGrounded && verticalVelocity.current > 0.5;

    body.setNextKinematicTranslation({ x: clampedX, y: nextY, z: clampedZ });
    player.current.set(clampedX, nextY, clampedZ);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="kinematicPosition"
      colliders={false}
      position={spawn}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider ref={colliderRef} args={[PLAYER_HALF_HEIGHT, PLAYER_RADIUS]} />
      <group ref={modelGroupRef} visible={mode !== "fps"}>
        <CharacterModel
          classId={charClass}
          colorTheme={charTheme}
          showWeapon={showWeapon}
          showAura={showAura}
          isMoving={isMovingRef.current}
          isJumping={isJumpingRef.current}
        />
      </group>
    </RigidBody>
  );
}
