// Treasure chest: a box with a hinged lid. Ids in `engineStore.openedTreasures` render with the
// lid swung open and a dim, spent material.

import type { TreasureSpec } from "@shared/world";
import type { JSX } from "react";
import { TILE_TOP } from "../colliders";
import { standardMaterial, UNIT_BOX } from "../geometry";
import { ENTITY_PALETTE } from "../palette";

const LID_OPEN_ANGLE = -1.9;

export function Treasure({
  treasure,
  opened,
}: {
  treasure: TreasureSpec;
  opened: boolean;
}): JSX.Element {
  const body = standardMaterial(
    opened ? ENTITY_PALETTE.treasureOpened : ENTITY_PALETTE.treasureBody,
  );
  const lid = standardMaterial(opened ? ENTITY_PALETTE.treasureOpened : ENTITY_PALETTE.treasureLid);
  const glow = standardMaterial(ENTITY_PALETTE.treasureGlow, opened ? 0 : 1.1);

  return (
    <group position={[treasure.x + 0.5, TILE_TOP, treasure.z + 0.5]}>
      <mesh
        castShadow
        receiveShadow
        geometry={UNIT_BOX}
        position={[0, 0.24, 0]}
        scale={[0.8, 0.48, 0.6]}
        material={body}
      />
      <mesh
        geometry={UNIT_BOX}
        position={[0, 0.47, 0]}
        scale={[0.84, 0.05, 0.64]}
        material={glow}
      />
      <group position={[0, 0.48, -0.3]} rotation={[opened ? LID_OPEN_ANGLE : 0, 0, 0]}>
        <mesh
          castShadow
          geometry={UNIT_BOX}
          position={[0, 0.08, 0.3]}
          scale={[0.84, 0.16, 0.64]}
          material={lid}
        />
      </group>
    </group>
  );
}
