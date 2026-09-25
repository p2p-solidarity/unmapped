// Pure draft ⇄ PlatformSpec mapping for the visual platform editor. Kept out of the store so the
// clamps are unit-testable and so the modal and the store agree on what a legal platform is.
//
// A draft is the *editor's* shape (it has an id and a name so the list can address it); a
// PlatformSpec is what the DSL bakes into world.oui. Ids and names never reach the file.

import { clampFloat, clampInt, LIMITS } from "@dsl/index";
import type { PlatformSpec, Tile } from "@shared/world";

export interface Platform {
  id: string;
  name: string;
  x: number;
  /** Elevation of the underside above the floor, in tiles. */
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Thickness in tiles. */
  height: number;
  tile: Tile;
  /** Bounce pad: landing on it launches the player upward. */
  isBounce: boolean;
}

export interface PlatformPreset {
  name: string;
  width: number;
  depth: number;
  height: number;
  tile: Tile;
  isBounce?: boolean;
}

/** Design presets, not world data: nothing is spawned until the player picks one. */
export const PLATFORM_PRESETS: PlatformPreset[] = [
  { name: "Floating Stepping Stone", width: 2, depth: 2, height: 0.4, tile: "stone" },
  { name: "Sky Bridge", width: 6, depth: 1.5, height: 0.4, tile: "wood" },
  { name: "Cyber Dais", width: 4, depth: 4, height: 0.6, tile: "void" },
  { name: "Hyper Jump Booster", width: 2, depth: 2, height: 0.5, tile: "lava", isBounce: true },
  { name: "Floating Garden Island", width: 5, depth: 5, height: 0.8, tile: "grass" },
];

/** The ranges the editor and the bake share; they are the DSL's own limits (Rule 7). */
export const PLATFORM_RANGES = {
  x: LIMITS.coord,
  z: LIMITS.coord,
  width: LIMITS.span,
  depth: LIMITS.span,
  y: LIMITS.platformY,
  height: LIMITS.platformHeight,
} as const;

/** Maximum number of platforms a scene program may carry. */
export const MAX_PLATFORMS = LIMITS.maxPlatforms;

const DEFAULTS = { x: 4, y: 1.5, z: 4, width: 3, depth: 3, height: 0.4, tile: "stone" } as const;

let seq = 0;

export function nextDraftId(): string {
  seq += 1;
  return `draft_${seq}`;
}

/** Clamps every number of a draft into the DSL's ranges, so the editor is WYSIWYG. */
export function normalizeDraft(draft: Platform): Platform {
  return {
    ...draft,
    x: clampInt(draft.x, PLATFORM_RANGES.x),
    z: clampInt(draft.z, PLATFORM_RANGES.z),
    width: clampInt(draft.width, PLATFORM_RANGES.width),
    depth: clampInt(draft.depth, PLATFORM_RANGES.depth),
    y: clampFloat(draft.y, PLATFORM_RANGES.y),
    height: clampFloat(draft.height, PLATFORM_RANGES.height),
  };
}

/** A new draft from a preset (or nothing); `index` only feeds the default name. */
export function makeDraft(partial: Partial<Platform> | undefined, index: number): Platform {
  return normalizeDraft({
    id: nextDraftId(),
    name: partial?.name ?? `Platform ${index + 1}`,
    x: partial?.x ?? DEFAULTS.x,
    y: partial?.y ?? DEFAULTS.y,
    z: partial?.z ?? DEFAULTS.z,
    width: partial?.width ?? DEFAULTS.width,
    depth: partial?.depth ?? DEFAULTS.depth,
    height: partial?.height ?? DEFAULTS.height,
    tile: partial?.tile ?? DEFAULTS.tile,
    isBounce: partial?.isBounce ?? false,
  });
}

/** Bake: the id and the name are editor-only and are dropped; `isBounce` becomes `bounce`. */
export function toPlatformSpec(draft: Platform): PlatformSpec {
  return {
    x: clampInt(draft.x, PLATFORM_RANGES.x),
    z: clampInt(draft.z, PLATFORM_RANGES.z),
    width: clampInt(draft.width, PLATFORM_RANGES.width),
    depth: clampInt(draft.depth, PLATFORM_RANGES.depth),
    y: clampFloat(draft.y, PLATFORM_RANGES.y),
    height: clampFloat(draft.height, PLATFORM_RANGES.height),
    tile: draft.tile,
    bounce: draft.isBounce === true,
  };
}

/** Un-bake: the platforms of a parsed scene become editable drafts with generated ids/names. */
export function draftsFromSpecs(specs: readonly PlatformSpec[]): Platform[] {
  return specs.map((spec, index) =>
    normalizeDraft({
      id: nextDraftId(),
      name: `Platform ${index + 1}`,
      x: spec.x,
      y: spec.y,
      z: spec.z,
      width: spec.width,
      depth: spec.depth,
      height: spec.height,
      tile: spec.tile,
      isBounce: spec.bounce,
    }),
  );
}
