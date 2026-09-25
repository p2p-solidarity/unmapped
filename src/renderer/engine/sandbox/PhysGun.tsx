// The physics gun (`rigid_body@1`): point, grab, carry, throw.
//
// Press the grab key to catch the free body under your aim; press it again to let go. While a body
// is held it is not teleported — it is pulled toward a point in front of you by a clamped velocity
// (`src/shared/grab.ts`), so it still bangs into walls, shoves other bodies, and swings when you
// turn. Letting go keeps whatever velocity it had, which is what makes a throw a throw.
//
// The maths is pure and tested; this component only reads positions and writes velocities.

import { useFrame, useThree } from "@react-three/fiber";
import { useEngineStore } from "@renderer/state";
import type { GameplayRules } from "@shared/gameplay";
import {
  GRAB_RANGE,
  type GrabCandidate,
  HOLD_DISTANCE,
  holdPoint,
  holdVelocity,
  pickGrab,
} from "@shared/grab";
import { type JSX, useCallback, useEffect, useRef } from "react";
import * as THREE from "three";
import { matchesAction, useKeys } from "../useKeys";
import { sandboxBodies, sandboxBody } from "./registry";

const GRAB_KEYS = ["KeyG"] as const;
/** Let go rather than drag a body that has been pulled far out of reach by something else. */
const LEASH = GRAB_RANGE * 1.5;

export function PhysGun({ bindings }: { bindings?: GameplayRules["bindings"] }): JSX.Element {
  const camera = useThree((state) => state.camera);
  const held = useRef<string | null>(null);
  const distance = useRef<number>(HOLD_DISTANCE.default);
  const direction = useRef(new THREE.Vector3());
  const candidates = useRef<GrabCandidate[]>([]);

  const release = useCallback((): void => {
    held.current = null;
    useEngineStore.getState().setHeldBody(null);
  }, []);

  const onPress = useCallback(
    (code: string) => {
      if (useEngineStore.getState().inputLocked) return;
      if (!matchesAction(code, bindings, "grab", GRAB_KEYS)) return;
      if (held.current !== null) {
        release();
        return;
      }
      camera.getWorldDirection(direction.current);
      // Reused array: this runs on a keypress, but the frame loop below has the same shape.
      candidates.current = sandboxBodies().map((entry) => {
        const at = entry.body.translation();
        return { id: entry.id, x: at.x, y: at.y, z: at.z, radius: entry.radius };
      });
      const hit = pickGrab(
        {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
          dx: direction.current.x,
          dy: direction.current.y,
          dz: direction.current.z,
        },
        candidates.current,
      );
      if (hit === null) return;
      held.current = hit.id;
      // Keep it where you caught it, so grabbing does not yank the thing into your face.
      distance.current = hit.distance;
      useEngineStore.getState().setHeldBody(hit.id);
    },
    [bindings, camera, release],
  );

  useKeys(onPress);

  // Wheel changes how far out the body rides — the one bit of fine control a sandbox needs.
  useEffect(() => {
    const onWheel = (event: WheelEvent): void => {
      if (held.current === null) return;
      event.preventDefault();
      distance.current += event.deltaY > 0 ? -HOLD_DISTANCE.step : HOLD_DISTANCE.step;
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  useFrame(() => {
    const id = held.current;
    if (id === null) return;
    const entry = sandboxBody(id);
    // The scene changed under us (a new floor, a reloaded cartridge): nothing to carry.
    if (entry === null) {
      release();
      return;
    }
    if (useEngineStore.getState().inputLocked) return;

    camera.getWorldDirection(direction.current);
    const at = entry.body.translation();
    const target = holdPoint(
      {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
        dx: direction.current.x,
        dy: direction.current.y,
        dz: direction.current.z,
      },
      distance.current,
    );
    if (
      Math.hypot(at.x - camera.position.x, at.y - camera.position.y, at.z - camera.position.z) >
      LEASH
    ) {
      release();
      return;
    }
    const velocity = holdVelocity(at, target);
    // A settled body has gone to sleep; without this the first frame of a grab does nothing.
    entry.body.wakeUp();
    entry.body.setLinvel(velocity, true);
  });

  // Nothing to draw: the gun is a verb, and the body you are holding is its own feedback.
  // biome-ignore lint/complexity/noUselessFragments: the engine contract returns JSX.Element
  return <></>;
}
