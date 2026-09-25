// Where a hostile may walk in a bounded 3D scene (a place on the land, an authored floor): inside
// the floor, and clear of everything the player's capsule collides with there — walls, platforms
// too low to pass under, solid props. The player's own footprint is used, so a hostile fits exactly
// where the player does, and routes around a maze the way a click-walk would.

import type { SceneGraph } from "@shared/world";
import { findPath } from "../../engine2d/walkTo";
import { isWallTile, PLAYER_FOOT_OFFSET, PLAYER_RADIUS, propColliders } from "../colliders";
import type { HostileGround } from "./hostiles";

/** A platform whose underside sits lower than a standing body is a wall at ground level. */
const HEADROOM = PLAYER_FOOT_OFFSET * 2;

export function sceneGround(graph: SceneGraph): HostileGround {
  const { floor, walls } = graph;
  const low = graph.platforms.filter((one) => one.y < HEADROOM);
  const posts = propColliders(graph.props);
  const r = PLAYER_RADIUS;
  const under = (x: number, z: number): boolean =>
    low.some(
      (one) =>
        x > one.x - r && x < one.x + one.width + r && z > one.z - r && z < one.z + one.depth + r,
    );
  const stand = (x: number, z: number): boolean => {
    if (x < r || z < r || x > floor.width - r || z > floor.depth - r) return false;
    for (const [px, pz] of [
      [x - r, z - r],
      [x + r, z - r],
      [x - r, z + r],
      [x + r, z + r],
    ] as const) {
      if (isWallTile(walls, Math.floor(px), Math.floor(pz))) return false;
    }
    if (under(x, z)) return false;
    return !posts.some(
      (post) => Math.hypot(x - post.center[0], z - post.center[2]) < post.radius + r,
    );
  };
  return { stand, route: (from, to) => findPath(from, to, stand) };
}
