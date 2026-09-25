// A door dial must land the walker on ground they can actually stand on. Try beside a resident,
// then the ford at the chunk centre, then nearby tiles. The same rule serves own and foreign land.

import { mergeChunks } from "@renderer/engine2d/continentLayer";
import { canStandAt } from "@renderer/engine2d/landModel";
import {
  type ChunkStatus,
  useContinentStore,
  useLandStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { CHUNK_SIZE, type ChunkCoord, chunkKey } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import { landSeedOf } from "@shared/land";
import type { SceneGraph } from "@shared/world";

export function doorArrival(
  coord: ChunkCoord,
  origin: SceneGraph,
  seed: number,
  chunks: Readonly<Record<string, ChunkStatus>>,
  land: TerritoryMap | null,
  near?: readonly [number, number],
): [number, number] | null {
  const written = chunks[chunkKey(coord)];
  const npc = written?.status === "written" ? written.scene.npcs[0] : undefined;
  const centre = CHUNK_SIZE / 2 + 0.5;
  const preferred = npc === undefined ? null : ([npc.x + 1.5, npc.z + 0.5] as const);
  const candidates: (readonly [number, number])[] = [
    ...(near === undefined
      ? []
      : [[near[0] - coord.cx * CHUNK_SIZE, near[1] - coord.cz * CHUNK_SIZE] as const]),
    ...(preferred === null ? [] : [preferred]),
    [centre, centre],
  ];
  // Search the joined centre ford first, keeping every candidate inside the destination chunk.
  for (let radius = 1; radius <= 8; radius += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) === radius) {
          candidates.push([centre + dx, centre + dz]);
        }
      }
    }
  }
  for (const [localX, localZ] of candidates) {
    if (localX < 0.5 || localZ < 0.5 || localX >= CHUNK_SIZE || localZ >= CHUNK_SIZE) continue;
    const x = coord.cx * CHUNK_SIZE + localX;
    const z = coord.cz * CHUNK_SIZE + localZ;
    if (canStandAt(origin, seed, chunks, x, z, land)) return [x, z];
  }
  return null;
}

/** The loaded game's own ground plus any foreign territory, as the walker sees it now. */
export function currentDoorArrival(
  coord: ChunkCoord,
  near?: readonly [number, number],
  expectedOwner?: string | null,
): [number, number] | null {
  const scene = useWorldStore.getState().scene;
  const save = useSessionStore.getState().activeInstance?.instance.save;
  if (scene.status !== "ready" || save === undefined) return null;
  const own = useLandStore.getState().chunks;
  const continent = useContinentStore.getState();
  const owner = continent.territory?.at(coord)?.worldId ?? null;
  if (expectedOwner !== undefined && owner !== expectedOwner) return null;
  const chunks = mergeChunks(own, continent.chunks, continent.territory);
  return doorArrival(coord, scene.value, landSeedOf(save), chunks, continent.territory, near);
}
