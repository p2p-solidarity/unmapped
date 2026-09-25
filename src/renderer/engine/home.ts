// Where home's things stand (plan.md §7): the door and the keepsake shelf sit beside the spot the
// player wakes on in the home chunk. Pure positions in world tiles.

import { CHUNK_SIZE } from "@shared/chunks";
import type { HomeState } from "@shared/land";
import type { SceneGraph } from "@shared/world";
import { spawnPoint } from "./colliders";

export const DOOR_ID = "home-door";

/** World XZ of the door: two tiles east of spawn, in the home chunk. */
export function doorPosition(
  origin: SceneGraph,
  home: Pick<HomeState, "cx" | "cz">,
): [number, number] {
  const [x, , z] = spawnPoint(origin);
  return [home.cx * CHUNK_SIZE + x + 2, home.cz * CHUNK_SIZE + z];
}

/** World XZ of the n-th keepsake pedestal: a row two tiles north of spawn. */
export function shelfPosition(
  origin: SceneGraph,
  home: Pick<HomeState, "cx" | "cz">,
  index: number,
): [number, number] {
  const [x, , z] = spawnPoint(origin);
  return [home.cx * CHUNK_SIZE + x - 2 + index * 1.2, home.cz * CHUNK_SIZE + z - 2];
}

const FOREIGN_DOOR = "door:";

/** Interaction id of another world's door on the continent. */
export function foreignDoorId(worldId: string): string {
  return `${FOREIGN_DOOR}${worldId}`;
}

/** The world id of a foreign door's interaction id, or null for anything else (home's own door). */
export function foreignDoorOf(targetId: string): string | null {
  return targetId.startsWith(FOREIGN_DOOR) ? targetId.slice(FOREIGN_DOOR.length) : null;
}
