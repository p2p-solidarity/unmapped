// Platforms — the jump-puzzle blocks. Two lists render through the same component:
//
//   baked  — `SceneGraph.platforms`, solid and permanent (the DSL is the truth).
//   draft  — `usePlatformStore.drafts`, the editor's unsaved previews: translucent at
//            DRAFT_OPACITY with an accent lip (brighter while selected), but fully collidable so
//            they can be test-jumped before "Apply" bakes them into world.oui.
//
// A draft that still matches its baked original is dropped by `allPlatformBodies`, so opening the
// editor never doubles the world. The engine never reads localStorage; drafts arrive through the
// store, baked ones through props.

import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { usePlatformStore } from "@renderer/state";
import type { PlatformSpec } from "@shared/world";
import { type JSX, useMemo } from "react";
import { TILE_TOP } from "./colliders";
import { standardMaterial, translucentMaterial, UNIT_BOX, UNIT_OCTA } from "./geometry";
import { ENTITY_PALETTE, TILE_TINT } from "./palette";
import {
  allPlatformBodies,
  DRAFT_OPACITY,
  type PlatformBody,
  platformBottomY,
} from "./platformBoxes";

const BOUNCE_RESTITUTION = 1.4;
const LIP_THICKNESS = 0.02;
const LIP_OVERHANG = 0.04;
const STRUT_WIDTH = 0.15;
/** A platform floating higher than this gets a support strut down to the floor. */
const STRUT_MIN_HEIGHT = 0.6;

export function Platforms({ platforms }: { platforms: readonly PlatformSpec[] }): JSX.Element {
  const drafts = usePlatformStore((state) => state.drafts);
  const selectedId = usePlatformStore((state) => state.selectedId);
  const bodies = useMemo(() => allPlatformBodies(platforms, drafts), [platforms, drafts]);

  return (
    <group>
      {bodies.map((body) => (
        <PlatformBlock key={body.id} body={body} selected={body.draft && body.id === selectedId} />
      ))}
    </group>
  );
}

function PlatformBlock({ body, selected }: { body: PlatformBody; selected: boolean }): JSX.Element {
  const { center, half } = body.box;
  const size: [number, number, number] = [half[0] * 2, half[1] * 2, half[2] * 2];
  const tint = TILE_TINT[body.tile];
  const lip = selected
    ? ENTITY_PALETTE.platformSelected
    : body.bounce
      ? ENTITY_PALETTE.platformBounce
      : ENTITY_PALETTE.platformEdge;
  const lipGlow = selected ? 2.8 : body.bounce ? 2.5 : 1.2;
  const strutHeight = platformBottomY(body) - TILE_TOP;

  return (
    <group>
      <RigidBody type="fixed" colliders={false} position={center}>
        <CuboidCollider
          args={half}
          friction={0.6}
          restitution={body.bounce ? BOUNCE_RESTITUTION : 0}
        />
      </RigidBody>

      <mesh
        castShadow={!body.draft}
        receiveShadow={!body.draft}
        position={center}
        scale={size}
        geometry={UNIT_BOX}
        material={
          body.draft
            ? translucentMaterial(tint, DRAFT_OPACITY, body.bounce ? 0.4 : 0.15)
            : standardMaterial(tint, body.bounce ? 0.4 : 0)
        }
      />

      {/* Glowing lip along the walkable face. */}
      <mesh
        position={[center[0], center[1] + half[1] + LIP_THICKNESS / 2, center[2]]}
        scale={[size[0] + LIP_OVERHANG, LIP_THICKNESS, size[2] + LIP_OVERHANG]}
        geometry={UNIT_BOX}
        material={standardMaterial(lip, lipGlow)}
      />

      {body.bounce && (
        <mesh
          position={[center[0], center[1] + half[1] + 0.15, center[2]]}
          scale={[0.35, 0.35, 0.35]}
          geometry={UNIT_OCTA}
          material={standardMaterial(ENTITY_PALETTE.platformBounce, 3)}
        />
      )}

      {strutHeight > STRUT_MIN_HEIGHT && (
        <mesh
          position={[center[0], TILE_TOP + strutHeight / 2, center[2]]}
          scale={[STRUT_WIDTH, strutHeight, STRUT_WIDTH]}
          geometry={UNIT_BOX}
          material={standardMaterial(ENTITY_PALETTE.platformStrut, 0.8)}
        />
      )}
    </group>
  );
}
