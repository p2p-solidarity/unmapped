// Camera modes. All transforms live in refs and are written straight onto the three camera in
// useFrame — nothing about the camera ever reaches zustand (Rule 4).
//
//   orbit — third-person follow, drag to rotate, wheel to zoom (4–14)
//   iso   — fixed 45° yaw / 35° pitch from above, no rotation
//   fps   — first person, pointer lock on canvas click
//
// A scene's kit decides its camera. Open land is the one exception: there the player walks the
// world however they like, so V swaps between orbit and fps.

import { useFrame, useThree } from "@react-three/fiber";
import { useEncounterStore, useEngineStore, useSessionStore } from "@renderer/state";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import { type JSX, type RefObject, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { matchesAction, useKeys } from "./useKeys";

export interface RigState {
  /** Rotation about +Y. The player moves relative to this. */
  yaw: number;
  /** Positive = camera above the target / looking down. */
  pitch: number;
  /** Orbit distance in tiles. */
  distance: number;
}

export const MIN_ZOOM = 4;
export const MAX_ZOOM = 14;
export const ISO_YAW = Math.PI / 4;
export const ISO_PITCH = (35 * Math.PI) / 180;

const ORBIT_PITCH_MIN = 0.12;
const ORBIT_PITCH_MAX = 1.3;
const FPS_PITCH_LIMIT = 1.3;
const DRAG_SPEED = 0.005;
const FOLLOW_RESPONSE = 10;
const EYE_HEIGHT = 0.6;
const ORBIT_TARGET_HEIGHT = 0.9;
const ORBIT_PITCH_DEFAULT = 0.65;
/** Swaps the camera on open land. */
export const CAMERA_SWITCH_KEY = "KeyV";
/** Opens the notes left where the player stands, on open land. */
const NOTES_KEY = "KeyN";

export function defaultRig(): RigState {
  return { yaw: ISO_YAW, pitch: ORBIT_PITCH_DEFAULT, distance: 9 };
}

/** The camera a switchable scene moves to from `mode`. */
export function switchedCamera(mode: string): "orbit" | "fps" {
  return mode === "fps" ? "orbit" : "fps";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function CameraRig({
  player,
  rig,
  kit,
  switchable = false,
  bindings,
}: {
  player: RefObject<THREE.Vector3>;
  rig: RefObject<RigState>;
  kit: GameplayKitRules;
  /** The player may swap orbit ↔ fps (open land only). */
  switchable?: boolean;
  bindings?: GameplayRules["bindings"];
}): JSX.Element | null {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const mode = useEngineStore((state) => state.cameraMode);
  const inputLocked = useEngineStore((state) => state.inputLocked);
  const dragging = useRef(false);
  const target = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());

  const onPress = useCallback(
    (code: string) => {
      if (!switchable) return;
      if (code === NOTES_KEY) {
        if (document.pointerLockElement !== null) document.exitPointerLock();
        useSessionStore.getState().toggleNotes(true);
        return;
      }
      if (code !== CAMERA_SWITCH_KEY) return;
      const engine = useEngineStore.getState();
      engine.setCameraMode(switchedCamera(engine.cameraMode));
    },
    [switchable],
  );
  useKeys(onPress);

  useEffect(() => {
    const state = rig.current;

    const rotate = (dx: number, dy: number, speed: number, limit: number): void => {
      state.yaw -= dx * speed;
      state.pitch = clamp(state.pitch + dy * speed, -limit, limit);
    };

    const onPointerDown = (event: PointerEvent): void => {
      const engine = useEngineStore.getState();
      if (engine.inputLocked) return;
      if (engine.cameraMode === "fps" && document.pointerLockElement === canvas) {
        const code = event.button === 0 ? "MouseLeft" : event.button === 2 ? "MouseRight" : null;
        // With a weapon in hand the same button is the trigger (CombatControl owns it), so
        // inspecting must not also fire off the click.
        const armed = useEncounterStore.getState().weapon !== null;
        if (
          code !== null &&
          !armed &&
          matchesAction(code, bindings, "inspect", ["MouseLeft"]) &&
          engine.nearby !== null
        ) {
          engine.interact(engine.nearby);
        }
        return;
      }
      if (event.button !== 0 || engine.cameraMode !== "orbit") return;
      dragging.current = true;
    };

    const onPointerMove = (event: PointerEvent): void => {
      if (!dragging.current) return;
      if (useEngineStore.getState().inputLocked) {
        dragging.current = false;
        return;
      }
      state.yaw -= event.movementX * DRAG_SPEED;
      state.pitch = clamp(
        state.pitch - event.movementY * DRAG_SPEED,
        ORBIT_PITCH_MIN,
        ORBIT_PITCH_MAX,
      );
    };

    const onPointerUp = (): void => {
      dragging.current = false;
    };

    const onWheel = (event: WheelEvent): void => {
      if (useEngineStore.getState().inputLocked) return;
      event.preventDefault();
      state.distance = clamp(state.distance + event.deltaY * 0.01, MIN_ZOOM, MAX_ZOOM);
    };

    const onClick = (): void => {
      const engine = useEngineStore.getState();
      if (engine.inputLocked || engine.cameraMode !== "fps") return;
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    };

    const onLookMove = (event: MouseEvent): void => {
      if (document.pointerLockElement !== canvas) return;
      if (useEngineStore.getState().inputLocked) return;
      rotate(event.movementX, event.movementY, kit.lookSensitivity, FPS_PITCH_LIMIT);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    document.addEventListener("mousemove", onLookMove);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("mousemove", onLookMove);
    };
  }, [bindings, canvas, kit.lookSensitivity, rig]);

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = kit.cameraFov;
      camera.updateProjectionMatrix();
    }
    if (kit.cameraDistance > 0) rig.current.distance = kit.cameraDistance;
  }, [camera, kit.cameraDistance, kit.cameraFov, rig]);

  // The rig's default pitch is the orbit camera's elevation above the player. Read as a first-person
  // look angle it points the eyes 37° into the floor, so entering fps starts level instead.
  useEffect(() => {
    if (mode === "fps") rig.current.pitch = 0;
  }, [mode, rig]);

  // Pointer lock belongs to fps mode only, and is released the moment a dialogue takes the keys.
  useEffect(() => {
    if ((inputLocked || mode !== "fps") && document.pointerLockElement === canvas) {
      document.exitPointerLock();
    }
    if (mode === "orbit") {
      // Coming back from first person the look angle is near level; lift the orbit back up.
      rig.current.pitch =
        rig.current.pitch < ORBIT_PITCH_MIN
          ? ORBIT_PITCH_DEFAULT
          : clamp(rig.current.pitch, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
    }
  }, [inputLocked, mode, canvas, rig]);

  useFrame((_, delta) => {
    const state = rig.current;
    const position = player.current;
    const alpha = 1 - Math.exp(-FOLLOW_RESPONSE * delta);

    if (mode === "fps") {
      camera.position.set(position.x, position.y + EYE_HEIGHT, position.z);
      camera.rotation.set(-state.pitch, state.yaw, 0, "YXZ");
      return;
    }

    // A fixed camera holds one framing of the whole floor. It does not follow, because the point
    // of the mode is that the player is not walking around.
    if (mode === "fixed") {
      const height = Math.max(6, state.distance);
      camera.position.set(position.x, position.y + height * 0.55, position.z + height);
      target.current.set(position.x, position.y + ORBIT_TARGET_HEIGHT, position.z);
      camera.lookAt(target.current);
      return;
    }

    if (mode === "side") {
      desired.current.set(position.x, position.y + 4, position.z + 12);
      camera.position.lerp(desired.current, alpha);
      target.current.set(position.x, position.y + ORBIT_TARGET_HEIGHT, position.z);
      camera.lookAt(target.current);
      return;
    }

    if (mode === "topdown") {
      desired.current.set(position.x, position.y + Math.max(10, state.distance), position.z + 0.01);
      camera.position.lerp(desired.current, alpha);
      camera.lookAt(position.x, position.y, position.z);
      return;
    }

    const yaw = mode === "iso" ? ISO_YAW : state.yaw;
    const pitch = mode === "iso" ? ISO_PITCH : clamp(state.pitch, ORBIT_PITCH_MIN, ORBIT_PITCH_MAX);
    const distance = clamp(state.distance, MIN_ZOOM, MAX_ZOOM);
    const horizontal = Math.cos(pitch) * distance;

    target.current.set(position.x, position.y + ORBIT_TARGET_HEIGHT, position.z);
    desired.current.set(
      target.current.x + Math.sin(yaw) * horizontal,
      target.current.y + Math.sin(pitch) * distance,
      target.current.z + Math.cos(yaw) * horizontal,
    );
    camera.position.lerp(desired.current, alpha);
    camera.lookAt(target.current);
  });

  return null;
}
