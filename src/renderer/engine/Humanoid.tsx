// The NPC body ("角色本體"): a low-poly humanoid assembled from the cached unit geometries, driven
// entirely by the NpcSpec's body / hat / held / colour / accent. Every transform that moves lives
// in a ref and is written in useFrame — nothing about a humanoid ever reaches zustand (Rule 4).
//
// Idle: breathing, a slow head turn and a held-item sway. Within FACE_TILES the whole body turns
// to look at the player; the player position arrives as a ref prop, never through a store.

import { useFrame } from "@react-three/fiber";
import type { BodyKind, HatKind, HeldKind } from "@shared/world";
import { type JSX, type RefObject, useRef } from "react";
import type * as THREE from "three";
import { geometryFor, standardMaterial, UNIT_BOX, UNIT_CYLINDER, UNIT_SPHERE } from "./geometry";
import { HAT_SHAPE } from "./hats";
import { HELD_SHAPE } from "./held";
import {
  angleDelta,
  BODY_PROPORTION,
  facesHidden,
  faceYaw,
  type HumanoidPart,
  type HumanoidProportions,
  handGrip,
  hatScale,
  headCenterY,
  heldScale,
  hipY,
  type PartColor,
  shoulderY,
  torsoCenterY,
} from "./humanoidParts";
import { HUMANOID_PALETTE } from "./palette";

/** Everything a humanoid needs to look like itself — a structural subset of NpcSpec. */
export interface HumanoidLook {
  body: BodyKind;
  hat: HatKind;
  held: HeldKind;
  /** Hex body colour. */
  color: string;
  /** Hex accent colour: scarf, trim and the glow of whatever is in the right hand. */
  accent: string;
}

export interface HumanoidProps {
  look: HumanoidLook;
  /** World XZ of this humanoid — the parent group's tile centre — for the facing test. */
  origin: readonly [number, number];
  /** Live player position. Null (the default) means the humanoid only ever idles. */
  player?: RefObject<THREE.Vector3> | null;
  /** 0…1 deterministic phase so a village never breathes in unison. */
  phase?: number;
}

const BREATH_RATE = 1.3;
const BREATH_LIFT = 0.012;
const BREATH_SWELL = 0.022;
const IDLE_SWAY = 0.3;
const IDLE_RATE = 0.35;
const TURN_RESPONSE = 7;
const IDLE_TURN_RESPONSE = 1.6;
const ARM_SWING = 0.08;
const SWAY = 0.05;

function colorOf(role: PartColor, look: HumanoidLook): string {
  if (role === "body") return look.color;
  if (role === "accent" || role === "glow") return look.accent;
  return HUMANOID_PALETTE[role];
}

/** One primitive list (a hat, a held item) rendered at `scale` around its anchor. */
function Parts({
  parts,
  look,
  scale,
}: {
  parts: readonly HumanoidPart[];
  look: HumanoidLook;
  scale: number;
}): JSX.Element {
  return (
    <>
      {parts.map((part) => (
        <mesh
          key={part.id}
          castShadow
          geometry={geometryFor(part.geo)}
          position={[part.offset[0] * scale, part.offset[1] * scale, part.offset[2] * scale]}
          rotation={part.rotation}
          scale={[part.size[0] * scale, part.size[1] * scale, part.size[2] * scale]}
          material={standardMaterial(colorOf(part.color, look), part.emissive)}
        />
      ))}
    </>
  );
}

function Limb({
  p,
  look,
  side,
}: {
  p: HumanoidProportions;
  look: HumanoidLook;
  side: -1 | 1;
}): JSX.Element {
  return (
    <>
      <mesh
        castShadow
        geometry={UNIT_CYLINDER}
        position={[0, -p.legLength / 2, 0]}
        scale={[p.legRadius * 2, p.legLength, p.legRadius * 2]}
        material={standardMaterial(look.color)}
      />
      <mesh
        castShadow
        geometry={UNIT_BOX}
        position={[0, -p.legLength + p.legRadius * 0.4, p.legRadius * 0.5]}
        scale={[p.legRadius * 2.2, p.legRadius * 1.1, p.legRadius * 3]}
        material={standardMaterial(HUMANOID_PALETTE.dark)}
      />
      <mesh
        geometry={UNIT_BOX}
        position={[side * p.legRadius * 0.1, -p.legLength * 0.42, 0]}
        scale={[p.legRadius * 2.1, p.legRadius * 0.7, p.legRadius * 2.1]}
        material={standardMaterial(look.accent, 0.25)}
      />
    </>
  );
}

function Arm({ p, look }: { p: HumanoidProportions; look: HumanoidLook }): JSX.Element {
  return (
    <>
      <mesh
        castShadow
        geometry={UNIT_CYLINDER}
        position={[0, -p.armLength / 2, 0]}
        scale={[p.armRadius * 2, p.armLength, p.armRadius * 2]}
        material={standardMaterial(look.color)}
      />
      <mesh
        geometry={UNIT_SPHERE}
        position={[0, 0, 0]}
        scale={[p.armRadius * 2.6, p.armRadius * 2.2, p.armRadius * 2.6]}
        material={standardMaterial(look.accent, 0.2)}
      />
      <mesh
        geometry={UNIT_SPHERE}
        position={[0, -p.armLength, 0]}
        scale={[p.armRadius * 2.1, p.armRadius * 2.1, p.armRadius * 2.1]}
        material={standardMaterial(HUMANOID_PALETTE.skin)}
      />
    </>
  );
}

function Face({ p, look }: { p: HumanoidProportions; look: HumanoidLook }): JSX.Element {
  const r = p.headRadius;
  if (facesHidden(look.hat)) {
    return (
      <mesh
        geometry={UNIT_BOX}
        position={[0, r * 0.1, r * 0.95]}
        scale={[r * 1.5, r * 0.24, r * 0.12]}
        material={standardMaterial(look.accent, 1.4)}
      />
    );
  }
  return (
    <>
      <mesh
        geometry={UNIT_SPHERE}
        position={[-r * 0.34, r * 0.12, r * 0.84]}
        scale={[r * 0.26, r * 0.3, r * 0.26]}
        material={standardMaterial(HUMANOID_PALETTE.dark)}
      />
      <mesh
        geometry={UNIT_SPHERE}
        position={[r * 0.34, r * 0.12, r * 0.84]}
        scale={[r * 0.26, r * 0.3, r * 0.26]}
        material={standardMaterial(HUMANOID_PALETTE.dark)}
      />
    </>
  );
}

export function Humanoid({ look, origin, player = null, phase = 0 }: HumanoidProps): JSX.Element {
  const root = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armLeft = useRef<THREE.Group>(null);
  const armRight = useRef<THREE.Group>(null);
  const heldGroup = useRef<THREE.Group>(null);

  const p = BODY_PROPORTION[look.body];
  const grip = handGrip(p);
  const shoulder = shoulderY(p);
  const offset = phase * Math.PI * 2;

  useFrame((state, delta) => {
    const node = root.current;
    if (node === null) return;
    const t = state.clock.elapsedTime;
    const breath = Math.sin(t * BREATH_RATE + offset);

    node.position.y = breath * BREATH_LIFT * p.breath;

    const target = player?.current ?? null;
    const facing = target === null ? null : faceYaw(origin[0], origin[1], target.x, target.z);
    const desired = facing ?? Math.sin(t * IDLE_RATE + offset) * IDLE_SWAY;
    const response = facing === null ? IDLE_TURN_RESPONSE : TURN_RESPONSE;
    node.rotation.y += angleDelta(node.rotation.y, desired) * Math.min(1, delta * response);

    if (upper.current !== null) {
      upper.current.scale.set(1, 1 + breath * BREATH_SWELL * p.breath, 1);
    }
    if (head.current !== null) {
      head.current.rotation.y =
        facing === null ? Math.sin(t * 0.6 + offset) * 0.22 : Math.sin(t * 0.9 + offset) * 0.06;
      head.current.rotation.x = Math.sin(t * 0.8 + offset) * 0.05;
    }
    const swing = Math.sin(t * 1.1 + offset) * ARM_SWING;
    if (armLeft.current !== null) armLeft.current.rotation.x = swing;
    if (armRight.current !== null) armRight.current.rotation.x = -swing * 0.6;
    if (heldGroup.current !== null) {
      heldGroup.current.rotation.z = Math.sin(t * 1.05 + offset) * SWAY;
      heldGroup.current.rotation.x = Math.sin(t * 0.8 + offset) * SWAY * 0.8;
    }
  });

  return (
    <group ref={root}>
      <group position={[-p.legSpread, hipY(p), 0]}>
        <Limb p={p} look={look} side={-1} />
      </group>
      <group position={[p.legSpread, hipY(p), 0]}>
        <Limb p={p} look={look} side={1} />
      </group>

      <group ref={upper} position={[0, hipY(p), 0]} rotation={[p.lean, 0, 0]}>
        <mesh
          castShadow
          geometry={UNIT_BOX}
          position={[0, torsoCenterY(p), 0]}
          scale={[p.torsoWidth, p.torsoHeight, p.torsoDepth]}
          material={standardMaterial(look.color)}
        />
        {/* Scarf / mantle in the accent colour, hanging down the back. */}
        <mesh
          geometry={UNIT_BOX}
          position={[0, p.torsoHeight - p.torsoHeight * 0.12, 0]}
          scale={[p.torsoWidth * 1.06, p.torsoHeight * 0.16, p.torsoDepth * 1.08]}
          material={standardMaterial(look.accent, 0.35)}
        />
        <mesh
          geometry={UNIT_BOX}
          position={[0, p.torsoHeight * 0.5, -p.torsoDepth * 0.56]}
          scale={[p.torsoWidth * 0.5, p.torsoHeight * 0.7, p.torsoDepth * 0.12]}
          material={standardMaterial(look.accent, 0.2)}
        />

        <group ref={head} position={[0, headCenterY(p), 0]}>
          <mesh
            castShadow
            geometry={UNIT_SPHERE}
            scale={[p.headRadius * 2, p.headRadius * 2.05, p.headRadius * 2]}
            material={standardMaterial(HUMANOID_PALETTE.skin)}
          />
          <Face p={p} look={look} />
          <Parts parts={HAT_SHAPE[look.hat]} look={look} scale={hatScale(p)} />
        </group>

        <group ref={armLeft} position={[-p.armSpread, shoulder, 0]}>
          <Arm p={p} look={look} />
        </group>
        <group ref={armRight} position={[p.armSpread, shoulder, 0]}>
          <Arm p={p} look={look} />
          <group ref={heldGroup} position={[0, grip[1] - shoulder, grip[2]]}>
            <Parts parts={HELD_SHAPE[look.held]} look={look} scale={heldScale(p)} />
          </group>
        </group>
      </group>
    </group>
  );
}
