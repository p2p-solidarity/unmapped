// Props: one InstancedMesh per (prop kind, primitive part). A tree is a cone on a cylinder, a
// torch a thin cylinder plus an emissive sphere, an altar stacked boxes — all described as data
// in palette/props.ts, so this file only turns that table into matrices, colours and colliders.
//
// Torch point lights are NOT placed here: they share the scene's capped point-light budget and
// are emitted by <Atmosphere> through `lights.ts`.

import { useFrame } from "@react-three/fiber";
import { CylinderCollider, RigidBody } from "@react-three/rapier";
import type { PropKind, PropSpec } from "@shared/world";
import { type JSX, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { propColliders, TILE_TOP } from "./colliders";
import { emissivePulse, geometryFor, hash2, propEmissiveBase, propMaterial } from "./geometry";
import { PROP_SHAPE, type PropPart } from "./palette";

const YAW_JITTER = 0.7;

export function Props({ props: specs }: { props: readonly PropSpec[] }): JSX.Element | null {
  const byKind = useMemo(() => groupByKind(specs), [specs]);
  const colliders = useMemo(() => propColliders(specs), [specs]);
  const appliedPulse = useRef(0);

  // Emissive pulse from a world mutation. Only written when the value actually moves, so a settled
  // scene costs one comparison per frame.
  useFrame(() => {
    const pulse = emissivePulse.value;
    if (pulse === appliedPulse.current) return;
    appliedPulse.current = pulse;
    for (const [kind, items] of byKind) {
      if (items.length === 0) continue;
      PROP_SHAPE[kind].parts.forEach((_part, index) => {
        propMaterial(kind, index).emissiveIntensity = propEmissiveBase(kind, index) + pulse * 1.4;
      });
    }
  });

  if (specs.length === 0) return null;

  return (
    <>
      {[...byKind].map(([kind, items]) => (
        <KindInstances key={kind} kind={kind} items={items} />
      ))}
      {colliders.length > 0 && (
        <RigidBody type="fixed" colliders={false}>
          {colliders.map((collider) => (
            <CylinderCollider
              key={`prop-collider-${collider.center[0]}-${collider.center[2]}`}
              args={[collider.halfHeight, collider.radius]}
              position={collider.center}
            />
          ))}
        </RigidBody>
      )}
    </>
  );
}

function KindInstances({
  kind,
  items,
}: {
  kind: PropKind;
  items: readonly PropSpec[];
}): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <>
      {PROP_SHAPE[kind].parts.map((part, index) => (
        <PartInstances
          key={`${kind}-${part.geo}-${part.offset.join("_")}`}
          kind={kind}
          part={part}
          partIndex={index}
          items={items}
        />
      ))}
    </>
  );
}

function PartInstances({
  kind,
  part,
  partIndex,
  items,
}: {
  kind: PropKind;
  part: PropPart;
  partIndex: number;
  items: readonly PropSpec[];
}): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = items.length;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const color = new THREE.Color();
    items.forEach((spec, index) => {
      const size = spec.scale > 0 ? spec.scale : 1;
      const yaw = (hash2(spec.x, spec.z) - 0.5) * YAW_JITTER;
      euler.set(0, yaw, 0);
      quaternion.setFromEuler(euler);
      const offset = new THREE.Vector3(
        part.offset[0] * size,
        part.offset[1] * size,
        part.offset[2] * size,
      ).applyQuaternion(quaternion);
      position.set(spec.x + 0.5 + offset.x, TILE_TOP + offset.y, spec.z + 0.5 + offset.z);
      scale.set(part.size[0] * size, part.size[1] * size, part.size[2] * size);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      color.set(spec.tint ?? part.color);
      mesh.setColorAt(index, color);
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, part, count]);

  return (
    <instancedMesh
      key={`${kind}-${partIndex}-${count}`}
      ref={meshRef}
      args={[geometryFor(part.geo), propMaterial(kind, partIndex), count]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

function groupByKind(specs: readonly PropSpec[]): Map<PropKind, PropSpec[]> {
  const map = new Map<PropKind, PropSpec[]>();
  for (const spec of specs) {
    const bucket = map.get(spec.kind);
    if (bucket === undefined) map.set(spec.kind, [spec]);
    else bucket.push(spec);
  }
  return map;
}
