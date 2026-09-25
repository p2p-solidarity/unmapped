// The parametric humanoid ("角色本體"): pure proportions and part descriptions, no three and no
// React, so vitest can walk every BodyKind / HatKind / HeldKind without a WebGL context.
//
// Convention: the skeleton stands on y = 0 (the parent group already sits on the tile surface),
// faces +Z, and every number is in world units. Colours are *roles*, never hex — `Humanoid.tsx`
// resolves `body`/`accent` from the NpcSpec and everything else from palette/.

import type { BodyKind, HatKind } from "@shared/world";
import type { Vec3 } from "./colliders";
import type { GeoKey } from "./palette";

export type PartColor = "body" | "accent" | "skin" | "dark" | "metal" | "wood" | "cloth" | "glow";

export interface HumanoidPart {
  /** Stable key — parts are static data, so React never needs an array index. */
  id: string;
  geo: GeoKey;
  /** Offset from the anchor (head centre for hats, hand grip for held items). */
  offset: Vec3;
  /** Full size in world units. */
  size: Vec3;
  /** Euler XYZ rotation in radians. */
  rotation: Vec3;
  color: PartColor;
  /** Emissive intensity; 0 means a matte part. */
  emissive: number;
}

export interface HumanoidProportions {
  /** Leg length from the sole to the hip joint. */
  legLength: number;
  legRadius: number;
  /** Distance from the centre line to each leg. */
  legSpread: number;
  torsoWidth: number;
  torsoHeight: number;
  torsoDepth: number;
  armLength: number;
  armRadius: number;
  /** Distance from the centre line to each shoulder joint. */
  armSpread: number;
  headRadius: number;
  /** Forward hunch of the upper body, in radians (elders stoop). */
  lean: number;
  /** Idle breathing amplitude multiplier; children fidget more than elders. */
  breath: number;
}

/** The head radius the hat table is authored against; hats scale by headRadius / this. */
export const BASE_HEAD_RADIUS = 0.19;
/** The hand height the held table is authored against; held items scale by handY / this. */
export const BASE_HAND_HEIGHT = 0.45;
/** NPCs turn to face the player inside this many tiles. */
export const FACE_TILES = 3;

export const BODY_PROPORTION: Record<BodyKind, HumanoidProportions> = {
  slim: {
    legLength: 0.42,
    legRadius: 0.085,
    legSpread: 0.1,
    torsoWidth: 0.34,
    torsoHeight: 0.44,
    torsoDepth: 0.22,
    armLength: 0.38,
    armRadius: 0.07,
    armSpread: 0.22,
    headRadius: 0.19,
    lean: 0,
    breath: 1,
  },
  stout: {
    legLength: 0.32,
    legRadius: 0.115,
    legSpread: 0.13,
    torsoWidth: 0.48,
    torsoHeight: 0.42,
    torsoDepth: 0.32,
    armLength: 0.32,
    armRadius: 0.095,
    armSpread: 0.29,
    headRadius: 0.2,
    lean: 0.03,
    breath: 1.3,
  },
  tall: {
    legLength: 0.58,
    legRadius: 0.08,
    legSpread: 0.11,
    torsoWidth: 0.33,
    torsoHeight: 0.5,
    torsoDepth: 0.21,
    armLength: 0.48,
    armRadius: 0.065,
    armSpread: 0.215,
    headRadius: 0.18,
    lean: 0.02,
    breath: 0.85,
  },
  child: {
    legLength: 0.24,
    legRadius: 0.07,
    legSpread: 0.08,
    torsoWidth: 0.26,
    torsoHeight: 0.28,
    torsoDepth: 0.18,
    armLength: 0.22,
    armRadius: 0.055,
    armSpread: 0.17,
    headRadius: 0.21,
    lean: 0,
    breath: 1.5,
  },
  elder: {
    legLength: 0.36,
    legRadius: 0.08,
    legSpread: 0.1,
    torsoWidth: 0.35,
    torsoHeight: 0.4,
    torsoDepth: 0.23,
    armLength: 0.34,
    armRadius: 0.068,
    armSpread: 0.225,
    headRadius: 0.19,
    lean: 0.26,
    breath: 0.7,
  },
};

/** Hip joint height — the pivot the leaning upper body rotates around. */
export function hipY(p: HumanoidProportions): number {
  return p.legLength;
}

/** Torso centre, measured from the hip (i.e. inside the leaning upper-body group). */
export function torsoCenterY(p: HumanoidProportions): number {
  return p.torsoHeight / 2;
}

/** Shoulder joint height, measured from the hip. */
export function shoulderY(p: HumanoidProportions): number {
  return p.torsoHeight - p.armRadius * 1.6;
}

/** Head centre, measured from the hip. */
export function headCenterY(p: HumanoidProportions): number {
  return p.torsoHeight + p.headRadius * 0.86;
}

/** Full standing height, from the soles to the top of the head. */
export function humanoidHeight(p: HumanoidProportions): number {
  return hipY(p) + headCenterY(p) + p.headRadius;
}

/** Right-hand grip in the upper body's frame: the anchor every held item hangs off. */
export function handGrip(p: HumanoidProportions): Vec3 {
  return [p.armSpread, shoulderY(p) - p.armLength, p.armRadius * 0.6];
}

/** Held items are authored for an adult's grip height and shrink with a smaller build. */
export function heldScale(p: HumanoidProportions): number {
  return Math.min(1.15, Math.max(0.55, (hipY(p) + shoulderY(p) - p.armLength) / BASE_HAND_HEIGHT));
}

/** Hats are authored for BASE_HEAD_RADIUS and scale with the actual head. */
export function hatScale(p: HumanoidProportions): number {
  return p.headRadius / BASE_HEAD_RADIUS;
}

/** Helmets cover the whole face, so the eye dots are replaced by the hat's own visor slit. */
export function facesHidden(hat: HatKind): boolean {
  return hat === "helm";
}

/**
 * Yaw that turns the humanoid toward the player, or null when the player is out of reach (the
 * caller then keeps its idle sway). The model faces +Z, so the yaw is atan2(dx, dz).
 */
export function faceYaw(
  originX: number,
  originZ: number,
  playerX: number,
  playerZ: number,
  reach = FACE_TILES,
): number | null {
  const dx = playerX - originX;
  const dz = playerZ - originZ;
  if (Math.hypot(dx, dz) > reach) return null;
  if (dx === 0 && dz === 0) return null;
  return Math.atan2(dx, dz);
}

/** Shortest signed angle from `from` to `to`, so the turn never takes the long way round. */
export function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}
