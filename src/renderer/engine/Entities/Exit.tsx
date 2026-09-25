// Exit: a glowing portal ring standing on the tile, labelled with the floor it leads to.

import { useFrame } from "@react-three/fiber";
import type { ExitSpec } from "@shared/world";
import { type JSX, useRef } from "react";
import type * as THREE from "three";
import { TILE_TOP } from "../colliders";
import { hash2, PORTAL_RING, standardMaterial, UNIT_SPHERE } from "../geometry";
import { ENTITY_PALETTE } from "../palette";
import { Label } from "./Label";

const RING_HEIGHT = 1.1;

export function Exit({ exit }: { exit: ExitSpec }): JSX.Element {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const phase = hash2(exit.x, exit.z) * Math.PI * 2;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current !== null) ring.current.rotation.z = t * 0.45 + phase;
    if (core.current !== null) {
      const s = 0.5 + Math.sin(t * 1.6 + phase) * 0.06;
      core.current.scale.set(s, s, s);
    }
  });

  return (
    <group position={[exit.x + 0.5, TILE_TOP, exit.z + 0.5]}>
      <mesh
        ref={ring}
        geometry={PORTAL_RING}
        material={standardMaterial(ENTITY_PALETTE.exitRing, 1.5)}
        position={[0, RING_HEIGHT, 0]}
      />
      <mesh
        ref={core}
        geometry={UNIT_SPHERE}
        material={standardMaterial(ENTITY_PALETTE.exitCore, 0.9)}
        position={[0, RING_HEIGHT, 0]}
      />
      <pointLight
        color={ENTITY_PALETTE.exitRing}
        intensity={5}
        distance={7}
        decay={2}
        position={[0, RING_HEIGHT, 0]}
      />
      <Label text={exit.to} y={RING_HEIGHT + 0.95} tone="accent" />
    </group>
  );
}
