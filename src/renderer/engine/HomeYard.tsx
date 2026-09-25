// Home on open land: the door with four dials, and a pedestal for every keepsake brought back.
// Both are drawn only from the save's home state — an empty shelf shows no pedestals.

import { useLandStore } from "@renderer/state";
import type { SceneGraph } from "@shared/world";
import type { JSX } from "react";
import { TILE_TOP } from "./colliders";
import { Label } from "./Entities/Label";
import { standardMaterial, UNIT_BOX, UNIT_CYLINDER } from "./geometry";
import { doorPosition, shelfPosition } from "./home";
import { ENTITY_PALETTE } from "./palette";

export function HomeYard({ origin }: { origin: SceneGraph }): JSX.Element | null {
  const progress = useLandStore((state) => state.progress);
  if (progress === null) return null;
  const [dx, dz] = doorPosition(origin, progress.home);
  const frame = standardMaterial(ENTITY_PALETTE.doorFrame, 0);
  const panel = standardMaterial(ENTITY_PALETTE.doorPanel, 0);
  return (
    <>
      <group position={[dx, TILE_TOP, dz]}>
        <mesh
          geometry={UNIT_BOX}
          material={frame}
          position={[-0.6, 1.1, 0]}
          scale={[0.15, 2.2, 0.2]}
          castShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={frame}
          position={[0.6, 1.1, 0]}
          scale={[0.15, 2.2, 0.2]}
          castShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={frame}
          position={[0, 2.25, 0]}
          scale={[1.4, 0.15, 0.25]}
          castShadow
        />
        <mesh
          geometry={UNIT_BOX}
          material={panel}
          position={[0, 1.05, 0]}
          scale={[1.05, 2.1, 0.08]}
          castShadow
        />
        <Label text="Door" y={2.7} />
      </group>
      {progress.home.keepsakes.map((item, index) => {
        const [x, z] = shelfPosition(origin, progress.home, index);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: shelf slots are positions; ids may repeat
          <group key={`${item.id}-${index}`} position={[x, TILE_TOP, z]}>
            <mesh
              geometry={UNIT_CYLINDER}
              material={frame}
              position={[0, 0.4, 0]}
              scale={[0.5, 0.8, 0.5]}
              castShadow
            />
            <mesh
              geometry={UNIT_BOX}
              material={panel}
              position={[0, 0.95, 0]}
              scale={[0.3, 0.3, 0.3]}
              castShadow
            />
            <Label text={item.name} y={1.5} />
          </group>
        );
      })}
    </>
  );
}
