// The open land around an authored scene: the chunks within VIEW_RADIUS of the player, each one
// regenerated from the land's seed and its own coordinates (`@shared/chunks`). Nothing here is
// stored — a chunk that scrolls out of range is dropped and comes back identical.
//
// The player's position is read from its ref every frame, but React only hears about it when the
// player crosses into another chunk, which is what decides the set of mounted chunks.

import { useFrame } from "@react-three/fiber";
import { useEngineStore, useLandStore } from "@renderer/state";
import {
  CHUNK_SIZE,
  type ChunkCoord,
  chunkDistance,
  chunkKey,
  chunkOf,
  chunksAround,
  chunkTerrain,
} from "@shared/chunks";
import type { SceneGraph } from "@shared/world";
import { type JSX, memo, type RefObject, useEffect, useMemo, useState } from "react";
import type * as THREE from "three";
import { Npc } from "./Entities/Npc";
import { FarLand } from "./FarLand";
import { Ground } from "./Ground";
import { Props } from "./Props";
import { Walls } from "./Walls";

/** Rings of chunks drawn around the player's chunk; the fog floor in <Atmosphere> hides the rim. */
export const VIEW_RADIUS = 2;
/** Rings that also carry colliders. One is enough: nothing moves a whole chunk in a frame. */
const SOLID_RADIUS = 1;

export function ChunkField({
  origin,
  seed,
  player,
}: {
  origin: SceneGraph;
  seed: number;
  player: RefObject<THREE.Vector3>;
}): JSX.Element {
  const [centre, setCentre] = useState<ChunkCoord>(() =>
    chunkOf(player.current.x, player.current.z),
  );

  useFrame(() => {
    const next = chunkOf(player.current.x, player.current.z);
    if (next.cx !== centre.cx || next.cz !== centre.cz) setCentre(next);
  });

  useEffect(() => {
    useEngineStore.getState().setChunk(centre);
    return () => useEngineStore.getState().setChunk(null);
  }, [centre]);

  // A chunk witnessed while the player stands in it must not grow a house around them: its new
  // buildings stay walk-through until the player has stepped out of that chunk once.
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    const here = chunkKey(centre);
    setFresh(null);
    return useLandStore.subscribe((state, previous) => {
      const now = state.chunks[here];
      if (now?.status === "written" && previous.chunks[here]?.status !== "written") setFresh(here);
    });
  }, [centre]);

  const coords = useMemo(() => chunksAround(centre, VIEW_RADIUS), [centre]);

  return (
    <>
      {coords.map((coord) => (
        <Chunk
          key={chunkKey(coord)}
          cx={coord.cx}
          cz={coord.cz}
          seed={seed}
          floor={origin.floor}
          solid={chunkDistance(coord, centre) <= SOLID_RADIUS}
          settled={chunkKey(coord) !== fresh}
          player={player}
        />
      ))}
      <FarLand centre={centre} seed={seed} floor={origin.floor} />
    </>
  );
}

const Chunk = memo(function Chunk({
  cx,
  cz,
  seed,
  floor,
  solid,
  settled,
  player,
}: {
  cx: number;
  cz: number;
  seed: number;
  floor: SceneGraph["floor"];
  solid: boolean;
  /** False while this chunk's overlay was written around the standing player. */
  settled: boolean;
  player: RefObject<THREE.Vector3>;
}): JSX.Element {
  const terrain = useMemo(
    () => chunkTerrain({ seed, coord: { cx, cz }, origin: { floor } }),
    [seed, cx, cz, floor],
  );
  // What was written here when somebody first walked in; absent while the chunk is unwritten.
  const written = useLandStore((state) => {
    const chunk = state.chunks[chunkKey({ cx, cz })];
    return chunk?.status === "written" ? chunk.scene : null;
  });
  const offset = useMemo(() => [cx * CHUNK_SIZE, cz * CHUNK_SIZE] as const, [cx, cz]);
  return (
    <group position={[offset[0], 0, offset[1]]}>
      <Ground floor={terrain.floor} patches={terrain.patches} hole={terrain.hole} solid={solid} />
      <Props props={terrain.props} solid={solid} />
      {written === null ? null : (
        <>
          <Walls walls={written.walls} solid={solid && settled} />
          <Props props={written.props} solid={solid && settled} />
          {written.npcs.map((npc) => (
            <Npc key={npc.id} npc={npc} player={player} offset={offset} />
          ))}
        </>
      )}
    </group>
  );
});
