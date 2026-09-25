// Residents of witnessed chunks as interaction targets, in world coordinates. Pure.

import type { ChunkStatus } from "@renderer/state";
import { CHUNK_SIZE } from "@shared/chunks";
import { errandKey, type LandProgress, landNpcTarget } from "@shared/land";
import type { SceneGraph } from "@shared/world";
import { tileToWorld } from "./colliders";
import { DOOR_ID, doorPosition } from "./home";
import type { TargetPoint } from "./targets";

export function landTargets(
  chunks: Readonly<Record<string, ChunkStatus>>,
  progress: LandProgress | null,
  origin: SceneGraph,
): TargetPoint[] {
  const points: TargetPoint[] = [];
  if (progress !== null) {
    const [x, z] = doorPosition(origin, progress.home);
    points.push({ kind: "door", id: DOOR_ID, label: "Door", x, z, reach: 0.5 });
  }
  for (const [key, chunk] of Object.entries(chunks)) {
    if (chunk.status !== "written") continue;
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    for (const npc of chunk.scene.npcs) {
      const [x, z] = tileToWorld(npc.x, npc.z);
      points.push({
        kind: "npc",
        id: landNpcTarget({ cx, cz }, npc.id),
        label: npc.name,
        x: cx * CHUNK_SIZE + x,
        z: cz * CHUNK_SIZE + z,
        reach: 0,
      });
    }
    // A lost thing can be searched for only once somebody has asked the player to look.
    for (const errand of chunk.errands?.errands ?? []) {
      const key = errandKey({ cx, cz }, errand.id);
      if (errand.tile === null || progress?.errands[key] !== "accepted") continue;
      const [x, z] = tileToWorld(errand.tile.x, errand.tile.z);
      points.push({
        kind: "search",
        id: `search:${key}`,
        label: errand.ask,
        x: cx * CHUNK_SIZE + x,
        z: cz * CHUNK_SIZE + z,
        reach: 0.5,
      });
    }
  }
  return points;
}
