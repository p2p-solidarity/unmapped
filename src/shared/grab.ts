// The physics gun, as maths (`rigid_body@1`).
//
// Garry's Mod's one irreplaceable verb is "point at a thing, pick it up, and throw it". That is
// three decisions — what the ray hits, where a held body is being pulled toward, and how hard —
// and all three are pure, so they are tested here rather than guessed at inside a render loop.
//
// The engine half is `src/renderer/engine/sandbox/`: it owns the Rapier bodies and does nothing
// but feed positions in and push velocities out.

import type { Ray } from "./combat";

/** How far in front of the eye a grabbed body is held, in tiles. */
export const HOLD_DISTANCE = { min: 1.4, max: 8, step: 0.6, default: 3.2 } as const;

/** Furthest a grab reaches. Past this the trigger simply finds nothing. */
export const GRAB_RANGE = 14;

/**
 * How hard a held body is pulled toward the hold point, in 1/seconds. High enough that the body
 * tracks the aim, low enough that it still visibly swings and can be blocked by a wall — being
 * stopped by the world is the whole appeal, so a held body is never teleported.
 */
export const HOLD_STIFFNESS = 9;

/** Ceiling on the velocity the hold may impart, so a body can never be flung through geometry. */
export const HOLD_MAX_SPEED = 26;

/** One body a grab could pick, as a sphere. Positions are world units, not tiles. */
export interface GrabCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
}

export interface GrabHit {
  id: string;
  /** Distance from the eye along the aim ray, in tiles. */
  distance: number;
}

/**
 * Nearest body the aim ray passes through, or null. Deterministic for a given ray and set, and
 * it never reaches behind the player — a body the ray only meets going backwards is a miss.
 */
export function pickGrab(
  ray: Ray,
  candidates: readonly GrabCandidate[],
  range: number = GRAB_RANGE,
): GrabHit | null {
  const length = Math.hypot(ray.dx, ray.dy, ray.dz);
  if (length === 0) return null;
  const dx = ray.dx / length;
  const dy = ray.dy / length;
  const dz = ray.dz / length;

  let best: GrabHit | null = null;
  for (const candidate of candidates) {
    const ox = candidate.x - ray.x;
    const oy = candidate.y - ray.y;
    const oz = candidate.z - ray.z;
    const along = ox * dx + oy * dy + oz * dz;
    if (along <= 0 || along > range) continue;
    const missX = ox - dx * along;
    const missY = oy - dy * along;
    const missZ = oz - dz * along;
    if (Math.hypot(missX, missY, missZ) > candidate.radius) continue;
    if (best === null || along < best.distance) best = { id: candidate.id, distance: along };
  }
  return best;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

/** Where a body held at `distance` should be: straight out along the aim. */
export function holdPoint(ray: Ray, distance: number): Vec3Like {
  const length = Math.hypot(ray.dx, ray.dy, ray.dz);
  if (length === 0) return { x: ray.x, y: ray.y, z: ray.z };
  const reach = clampHoldDistance(distance);
  return {
    x: ray.x + (ray.dx / length) * reach,
    y: ray.y + (ray.dy / length) * reach,
    z: ray.z + (ray.dz / length) * reach,
  };
}

export function clampHoldDistance(distance: number): number {
  return Math.max(HOLD_DISTANCE.min, Math.min(HOLD_DISTANCE.max, distance));
}

/**
 * Velocity that carries a held body toward the hold point. Clamped, so a body that is stuck
 * behind a wall strains against it instead of accumulating enough speed to tunnel through.
 */
export function holdVelocity(current: Vec3Like, target: Vec3Like): Vec3Like {
  const vx = (target.x - current.x) * HOLD_STIFFNESS;
  const vy = (target.y - current.y) * HOLD_STIFFNESS;
  const vz = (target.z - current.z) * HOLD_STIFFNESS;
  const speed = Math.hypot(vx, vy, vz);
  if (speed <= HOLD_MAX_SPEED) return { x: vx, y: vy, z: vz };
  const scale = HOLD_MAX_SPEED / speed;
  return { x: vx * scale, y: vy * scale, z: vz * scale };
}
