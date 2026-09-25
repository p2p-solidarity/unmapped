// Where notes were left: a small stake with a slip of paper on the tile, labelled with its author.
// Only chunks near the player are drawn; the words themselves are read in the notes panel.

import { useT } from "@renderer/i18n";
import { useEngineStore, useLandStore } from "@renderer/state";
import { CHUNK_SIZE, chunkDistance } from "@shared/chunks";
import type { JSX } from "react";
import { TILE_TOP, tileToWorld } from "./colliders";
import { Label } from "./Entities/Label";
import { standardMaterial, UNIT_BOX, UNIT_CYLINDER } from "./geometry";
import { ENTITY_PALETTE } from "./palette";

const NEAR = 1;

export function LandNotes(): JSX.Element | null {
  const notes = useLandStore((state) => state.notes);
  const chunk = useEngineStore((state) => state.chunk);
  const t = useT();
  if (chunk === null) return null;
  const stake = standardMaterial(ENTITY_PALETTE.doorFrame, 0);
  const paper = standardMaterial(ENTITY_PALETTE.notePaper, 0.15);
  return (
    <>
      {notes
        .filter((note) => chunkDistance(note.coord, chunk) <= NEAR)
        .map((note) => {
          const [x, z] = tileToWorld(note.coord.x, note.coord.z);
          return (
            <group
              key={note.id}
              position={[note.coord.cx * CHUNK_SIZE + x, TILE_TOP, note.coord.cz * CHUNK_SIZE + z]}
            >
              <mesh
                geometry={UNIT_CYLINDER}
                material={stake}
                position={[0, 0.45, 0]}
                scale={[0.08, 0.9, 0.08]}
              />
              <mesh
                geometry={UNIT_BOX}
                material={paper}
                position={[0, 0.85, 0.05]}
                scale={[0.32, 0.22, 0.02]}
              />
              <Label text={t("hud.noteBy", { author: note.author })} y={1.3} />
            </group>
          );
        })}
    </>
  );
}
