// The player: a Rapier kinematic capsule driven by a character controller. Movement is camera
// relative (WASD + arrows, Shift to sprint, Space to jump) and is clamped to the floor rectangle,
// unless the kit plays on open land.
// The avatar is one parametric humanoid with procedural locomotion; there is no class system.

import { useFrame } from "@react-three/fiber";
import {
  CapsuleCollider,
  type RapierCollider,
  type RapierRigidBody,
  RigidBody,
  useRapier,
} from "@react-three/rapier";
import { useCharacterStore, useEngineStore } from "@renderer/state";
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
  TILE_TOP,
  tileToWorld,
  type Vec3,
} from "./colliders";
import {
  FACING_YAW,
  type Facing,
  type GridTile,
  shortestTurn,
  startTile,
  stepTarget,
  turn,
} from "./gridStep";
import type { GameplayKitBehavior } from "./kits/registry";
import { bouncePadAt, platformBodies } from "./platformBoxes";
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
  facing,
  rig,
  kit,
  behavior,
  spawn: start,
  bindings,
}: {
  graph: SceneGraph;
  player: RefObject<THREE.Vector3>;
  /** Written every frame: the yaw the body is facing, for modes where the camera is not the aim. */
  facing: RefObject<number>;
  rig: RefObject<RigState>;
  kit: GameplayKitRules;
  behavior: GameplayKitBehavior;
  /** Where the body appears when the floor loads: the scene's spawn, or a saved open-land spot. */
  spawn: Vec3;
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

  // Bounce pads change only when the scene does, so the frame loop just reads the memo.
  const pads = useMemo(
    () => platformBodies(graph.platforms).filter((body) => body.bounce),
    [graph.platforms],
  );

  const charTheme = useCharacterStore((state) => state.colorTheme);

  // Grid movement state: which tile we stand on, which way we face, and the tile we are sliding to.
  const gridFacing = useRef<Facing>(0);
  const tile = useRef<GridTile>(startTile(graph.floor));
  const gridTarget = useRef<GridTile>(startTile(graph.floor));

  // Animation states
  const isMovingRef = useRef(false);
  const isJumpingRef = useRef(false);

  // Recomputed only when the floor changes
  const spawnRef = useRef<Vec3 | null>(null);
  const spawnFloor = useRef<string | null>(null);
  if (spawnFloor.current !== floorKey) {
    spawnFloor.current = floorKey;
    spawnRef.current = start;
  }
  const spawn = spawnRef.current ?? start;

  const onPress = useCallback(
    (code: string) => {
      const engine = useEngineStore.getState();
      if (engine.inputLocked) return;
      if (behavior.movement === "grid") {
        const settled =
          tile.current.x === gridTarget.current.x && tile.current.z === gridTarget.current.z;
        if (matchesAction(code, bindings, "move_left", ["KeyA", "ArrowLeft"])) {
          gridFacing.current = turn(gridFacing.current, -1);
          return;
        }
        if (matchesAction(code, bindings, "move_right", ["KeyD", "ArrowRight"])) {
          gridFacing.current = turn(gridFacing.current, 1);
          return;
        }
        // One step at a time: a key pressed mid-slide is ignored rather than queued.
        if (settled && matchesAction(code, bindings, "move_forward", ["KeyW", "ArrowUp"])) {
          gridTarget.current = stepTarget(
            tile.current,
            gridFacing.current,
            1,
            graph.floor,
            graph.walls,
          );
          return;
        }
        if (settled && matchesAction(code, bindings, "move_backward", ["KeyS", "ArrowDown"])) {
          gridTarget.current = stepTarget(
            tile.current,
            gridFacing.current,
            -1,
            graph.floor,
            graph.walls,
          );
          return;
        }
      }
      if (matchesAction(code, bindings, "interact", ["KeyE"])) {
        if (engine.nearby !== null) engine.interact(engine.nearby);
        return;
      }
    },
    [bindings, behavior.movement, graph.floor, graph.walls],
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

  // The door moves the player across open land in one step; nothing else teleports.
  useEffect(
    () =>
      useEngineStore.subscribe((state, previous) => {
        const request = state.teleport;
        const body = bodyRef.current;
        if (request === null || request === previous.teleport || body === null || !behavior.open) {
          return;
        }
        const y = TILE_TOP + PLAYER_FOOT_OFFSET + 0.5;
        body.setTranslation({ x: request.x, y, z: request.z }, true);
        body.setNextKinematicTranslation({ x: request.x, y, z: request.z });
        player.current.set(request.x, y, request.z);
        verticalVelocity.current = 0;
      }),
    [behavior.open, player],
  );

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const collider = colliderRef.current;
    const kinematic = controller.current;
    if (body === null || collider === null || kinematic === null) return;

    const step = Math.min(delta, MAX_STEP_SECONDS);
    const engine = useEngineStore.getState();
    const held = keys.current;
    const axis = engine.inputLocked ? { forward: 0, strafe: 0 } : moveAxis(held, bindings);
    // Grid and fixed modes do not use the free-movement controller at all: one slides between tile
    // centres, the other never moves. Both still sit on the floor plane.
    if (behavior.movement === "grid" || behavior.movement === "none") {
      const groundY = TILE_TOP + PLAYER_FOOT_OFFSET;
      const [targetX, targetZ] = tileToWorld(gridTarget.current.x, gridTarget.current.z);
      const current = body.translation();
      const alpha = Math.min(1, step * kit.moveSpeed * 2);
      const nextX =
        behavior.movement === "grid" ? current.x + (targetX - current.x) * alpha : current.x;
      const nextZ =
        behavior.movement === "grid" ? current.z + (targetZ - current.z) * alpha : current.z;

      if (behavior.movement === "grid") {
        // Close enough counts as arrived, so the next step is not blocked by a rounding tail.
        if (Math.abs(targetX - nextX) < 0.02 && Math.abs(targetZ - nextZ) < 0.02) {
          tile.current = gridTarget.current;
        }
        // The camera snaps to the quarter-turn the player chose.
        const wanted = FACING_YAW[gridFacing.current];
        rig.current.yaw += shortestTurn(rig.current.yaw, wanted) * Math.min(1, step * 12);
        facingYaw.current = rig.current.yaw;
        if (modelGroupRef.current) modelGroupRef.current.rotation.y = facingYaw.current;
        facing.current = facingYaw.current;
      }

      isMovingRef.current = behavior.movement === "grid" && tile.current !== gridTarget.current;
      isJumpingRef.current = false;
      body.setNextKinematicTranslation({ x: nextX, y: groundY, z: nextZ });
      player.current.set(nextX, groundY, nextZ);
      return;
    }

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
    facing.current = facingYaw.current;

    // Apply gravity
    verticalVelocity.current = Math.max(
      -TERMINAL_VELOCITY,
      verticalVelocity.current - kit.gravity * step,
    );

    const dy = verticalVelocity.current * step;

    kinematic.computeColliderMovement(collider, { x: dx, y: dy, z: dz });
    const movement = kinematic.computedMovement();
    const current = body.translation();
    // Open land has no edge: the ground simply continues into the next chunk.
    const [clampedX, clampedZ] = behavior.open
      ? [current.x + movement.x, current.z + movement.z]
      : clampToFloor(graph.floor, current.x + movement.x, current.z + movement.z, PLAYER_RADIUS);
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
          colorTheme={charTheme}
          isMoving={isMovingRef.current}
          isJumping={isJumpingRef.current}
        />
      </group>
    </RigidBody>
  );
}
