// FPS Puzzle owns its first-person affordances. The light follows the real camera and consumes
// the cartridge's `flashlight` binding; other kits never mount this component.

import { useFrame, useThree } from "@react-three/fiber";
import { useEngineStore } from "@renderer/state";
import type { GameplayRules } from "@shared/gameplay";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { ENTITY_PALETTE } from "./palette";
import { matchesAction, useKeys } from "./useKeys";

const FLASHLIGHT_KEYS = ["KeyF"] as const;

export function FpsKitFeatures({
  bindings,
}: {
  bindings?: GameplayRules["bindings"];
}): JSX.Element {
  const camera = useThree((state) => state.camera);
  const light = useRef<THREE.SpotLight>(null);
  const target = useRef<THREE.Object3D>(null);
  const direction = useRef(new THREE.Vector3());
  const [enabled, setEnabled] = useState(false);

  const onPress = useCallback(
    (code: string) => {
      if (useEngineStore.getState().inputLocked) return;
      if (matchesAction(code, bindings, "flashlight", FLASHLIGHT_KEYS)) {
        setEnabled((current) => !current);
      }
    },
    [bindings],
  );
  useKeys(onPress);

  useEffect(() => {
    if (light.current !== null && target.current !== null) light.current.target = target.current;
  }, []);

  useFrame(() => {
    const beam = light.current;
    const aim = target.current;
    if (beam === null || aim === null) return;
    beam.position.copy(camera.position);
    camera.getWorldDirection(direction.current);
    aim.position.copy(camera.position).addScaledVector(direction.current, 12);
    aim.updateMatrixWorld();
  });

  return (
    <>
      <spotLight
        ref={light}
        color={ENTITY_PALETTE.flashlight}
        intensity={enabled ? 7 : 0}
        distance={22}
        angle={0.42}
        penumbra={0.55}
        decay={1.5}
      />
      <object3D ref={target} />
    </>
  );
}
