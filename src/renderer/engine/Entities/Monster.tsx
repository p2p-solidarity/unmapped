// Monsters: one cheap primitive silhouette per kind, driven from the MONSTER_LOOK table, scaled by
// the model's `size`, tinted by its `color`, with a slow idle bob. High-level monsters gain a faint
// aura ring. No external assets, no skinned meshes.

import { useFrame } from "@react-three/fiber";
import type { MonsterSpec } from "@shared/world";
import { type JSX, useRef } from "react";
import type * as THREE from "three";
import { TILE_TOP } from "../colliders";
import {
  hash2,
  SLIM_CAPSULE,
  standardMaterial,
  translucentMaterial,
  UNIT_BOX,
  UNIT_CYLINDER,
  UNIT_OCTA,
  UNIT_SPHERE,
} from "../geometry";
import { clampMonsterSize, hasAura, monsterLabelY, monsterLook, monsterRadius } from "../monsters";
import type { MonsterLook, MonsterShape } from "../palette";
import { Label } from "./Label";

const BOB_HEIGHT = 0.09;
const AURA_OPACITY = 0.3;
const AURA_EMISSIVE = 1.4;

export function Monster({ monster }: { monster: MonsterSpec }): JSX.Element {
  const group = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const look = monsterLook(monster);
  const size = clampMonsterSize(monster.size);
  const phase = hash2(monster.x, monster.z) * Math.PI * 2;

  useFrame((state) => {
    const node = group.current;
    if (node === null) return;
    const t = state.clock.elapsedTime;
    node.position.y = Math.sin(t * 0.9 + phase) * BOB_HEIGHT * size;
    node.rotation.y = t * 0.2 + phase;
    if (aura.current !== null) aura.current.rotation.z = t * 0.35 + phase;
  });

  return (
    <group position={[monster.x + 0.5, TILE_TOP, monster.z + 0.5]}>
      <group ref={group} scale={size}>
        <Silhouette shape={look.shape} look={look} />
      </group>
      {hasAura(monster.level) && (
        <mesh
          ref={aura}
          geometry={UNIT_CYLINDER}
          position={[0, 0.03, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[monsterRadius(monster) * 2.6, monsterRadius(monster) * 2.6, 0.02]}
          material={translucentMaterial(look.accent, AURA_OPACITY, AURA_EMISSIVE)}
        />
      )}
      <Label
        text={`${monster.kind.replace(/_/g, " ")} Lv.${monster.level}`}
        y={monsterLabelY(monster)}
      />
    </group>
  );
}

function Silhouette({ shape, look }: { shape: MonsterShape; look: MonsterLook }): JSX.Element {
  const body = standardMaterial(look.color, look.emissive);
  const trim = standardMaterial(look.accent, look.emissive * 0.6);

  if (shape === "blob") {
    return (
      <>
        <mesh
          castShadow
          geometry={UNIT_SPHERE}
          position={[0, 0.3, 0]}
          scale={[1, 0.62, 1]}
          material={body}
        />
        <mesh
          geometry={UNIT_SPHERE}
          position={[0, 0.48, 0.18]}
          scale={[0.38, 0.24, 0.3]}
          material={trim}
        />
      </>
    );
  }
  if (shape === "bones") {
    return (
      <>
        <mesh castShadow geometry={SLIM_CAPSULE} position={[0, 0.72, 0]} material={body} />
        <mesh
          castShadow
          geometry={UNIT_SPHERE}
          position={[0, 1.42, 0]}
          scale={[0.36, 0.4, 0.34]}
          material={body}
        />
        <mesh
          geometry={UNIT_BOX}
          position={[0, 0.95, 0]}
          scale={[0.72, 0.06, 0.12]}
          material={trim}
        />
      </>
    );
  }
  if (shape === "octa") {
    return (
      <>
        <mesh
          castShadow
          geometry={UNIT_OCTA}
          position={[0, 1.05, 0]}
          scale={[0.85, 1, 0.85]}
          material={body}
        />
        <mesh
          geometry={UNIT_SPHERE}
          position={[0, 0.62, 0]}
          scale={[0.22, 0.22, 0.22]}
          material={trim}
        />
      </>
    );
  }
  if (shape === "block") {
    return (
      <>
        <mesh
          castShadow
          geometry={UNIT_BOX}
          position={[0, 0.8, 0]}
          scale={[1.05, 1.3, 0.8]}
          material={body}
        />
        <mesh
          castShadow
          geometry={UNIT_BOX}
          position={[0, 1.65, 0]}
          scale={[0.6, 0.45, 0.6]}
          material={trim}
        />
      </>
    );
  }
  if (shape === "orb") {
    return (
      <>
        <mesh
          geometry={UNIT_SPHERE}
          position={[0, 1.1, 0]}
          scale={[0.55, 0.55, 0.55]}
          material={body}
        />
        <mesh
          geometry={UNIT_SPHERE}
          position={[0, 1.1, 0]}
          scale={[0.95, 0.95, 0.95]}
          material={trim}
        />
      </>
    );
  }
  if (shape === "chain") {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <mesh
            key={`segment-${i}`}
            castShadow
            geometry={UNIT_SPHERE}
            position={[0, 0.34 + i * 0.05, -i * 0.42]}
            scale={[0.6 - i * 0.09, 0.6 - i * 0.09, 0.6 - i * 0.09]}
            material={i === 0 ? trim : body}
          />
        ))}
      </>
    );
  }
  if (shape === "fox") {
    return (
      <>
        <mesh
          castShadow
          geometry={UNIT_SPHERE}
          position={[0, 0.45, 0]}
          scale={[0.55, 0.5, 0.8]}
          material={body}
        />
        <mesh
          castShadow
          geometry={UNIT_SPHERE}
          position={[0, 0.72, 0.4]}
          scale={[0.36, 0.36, 0.36]}
          material={body}
        />
        <mesh
          geometry={UNIT_SPHERE}
          position={[0, 0.7, -0.55]}
          scale={[0.3, 0.3, 0.55]}
          material={trim}
        />
      </>
    );
  }
  return (
    <>
      <mesh
        geometry={UNIT_SPHERE}
        position={[0, 0.22, 0]}
        scale={[1.15, 0.35, 1.15]}
        material={body}
      />
      <mesh
        geometry={UNIT_SPHERE}
        position={[0, 0.75, 0]}
        scale={[0.6, 0.85, 0.6]}
        material={trim}
      />
    </>
  );
}
