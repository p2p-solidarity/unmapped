// `team_party@1`: the local squad standing with the player. Allies are parametric humanoids at the
// roster's positions — they hold their ground and act on their own turn (CombatControl drives that).
// A downed ally is removed rather than drawn lying down; there is no death animation yet and a
// pose the engine cannot play would be a lie about what happened.

import { PARTY_LOOK } from "@renderer/engine/palette";
import { useEncounterStore } from "@renderer/state";
import type { JSX, RefObject } from "react";
import type * as THREE from "three";
import { TILE_TOP } from "../colliders";
import { Label } from "../Entities/Label";
import { hash2 } from "../geometry";
import { Humanoid } from "../Humanoid";
import { BODY_PROPORTION, humanoidHeight } from "../humanoidParts";
import { PLAYER_ID } from "./encounter";

const LABEL_GAP = 0.42;

export function Squad({ player }: { player: RefObject<THREE.Vector3> }): JSX.Element | null {
  const combatants = useEncounterStore((state) => state.combatants);
  const allies = combatants.filter(
    (one) => one.side === "party" && one.id !== PLAYER_ID && one.hp > 0,
  );
  if (allies.length === 0) return null;

  const height = humanoidHeight(BODY_PROPORTION[PARTY_LOOK.body]);
  return (
    <>
      {allies.map((ally) => {
        // Roster positions are already world units (encounter.ts); converting again drew every
        // ally half a tile away from where it stands in the fight.
        const { x, z } = ally;
        return (
          <group key={ally.id} position={[x, TILE_TOP, z]}>
            <Humanoid
              look={PARTY_LOOK}
              origin={[x, z]}
              player={player}
              phase={hash2(ally.x, ally.z)}
            />
            <Label text={`${ally.label} · ${ally.hp}/${ally.maxHp}`} y={height + LABEL_GAP} />
          </group>
        );
      })}
    </>
  );
}
