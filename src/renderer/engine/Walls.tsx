// Walls: one InstancedMesh of boxes + one fixed rigid body holding a cuboid collider per wall.
// A WallSpec is a run of `width` tiles along +X, one tile deep, `height` units tall.

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import type { WallSpec } from "@shared/world";
import { type JSX, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { wallBox } from "./colliders";
import { hash2, tintModulation, UNIT_BOX, wallMaterial } from "./geometry";
import { TILE_TINT } from "./palette";

const JITTER_FLOOR = 0.9;
const JITTER_RANGE = 0.16;

export function Walls({ walls }: { walls: readonly WallSpec[] }): JSX.Element | null {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const boxes = useMemo(() => walls.map((wall) => wallBox(wall)), [walls]);
  const count = boxes.length;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null || count === 0) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();
    boxes.forEach((box, index) => {
      const wall = walls[index];
      position.set(box.center[0], box.center[1], box.center[2]);
      scale.set(box.half[0] * 2, box.half[1] * 2, box.half[2] * 2);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      const tint = TILE_TINT[wall === undefined ? "stone" : wall.material];
      const jitter = JITTER_FLOOR + hash2(box.center[0], box.center[2]) * JITTER_RANGE;
      mesh.setColorAt(index, tintModulation(tint, jitter, color));
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes, walls, count]);

  if (count === 0) return null;

  return (
    <>
      <instancedMesh
        key={`walls-${count}`}
        ref={meshRef}
        args={[UNIT_BOX, wallMaterial, count]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <RigidBody type="fixed" colliders={false}>
        {boxes.map((box, index) => (
          <CuboidCollider
            // biome-ignore lint/suspicious/noArrayIndexKey: colliders map 1:1 onto the wall array
            key={`wall-collider-${index}`}
            args={box.half}
            position={box.center}
          />
        ))}
      </RigidBody>
    </>
  );
}
