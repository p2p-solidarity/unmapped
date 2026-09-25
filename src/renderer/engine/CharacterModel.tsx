// The player's avatar: one parametric humanoid with procedural walk/jump motion, tinted by the
// device's colour theme.
//
// It deliberately carries no weapon and no class silhouette. The engine has no class system and no
// combat, so a sword on the back would be describing a game that does not exist (Rule 2). Held
// equipment returns when `shooter_combat@1` lands and weapons are declared in rules.oui.

import { useFrame } from "@react-three/fiber";
import type { ColorTheme } from "@renderer/state";
import { type JSX, useRef } from "react";
import type * as THREE from "three";
import { standardMaterial, UNIT_BOX, UNIT_CYLINDER, UNIT_OCTA, UNIT_SPHERE } from "./geometry";
import { CHARACTER_THEME_COLORS } from "./palette";

export interface CharacterModelProps {
  colorTheme: ColorTheme;
  isMoving?: boolean;
  isJumping?: boolean;
}

export function CharacterModel({
  colorTheme,
  isMoving = false,
  isJumping = false,
}: CharacterModelProps): JSX.Element {
  const rootRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const scarfRef = useRef<THREE.Group>(null);

  const colors = CHARACTER_THEME_COLORS[colorTheme] ?? CHARACTER_THEME_COLORS.cyan;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const walkSpeed = 12;

    if (rootRef.current) {
      if (isJumping) {
        rootRef.current.position.y = 0.08;
      } else if (isMoving) {
        rootRef.current.position.y = Math.abs(Math.sin(t * walkSpeed)) * 0.05;
      } else {
        rootRef.current.position.y = Math.sin(t * 2.2) * 0.02;
      }
    }

    if (leftArmRef.current && rightArmRef.current) {
      if (isJumping) {
        leftArmRef.current.rotation.x = -0.6;
        rightArmRef.current.rotation.x = -0.6;
      } else if (isMoving) {
        leftArmRef.current.rotation.x = Math.sin(t * walkSpeed) * 0.55;
        rightArmRef.current.rotation.x = -Math.sin(t * walkSpeed) * 0.55;
      } else {
        leftArmRef.current.rotation.x = Math.sin(t * 1.5) * 0.05;
        rightArmRef.current.rotation.x = -Math.sin(t * 1.5) * 0.05;
      }
    }

    if (leftLegRef.current && rightLegRef.current) {
      if (isJumping) {
        leftLegRef.current.rotation.x = 0.35;
        rightLegRef.current.rotation.x = -0.2;
      } else if (isMoving) {
        leftLegRef.current.rotation.x = -Math.sin(t * walkSpeed) * 0.6;
        rightLegRef.current.rotation.x = Math.sin(t * walkSpeed) * 0.6;
      } else {
        leftLegRef.current.rotation.x = 0;
        rightLegRef.current.rotation.x = 0;
      }
    }

    if (scarfRef.current) {
      scarfRef.current.rotation.x = isMoving
        ? 0.35 + Math.sin(t * 8) * 0.1
        : 0.1 + Math.sin(t * 2) * 0.05;
    }
  });

  return (
    <group ref={rootRef}>
      {/* ── Torso & Chestplate ── */}
      <mesh
        castShadow
        position={[0, 0.48, 0]}
        scale={[0.42, 0.44, 0.28]}
        geometry={UNIT_BOX}
        material={standardMaterial(colors.armor)}
      />
      {/* Power Core Emblem */}
      <mesh
        position={[0, 0.52, 0.15]}
        scale={[0.1, 0.1, 0.04]}
        geometry={UNIT_OCTA}
        material={standardMaterial(colors.accent, 2.0)}
      />
      {/* Belt */}
      <mesh
        position={[0, 0.24, 0]}
        scale={[0.43, 0.08, 0.29]}
        geometry={UNIT_BOX}
        material={standardMaterial(colors.primary)}
      />
      <mesh
        position={[0, 0.24, 0.15]}
        scale={[0.12, 0.06, 0.02]}
        geometry={UNIT_BOX}
        material={standardMaterial(colors.accent, 1.2)}
      />

      {/* ── Scarf / Mantle ── */}
      <group ref={scarfRef} position={[0, 0.7, -0.1]}>
        <mesh
          position={[0, -0.22, -0.06]}
          rotation={[0.15, 0, 0]}
          scale={[0.3, 0.45, 0.04]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.accent, 0.3)}
        />
      </group>

      {/* ── Head ── */}
      <group position={[0, 0.86, 0]}>
        <mesh
          castShadow
          scale={[0.36, 0.38, 0.36]}
          geometry={UNIT_SPHERE}
          material={standardMaterial(colors.skin)}
        />
        {/* Hair */}
        <mesh
          position={[0, 0.08, -0.04]}
          scale={[0.4, 0.32, 0.42]}
          geometry={UNIT_SPHERE}
          material={standardMaterial(colors.hair)}
        />
      </group>

      {/* ── Left Arm ── */}
      <group ref={leftArmRef} position={[-0.28, 0.62, 0]}>
        {/* Shoulder Pauldron */}
        <mesh
          scale={[0.16, 0.14, 0.18]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.armor)}
        />
        {/* Arm */}
        <mesh
          position={[0, -0.22, 0]}
          scale={[0.11, 0.32, 0.11]}
          geometry={UNIT_CYLINDER}
          material={standardMaterial(colors.primary)}
        />
        {/* Left Hand / Glove */}
        <mesh
          position={[0, -0.4, 0]}
          scale={[0.12, 0.1, 0.12]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.accent)}
        />
      </group>

      {/* ── Right Arm ── */}
      <group ref={rightArmRef} position={[0.28, 0.62, 0]}>
        {/* Shoulder Pauldron */}
        <mesh
          scale={[0.16, 0.14, 0.18]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.armor)}
        />
        {/* Arm */}
        <mesh
          position={[0, -0.22, 0]}
          scale={[0.11, 0.32, 0.11]}
          geometry={UNIT_CYLINDER}
          material={standardMaterial(colors.primary)}
        />
        {/* Right Hand */}
        <mesh
          position={[0, -0.4, 0]}
          scale={[0.12, 0.1, 0.12]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.accent)}
        />
      </group>

      {/* ── Left Leg ── */}
      <group ref={leftLegRef} position={[-0.12, 0.2, 0]}>
        <mesh
          position={[0, -0.24, 0]}
          scale={[0.14, 0.38, 0.14]}
          geometry={UNIT_CYLINDER}
          material={standardMaterial(colors.primary)}
        />
        <mesh
          position={[0, -0.45, 0.04]}
          scale={[0.16, 0.14, 0.24]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.armor)}
        />
      </group>

      {/* ── Right Leg ── */}
      <group ref={rightLegRef} position={[0.12, 0.2, 0]}>
        <mesh
          position={[0, -0.24, 0]}
          scale={[0.14, 0.38, 0.14]}
          geometry={UNIT_CYLINDER}
          material={standardMaterial(colors.primary)}
        />
        <mesh
          position={[0, -0.45, 0.04]}
          scale={[0.16, 0.14, 0.24]}
          geometry={UNIT_BOX}
          material={standardMaterial(colors.armor)}
        />
      </group>
    </group>
  );
}
