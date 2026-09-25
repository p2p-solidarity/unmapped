// NPC: a parametric <Humanoid> built from the model's body / hat / held / colour choices, with a
// floating name label. The player position is a ref prop (never a store read) so the villager can
// turn and look when you walk up to them.

import type { NpcSpec } from "@shared/world";
import type { JSX, RefObject } from "react";
import type * as THREE from "three";
import { TILE_TOP, tileToWorld } from "../colliders";
import { hash2 } from "../geometry";
import { Humanoid } from "../Humanoid";
import { BODY_PROPORTION, humanoidHeight } from "../humanoidParts";
import { Label } from "./Label";

const LABEL_GAP = 0.42;

export function Npc({
  npc,
  player = null,
}: {
  npc: NpcSpec;
  player?: RefObject<THREE.Vector3> | null;
}): JSX.Element {
  const [x, z] = tileToWorld(npc.x, npc.z);
  const height = humanoidHeight(BODY_PROPORTION[npc.body]);

  return (
    <group position={[x, TILE_TOP, z]}>
      <Humanoid look={npc} origin={[x, z]} player={player} phase={hash2(npc.x, npc.z)} />
      <Label text={npc.name} y={height + LABEL_GAP} />
    </group>
  );
}
