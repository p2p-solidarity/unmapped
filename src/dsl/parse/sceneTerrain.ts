import { builtinAssetKind } from "@shared/assets";
import { propError } from "./program";
// Readers for everything the player walks on or bumps into: the floor plane, the tile patches
// painted over it, the platforms raised above it, walls and props.

import type { OpenUIError } from "@openuidev/lang-core";
import type { FloorSpec, PatchSpec, PlatformSpec, PropSpec, WallSpec } from "@shared/world";
import { clampFloat, clampInt, LIMITS } from "../limits";
import { toHex } from "../schemas/common";
import { SCENE_PROPS } from "../schemas/scene";
import { type ChildNode, readProps } from "./program";
import type { SceneScope } from "./sceneScope";

/** The one Floor of the program (the first, if a confused model wrote several). */
export function readFloor(children: ChildNode[], issues: OpenUIError[]): FloorSpec | null {
  const node = children.find((child) => child.typeName === "Floor");
  if (node === undefined) return null;
  const props = readProps(SCENE_PROPS.Floor, node, issues);
  if (props === null) return null;
  return {
    width: clampInt(props.width, LIMITS.floor),
    depth: clampInt(props.depth, LIMITS.floor),
    tile: props.tile,
  };
}

/** Extent that starts at `start` and may not run past `extent`. */
const clampSpan = (value: number, start: number, extent: number, max: number): number =>
  clampInt(value, { min: LIMITS.span.min, max: Math.max(1, Math.min(max, extent - start)) });

export function readPatch(child: ChildNode, scope: SceneScope): PatchSpec | null {
  const p = readProps(SCENE_PROPS.Patch, child, scope.issues);
  if (p === null) return null;
  const x = scope.x(p.x);
  const z = scope.z(p.z);
  return {
    x,
    z,
    width: clampSpan(p.width, x, scope.floor.width, LIMITS.patchSpan.max),
    depth: clampSpan(p.depth, z, scope.floor.depth, LIMITS.patchSpan.max),
    tile: p.tile,
  };
}

export function readPlatform(child: ChildNode, scope: SceneScope): PlatformSpec | null {
  const p = readProps(SCENE_PROPS.Platform, child, scope.issues);
  if (p === null) return null;
  const x = scope.x(p.x);
  const z = scope.z(p.z);
  return {
    x,
    z,
    width: clampSpan(p.width, x, scope.floor.width, LIMITS.span.max),
    depth: clampSpan(p.depth, z, scope.floor.depth, LIMITS.span.max),
    y: clampFloat(p.y, LIMITS.platformY),
    height: clampFloat(p.height, LIMITS.platformHeight),
    tile: p.tile,
    bounce: p.bounce === true,
  };
}

export function readWall(child: ChildNode, scope: SceneScope): WallSpec | null {
  const p = readProps(SCENE_PROPS.Wall, child, scope.issues);
  if (p === null) return null;
  return {
    x: scope.x(p.x),
    z: scope.z(p.z),
    width: clampInt(p.width, LIMITS.wallWidth),
    height: clampInt(p.height, LIMITS.wallHeight),
    material: p.material,
  };
}

export function readProp(child: ChildNode, scope: SceneScope): PropSpec | null {
  const p = readProps(SCENE_PROPS.Prop, child, scope.issues);
  if (p === null) return null;
  if (p.assetId != null && builtinAssetKind(p.assetId) !== p.kind) {
    scope.issues.push(
      propError(
        "Prop",
        `Asset ${p.assetId} is missing or does not match ${p.kind}.`,
        "Use the installed asset ID for this prop kind.",
      ),
    );
    return null;
  }
  return {
    ...(p.assetId == null ? {} : { assetId: p.assetId }),
    kind: p.kind,
    x: scope.x(p.x),
    z: scope.z(p.z),
    scale: p.scale === null || p.scale === undefined ? 1 : clampFloat(p.scale, LIMITS.scale),
    tint: p.tint === null || p.tint === undefined ? null : toHex(p.tint),
    dynamic: p.dynamic === true,
  };
}
