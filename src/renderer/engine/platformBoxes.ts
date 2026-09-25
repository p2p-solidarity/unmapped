// Platform maths, shared by the renderer and the character controller. Two sources feed it:
//
//   baked  — `SceneGraph.platforms`, parsed from world.oui. Solid, opaque, permanent.
//   draft  — `usePlatformStore.drafts`, unsaved editor previews. Translucent, but they still get
//            colliders so the player can test-jump them before pressing Apply.
//
// Both use the same geometry contract as PlatformSpec: (x, z) is the tile corner, `y` is the
// elevation of the *underside* above the floor top and `height` is the thickness.

import type { Platform } from "@renderer/state";
import type { PlatformSpec, Tile } from "@shared/world";
import { type BoxSpec, TILE_TOP } from "./colliders";

/** Draft platforms are see-through so the editor never lies about what is saved. */
export const DRAFT_OPACITY = 0.45;
/** Vertical slack when deciding whether the player is standing on a pad, in world units. */
export const PAD_TOLERANCE = 0.3;
/** Horizontal slack, so stepping on the very lip of a pad still launches the player. */
export const PAD_MARGIN = 0.2;

const MIN_SPAN = 0.2;
const MIN_THICKNESS = 0.08;

export interface PlatformBody {
  /** Stable React key; also tells drafts apart from baked blocks at a glance. */
  id: string;
  box: BoxSpec;
  tile: Tile;
  bounce: boolean;
  /** True for an unsaved editor draft. */
  draft: boolean;
  /** Editor label, or null for a baked platform (the scene graph carries no names). */
  name: string | null;
}

/** Cuboid for a platform placed with the PlatformSpec contract. */
export function platformBox(
  x: number,
  z: number,
  width: number,
  depth: number,
  y: number,
  height: number,
): BoxSpec {
  const w = Math.max(MIN_SPAN, width);
  const d = Math.max(MIN_SPAN, depth);
  const h = Math.max(MIN_THICKNESS, height);
  return {
    center: [x + w / 2, TILE_TOP + y + h / 2, z + d / 2],
    half: [w / 2, h / 2, d / 2],
  };
}

export function bakedPlatformBodies(specs: readonly PlatformSpec[]): PlatformBody[] {
  return specs.map((spec, index) => ({
    id: `baked-${index}-${spec.x}-${spec.z}`,
    box: platformBox(spec.x, spec.z, spec.width, spec.depth, spec.y, spec.height),
    tile: spec.tile,
    bounce: spec.bounce,
    draft: false,
    name: null,
  }));
}

export function draftPlatformBodies(drafts: readonly Platform[]): PlatformBody[] {
  return drafts.map((draft) => ({
    id: draft.id,
    box: platformBox(draft.x, draft.z, draft.width, draft.depth, draft.y, draft.height),
    tile: draft.tile,
    bounce: draft.isBounce,
    draft: true,
    name: draft.name,
  }));
}

/** Walkable surface of a platform. */
export function platformTopY(body: PlatformBody): number {
  return body.box.center[1] + body.box.half[1];
}

/** Underside of a platform, used to draw the support strut down to the floor. */
export function platformBottomY(body: PlatformBody): number {
  return body.box.center[1] - body.box.half[1];
}

/**
 * The bounce pad the player is currently standing on, or null. `feetY` is the sole height, so a
 * pad only fires when the player actually lands on top of it — never when brushing its side.
 */
export function bouncePadAt(
  bodies: readonly PlatformBody[],
  x: number,
  z: number,
  feetY: number,
  tolerance = PAD_TOLERANCE,
): PlatformBody | null {
  for (const body of bodies) {
    if (!body.bounce) continue;
    const [cx, , cz] = body.box.center;
    const [hx, , hz] = body.box.half;
    if (Math.abs(x - cx) > hx + PAD_MARGIN) continue;
    if (Math.abs(z - cz) > hz + PAD_MARGIN) continue;
    if (Math.abs(feetY - platformTopY(body)) > tolerance) continue;
    return body;
  }
  return null;
}

/** Geometry identity of a block, ignoring which list it came from. */
export function platformShapeKey(body: PlatformBody): string {
  return `${body.box.center.join(",")}|${body.box.half.join(",")}|${body.tile}|${body.bounce}`;
}

/**
 * Every platform the physics world knows about: baked first, drafts on top.
 *
 * The editor seeds its drafts from the scene it is editing, so a draft the player has not touched
 * yet is the *same* block as its baked original — it is dropped here rather than drawn (and
 * collided with) twice. The moment the player moves or resizes it, the draft differs and both
 * appear: the solid block the world still holds, and the translucent preview of the edit.
 */
export function allPlatformBodies(
  specs: readonly PlatformSpec[],
  drafts: readonly Platform[],
): PlatformBody[] {
  const baked = bakedPlatformBodies(specs);
  const seen = new Set(baked.map(platformShapeKey));
  const previews = draftPlatformBodies(drafts).filter((body) => !seen.has(platformShapeKey(body)));
  return [...baked, ...previews];
}
