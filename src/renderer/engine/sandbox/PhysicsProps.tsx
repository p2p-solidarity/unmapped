// Props that are not scenery: `rigid_body@1`.
//
// A `dynamic` Prop leaves the instanced batch and becomes its own Rapier body — it falls, it
// stacks, it gets knocked over, and the physics gun can pick it up. The mesh is the same table in
// palette/props.ts that the static batch draws from, so a crate you drop looks exactly like the
// crate that was standing there; only its relationship to gravity changed.

import { CylinderCollider, type RapierRigidBody, RigidBody } from "@react-three/rapier";
import type { PropSpec } from "@shared/world";
import { type JSX, useEffect, useRef } from "react";
import { TILE_TOP, tileToWorld } from "../colliders";
import { geometryFor, propMaterial } from "../geometry";
import { PROP_SHAPE } from "../palette";
import { bodyId, registerBody } from "./registry";

/** Fallback body for props the static pass lets you walk through (flowers, mushrooms). */
const SMALL_BODY = { radius: 0.2, height: 0.45 };

/** Loose bodies settle rather than jitter forever, and a thrown one still flies. */
const LINEAR_DAMPING = 0.35;
const ANGULAR_DAMPING = 0.7;

function OneBody({ spec, index }: { spec: PropSpec; index: number }): JSX.Element {
  const shape = PROP_SHAPE[spec.kind];
  const size = spec.scale > 0 ? spec.scale : 1;
  const radius = (shape.collider > 0 ? shape.collider : SMALL_BODY.radius) * size;
  const halfHeight = ((shape.collider > 0 ? shape.colliderHeight : SMALL_BODY.height) * size) / 2;
  const [wx, wz] = tileToWorld(spec.x, spec.z);
  const id = bodyId(spec.x, spec.z, index);
  const body = useRef<RapierRigidBody>(null);

  // The gun looks up bodies by id; a body that is not registered simply cannot be grabbed.
  useEffect(() => {
    const handle = body.current;
    if (handle === null) return;
    // Half the height as well: a tall crate should catch a shot aimed at its top corner.
    return registerBody({ id, body: handle, radius: Math.max(radius, halfHeight) });
  }, [id, radius, halfHeight]);

  return (
    <RigidBody
      ref={body}
      type="dynamic"
      colliders={false}
      position={[wx, TILE_TOP + halfHeight, wz]}
      linearDamping={LINEAR_DAMPING}
      angularDamping={ANGULAR_DAMPING}
      canSleep
    >
      <CylinderCollider args={[halfHeight, radius]} />
      {shape.parts.map((part, partIndex) => (
        <mesh
          key={`${part.geo}-${part.offset.join("_")}`}
          geometry={geometryFor(part.geo)}
          material={propMaterial(spec.kind, partIndex)}
          // Parts are authored from the ground up; the body's origin is its collider's centre.
          position={[
            part.offset[0] * size,
            part.offset[1] * size - halfHeight,
            part.offset[2] * size,
          ]}
          scale={[part.size[0] * size, part.size[1] * size, part.size[2] * size]}
          castShadow
          receiveShadow
        />
      ))}
    </RigidBody>
  );
}

export function PhysicsProps({ props: specs }: { props: readonly PropSpec[] }): JSX.Element | null {
  if (specs.length === 0) return null;
  return (
    <>
      {specs.map((spec, index) => (
        <OneBody key={bodyId(spec.x, spec.z, index)} spec={spec} index={index} />
      ))}
    </>
  );
}
