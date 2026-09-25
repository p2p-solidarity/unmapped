import { type AppError, ok, type Result } from "./result";
import type { SceneGraph } from "./world";

/** A tile coordinate on the floor's X/Z grid. */
export interface GridCoordinate {
  x: number;
  z: number;
}

/** Inputs that affect the deterministic geometry and navigation checks. */
export interface SceneValidationOptions {
  /** The tile where navigation starts. Omit to run geometry checks only. */
  spawn?: GridCoordinate;
  /** Tiles that must be reachable from `spawn`. Defaults to all scene exits. */
  requiredTargets?: readonly GridCoordinate[];
  /** Alias useful to callers that already call these points navigation targets. */
  targetCoordinates?: readonly GridCoordinate[];
  /** Alias retained for callers that use the shorter name. */
  targets?: readonly GridCoordinate[];
  /** Empty walkable space required around every exit, in tiles. */
  exitClearance?: number;
}

/** Object-shaped form for callers passing the scene and validation input together. */
export interface SceneValidationInput extends SceneValidationOptions {
  scene: SceneGraph;
}

export type SceneValidationIssueCode =
  | "floor-invalid"
  | "scene-out-of-bounds"
  | "scene-overlap"
  | "exit-clearance"
  | "navigation-coordinate-invalid"
  | "navigation-spawn-blocked"
  | "navigation-unreachable";

export interface SceneValidationIssue {
  code: SceneValidationIssueCode;
  path: string;
  message: string;
}

export interface NavigationTargetReport {
  target: GridCoordinate;
  reachable: boolean;
  /** The shortest deterministic four-neighbour route, when one exists. */
  route: readonly GridCoordinate[];
}

export interface SceneNavigationReport {
  spawn: GridCoordinate | null;
  targets: readonly NavigationTargetReport[];
  reachableTargetCount: number;
}

export interface SceneValidationMetrics {
  overlappingAabbs: number;
  outOfBounds: number;
  reachableRequiredTargets: number;
  requiredTargetCount: number;
}

export interface SceneValidationReport {
  valid: boolean;
  issues: readonly SceneValidationIssue[];
  metrics: SceneValidationMetrics;
  navigation: SceneNavigationReport;
}

export interface SceneValidationError extends AppError {
  code: "scene-validation-failed";
  issues: readonly SceneValidationIssue[];
  report: SceneValidationReport;
}

interface Aabb {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface SpatialNode {
  kind: "wall" | "platform" | "prop" | "npc" | "monster" | "treasure" | "exit";
  path: string;
  box: Aabb;
  blocksNavigation: boolean;
}

interface TileState {
  x: number;
  z: number;
}

const DEFAULT_EXIT_CLEARANCE = 1;
const NON_BLOCKING_PROPS = new Set(["flower", "mushroom"]);

function pointBox(x: number, z: number, halfSize: number): Aabb {
  const centerX = x + 0.5;
  const centerZ = z + 0.5;
  return {
    minX: centerX - halfSize,
    minZ: centerZ - halfSize,
    maxX: centerX + halfSize,
    maxZ: centerZ + halfSize,
  };
}

function rectangleBox(x: number, z: number, width: number, depth: number): Aabb {
  return { minX: x, minZ: z, maxX: x + width, maxZ: z + depth };
}

function finite(value: number | undefined): value is number {
  return Number.isFinite(value);
}

function positiveExtent(value: number): number {
  return Math.max(0, value);
}

function wallWidth(width: number): number {
  return Math.max(1, Math.round(width));
}

function nodeIntersects(a: Aabb, b: Aabb): boolean {
  // Touching edges are adjacent, not overlapping. This lets contiguous wall runs pass validation.
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function expanded(box: Aabb, amount: number): Aabb {
  return {
    minX: box.minX - amount,
    minZ: box.minZ - amount,
    maxX: box.maxX + amount,
    maxZ: box.maxZ + amount,
  };
}

function inFloor(box: Aabb, width: number, depth: number): boolean {
  return box.minX >= 0 && box.minZ >= 0 && box.maxX <= width && box.maxZ <= depth;
}

function tileKey(tile: GridCoordinate): string {
  return `${tile.x},${tile.z}`;
}

function coordinateInside(tile: GridCoordinate, width: number, depth: number): boolean {
  return (
    finite(tile.x) &&
    finite(tile.z) &&
    tile.x >= 0 &&
    tile.z >= 0 &&
    tile.x < width &&
    tile.z < depth
  );
}

function toTile(coordinate: GridCoordinate): TileState {
  return { x: Math.floor(coordinate.x), z: Math.floor(coordinate.z) };
}

function addIssue(
  issues: SceneValidationIssue[],
  code: SceneValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function sceneNodes(scene: SceneGraph): SpatialNode[] {
  const nodes: SpatialNode[] = [];
  for (const [index, wall] of scene.walls.entries()) {
    const width = positiveExtent(wallWidth(wall.width));
    nodes.push({
      kind: "wall",
      path: `walls[${index}]`,
      box: rectangleBox(wall.x, wall.z, width, 1),
      blocksNavigation: true,
    });
  }
  for (const [index, platform] of scene.platforms.entries()) {
    nodes.push({
      kind: "platform",
      path: `platforms[${index}]`,
      box: rectangleBox(
        platform.x,
        platform.z,
        positiveExtent(platform.width),
        positiveExtent(platform.depth),
      ),
      // Raised platforms leave the floor grid open beneath them in this v1 validator.
      blocksNavigation: platform.y <= 0,
    });
  }
  for (const [index, prop] of scene.props.entries()) {
    const scale = finite(prop.scale) && prop.scale > 0 ? prop.scale : 1;
    nodes.push({
      kind: "prop",
      path: `props[${index}]`,
      box: pointBox(prop.x, prop.z, 0.25 * scale),
      blocksNavigation: !NON_BLOCKING_PROPS.has(prop.kind),
    });
  }
  for (const [index, npc] of scene.npcs.entries()) {
    nodes.push({
      kind: "npc",
      path: `npcs[${index}]`,
      box: pointBox(npc.x, npc.z, 0.3),
      blocksNavigation: false,
    });
  }
  for (const [index, monster] of scene.monsters.entries()) {
    const size = finite(monster.size) && monster.size > 0 ? monster.size : 1;
    nodes.push({
      kind: "monster",
      path: `monsters[${index}]`,
      box: pointBox(monster.x, monster.z, 0.3 * size),
      blocksNavigation: false,
    });
  }
  for (const [index, treasure] of scene.treasures.entries()) {
    nodes.push({
      kind: "treasure",
      path: `treasures[${index}]`,
      box: pointBox(treasure.x, treasure.z, 0.3),
      blocksNavigation: false,
    });
  }
  for (const [index, exit] of scene.exits.entries()) {
    nodes.push({
      kind: "exit",
      path: `exits[${index}]`,
      box: pointBox(exit.x, exit.z, 0.25),
      blocksNavigation: false,
    });
  }
  return nodes;
}

function markBlockedCells(blocked: Set<string>, box: Aabb, width: number, depth: number): void {
  const minX = Math.max(0, Math.floor(box.minX));
  const maxX = Math.min(Math.ceil(width) - 1, Math.ceil(box.maxX) - 1);
  const minZ = Math.max(0, Math.floor(box.minZ));
  const maxZ = Math.min(Math.ceil(depth) - 1, Math.ceil(box.maxZ) - 1);
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      const cell = rectangleBox(x, z, 1, 1);
      if (nodeIntersects(box, cell)) blocked.add(`${x},${z}`);
    }
  }
}

function routeFrom(
  start: TileState,
  target: TileState,
  blocked: ReadonlySet<string>,
  width: number,
  depth: number,
): readonly GridCoordinate[] {
  const startKey = tileKey(start);
  const targetKey = tileKey(target);
  if (blocked.has(startKey) || blocked.has(targetKey)) return [];
  if (startKey === targetKey) return [{ x: start.x, z: start.z }];

  const queue: TileState[] = [start];
  const previous = new Map<string, string>();
  const seen = new Set<string>([startKey]);
  const directions: readonly TileState[] = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const direction of directions) {
      const next = { x: current.x + direction.x, z: current.z + direction.z };
      if (next.x < 0 || next.z < 0 || next.x >= width || next.z >= depth) continue;
      const nextKey = tileKey(next);
      if (blocked.has(nextKey) || seen.has(nextKey)) continue;
      seen.add(nextKey);
      previous.set(nextKey, tileKey(current));
      queue.push(next);
      if (nextKey === targetKey) {
        const route: GridCoordinate[] = [next];
        let cursor = nextKey;
        while (cursor !== startKey) {
          const parent = previous.get(cursor);
          if (parent === undefined) return [];
          const [x = 0, z = 0] = parent.split(",").map(Number);
          route.unshift({ x, z });
          cursor = parent;
        }
        return route;
      }
    }
  }
  return [];
}

function normalizeInput(
  sceneOrInput: SceneGraph | SceneValidationInput,
  options: SceneValidationOptions | undefined,
): { scene: SceneGraph; options: SceneValidationOptions } {
  if ("scene" in sceneOrInput) {
    const { scene, ...inputOptions } = sceneOrInput;
    return { scene, options: inputOptions };
  }
  return { scene: sceneOrInput, options: options ?? {} };
}

/**
 * Runs the pure Gate 3 checks and always returns a complete deterministic report.
 * Geometry failures are surfaced by `validateScene`; use this function when a coordinator needs
 * the report even when it is invalid.
 */
export function inspectScene(
  sceneOrInput: SceneGraph | SceneValidationInput,
  options?: SceneValidationOptions,
): SceneValidationReport {
  const input = normalizeInput(sceneOrInput, options);
  const { scene } = input;
  const validationOptions = input.options;
  const issues: SceneValidationIssue[] = [];
  const floor = scene.floor;

  if (!finite(floor.width) || !finite(floor.depth) || floor.width <= 0 || floor.depth <= 0) {
    addIssue(
      issues,
      "floor-invalid",
      "floor",
      "Floor width and depth must be finite and positive.",
    );
  }

  const width = finite(floor.width) && floor.width > 0 ? floor.width : 0;
  const depth = finite(floor.depth) && floor.depth > 0 ? floor.depth : 0;
  const nodes = sceneNodes(scene);
  let outOfBounds = 0;
  for (const node of nodes) {
    if (!inFloor(node.box, width, depth)) {
      outOfBounds += 1;
      addIssue(
        issues,
        "scene-out-of-bounds",
        node.path,
        `${node.path} lies outside the ${width}×${depth} floor bounds.`,
      );
    }
  }

  let overlappingAabbs = 0;
  for (let index = 0; index < nodes.length; index += 1) {
    const first = nodes[index];
    if (first === undefined) continue;
    for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
      const second = nodes[otherIndex];
      if (second === undefined || !nodeIntersects(first.box, second.box)) continue;
      overlappingAabbs += 1;
      addIssue(
        issues,
        "scene-overlap",
        `${first.path},${second.path}`,
        `${first.path} overlaps ${second.path}.`,
      );
    }
  }

  const clearance =
    finite(validationOptions.exitClearance) && (validationOptions.exitClearance ?? 0) >= 0
      ? (validationOptions.exitClearance ?? DEFAULT_EXIT_CLEARANCE)
      : DEFAULT_EXIT_CLEARANCE;
  for (const exit of nodes.filter((node) => node.kind === "exit")) {
    const exitClearance = expanded(exit.box, clearance);
    for (const obstacle of nodes) {
      if (obstacle.kind === "exit" || !nodeIntersects(exitClearance, obstacle.box)) continue;
      addIssue(
        issues,
        "exit-clearance",
        exit.path,
        `${exit.path} does not have ${clearance} tile(s) of clearance from ${obstacle.path}.`,
      );
    }
  }

  const targetCoordinates =
    validationOptions.requiredTargets ??
    validationOptions.targetCoordinates ??
    validationOptions.targets ??
    scene.exits.map((exit) => ({ x: exit.x, z: exit.z }));
  const spawn = validationOptions.spawn;
  const navigationTargets: NavigationTargetReport[] = [];
  const navigation: SceneNavigationReport = {
    spawn: spawn === undefined ? null : toTile(spawn),
    targets: navigationTargets,
    reachableTargetCount: 0,
  };

  if (spawn !== undefined) {
    if (!coordinateInside(spawn, width, depth)) {
      addIssue(
        issues,
        "navigation-coordinate-invalid",
        "spawn",
        "The navigation spawn coordinate is outside the floor bounds.",
      );
    }
    const blocked = new Set<string>();
    for (const node of nodes) {
      if (node.blocksNavigation) markBlockedCells(blocked, node.box, width, depth);
    }
    const spawnTile = toTile(spawn);
    if (coordinateInside(spawnTile, width, depth) && blocked.has(tileKey(spawnTile))) {
      addIssue(
        issues,
        "navigation-spawn-blocked",
        "spawn",
        "The navigation spawn tile is blocked.",
      );
    }
    for (const target of targetCoordinates) {
      const targetTile = toTile(target);
      const validCoordinate = coordinateInside(target, width, depth);
      if (!validCoordinate) {
        addIssue(
          issues,
          "navigation-coordinate-invalid",
          "requiredTargets",
          `Required navigation target (${target.x}, ${target.z}) is outside the floor bounds.`,
        );
      }
      const route =
        validCoordinate && coordinateInside(spawnTile, width, depth)
          ? routeFrom(spawnTile, targetTile, blocked, Math.ceil(width), Math.ceil(depth))
          : [];
      const reachable = route.length > 0;
      navigationTargets.push({ target, reachable, route });
      if (reachable) {
        navigation.reachableTargetCount += 1;
      } else {
        addIssue(
          issues,
          "navigation-unreachable",
          "requiredTargets",
          `No walkable grid route exists from spawn to (${target.x}, ${target.z}).`,
        );
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    metrics: {
      overlappingAabbs,
      outOfBounds,
      reachableRequiredTargets: navigation.reachableTargetCount,
      requiredTargetCount: targetCoordinates.length,
    },
    navigation,
  };
}

/** Validates a scene and turns every failed check into a typed Result error. */
export function validateScene(
  scene: SceneGraph,
  options?: SceneValidationOptions,
): Result<SceneValidationReport, SceneValidationError>;
export function validateScene(
  input: SceneValidationInput,
): Result<SceneValidationReport, SceneValidationError>;
export function validateScene(
  sceneOrInput: SceneGraph | SceneValidationInput,
  options?: SceneValidationOptions,
): Result<SceneValidationReport, SceneValidationError> {
  const report = inspectScene(sceneOrInput, options);
  if (report.valid) return ok(report);
  return {
    ok: false,
    error: {
      code: "scene-validation-failed",
      message: `Scene validation failed with ${report.issues.length} issue(s).`,
      hint: "Move objects inside the floor, separate overlapping objects, and open a route to every target.",
      issues: report.issues,
      report,
    },
  };
}

/** Alias for callers that prefer a graph-specific verb. */
export const validateSceneGraph = validateScene;
