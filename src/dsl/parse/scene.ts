// Scene program → SceneGraph. Every number is clamped, every array truncated and every id
// snake_cased, so a hallucinated floor can still be walked on. The per-component readers live in
// sceneTerrain.ts (ground) and sceneEntities.ts (everything that acts).

import type { ElementNode, OpenUIError } from "@openuidev/lang-core";
import type { SceneContract } from "@shared/gameplay";
import { ok, type Result } from "@shared/result";
import type {
  ExitSpec,
  FloorSpec,
  LightSpec,
  MonsterSpec,
  NpcSpec,
  PatchSpec,
  PlatformSpec,
  PropSpec,
  QuestSpec,
  SceneGraph,
  SkySpec,
  TreasureSpec,
  TriggerSpec,
  WallSpec,
} from "@shared/world";
import { sceneLibrary } from "../libraries";
import { clampText, LIMITS, truncate } from "../limits";
import { SCENE_PROPS } from "../schemas/scene";
import type { DslError } from "../types";
import { mergeDslErrors } from "./complaints";
import {
  type ChildNode,
  childrenOf,
  createDialect,
  dslError,
  failWith,
  readProgram,
} from "./program";
import {
  readContract,
  readExit,
  readLight,
  readMonster,
  readNpc,
  readQuest,
  readSky,
  readTreasure,
  readTrigger,
} from "./sceneEntities";
import { createSceneScope, type SceneScope } from "./sceneScope";
import { readFloor, readPatch, readPlatform, readProp, readWall } from "./sceneTerrain";

const dialect = createDialect(sceneLibrary);

const HEAD = SCENE_PROPS.Scene.pick({ name: true, biome: true });

const invalidProps = (issues: OpenUIError[]): DslError =>
  dslError({
    code: "dsl-invalid-props",
    message: `${issues.length} statement(s) have arguments the engine cannot use.`,
    hint: "Resend the whole program with those statements corrected.",
    errors: issues,
  });

interface Buckets {
  contracts: SceneContract[];
  patches: PatchSpec[];
  platforms: PlatformSpec[];
  walls: WallSpec[];
  props: PropSpec[];
  npcs: NpcSpec[];
  monsters: MonsterSpec[];
  treasures: TreasureSpec[];
  exits: ExitSpec[];
  lights: LightSpec[];
  skies: SkySpec[];
  triggers: TriggerSpec[];
  quests: QuestSpec[];
}

const emptyBuckets = (): Buckets => ({
  contracts: [],
  patches: [],
  platforms: [],
  walls: [],
  props: [],
  npcs: [],
  monsters: [],
  treasures: [],
  exits: [],
  lights: [],
  skies: [],
  triggers: [],
  quests: [],
});

/** Append `spec` to `bucket` unless the reader rejected the statement. */
function push<T>(bucket: T[], spec: T | null): void {
  if (spec !== null) bucket.push(spec);
}

function fill(out: Buckets, child: ChildNode, scope: SceneScope): void {
  switch (child.typeName) {
    case "Contract":
      push(out.contracts, readContract(child, scope.issues));
      break;
    case "Patch":
      push(out.patches, readPatch(child, scope));
      break;
    case "Platform":
      push(out.platforms, readPlatform(child, scope));
      break;
    case "Wall":
      push(out.walls, readWall(child, scope));
      break;
    case "Prop":
      push(out.props, readProp(child, scope));
      break;
    case "NPC":
      push(out.npcs, readNpc(child, scope));
      break;
    case "Monster":
      push(out.monsters, readMonster(child, scope));
      break;
    case "Treasure":
      push(out.treasures, readTreasure(child, scope));
      break;
    case "Exit":
      push(out.exits, readExit(child, scope));
      break;
    case "Light":
      push(out.lights, readLight(child, scope));
      break;
    case "Sky":
      push(out.skies, readSky(child, scope));
      break;
    case "Trigger":
      push(out.triggers, readTrigger(child, scope));
      break;
    case "Quest":
      push(out.quests, readQuest(child, scope));
      break;
    default:
      break;
  }
}

function collect(
  children: ChildNode[],
  floor: FloorSpec,
  issues: OpenUIError[],
): { buckets: Buckets; duplicateIds: string[] } {
  const out = emptyBuckets();
  const scope = createSceneScope(floor, issues);
  for (const child of children) fill(out, child, scope);
  return { buckets: out, duplicateIds: scope.duplicates() };
}

/** Where the other statements' arguments are still checked when there is no Floor to stand on. */
const STAND_IN_FLOOR: FloorSpec = {
  width: LIMITS.floor.max,
  depth: LIMITS.floor.max,
  tile: "grass",
};

function graphOf(
  head: { name: string; biome: SceneGraph["biome"] },
  floor: FloorSpec,
  buckets: Buckets,
): SceneGraph {
  return {
    name: clampText(head.name, LIMITS.text.name),
    biome: head.biome,
    contract: buckets.contracts[0] ?? null,
    floor,
    patches: truncate(buckets.patches, LIMITS.maxPatches),
    platforms: truncate(buckets.platforms, LIMITS.maxPlatforms),
    walls: truncate(buckets.walls, LIMITS.maxWalls),
    props: truncate(buckets.props, LIMITS.maxProps),
    npcs: truncate(buckets.npcs, LIMITS.maxNpcs),
    monsters: truncate(buckets.monsters, LIMITS.maxMonsters),
    treasures: truncate(buckets.treasures, LIMITS.maxTreasures),
    exits: truncate(buckets.exits, LIMITS.maxExits),
    lights: truncate(buckets.lights, LIMITS.maxLights),
    sky: buckets.skies[0] ?? null,
    triggers: truncate(buckets.triggers, LIMITS.maxTriggers),
    quests: truncate(buckets.quests, LIMITS.maxQuests),
  };
}

/**
 * Walk a parsed `Scene` root as far as it goes: every statement is checked even when the head or
 * the Floor is wrong, so one round names every mistake. `refused` gains the components whose
 * statements were sent back; the graph is null when there is no head or no floor.
 */
function readRoot(
  root: ElementNode,
  refused: Set<string>,
): { graph: SceneGraph | null; parts: DslError[]; written: Map<string, number> } {
  const parts: DslError[] = [];
  const issues: OpenUIError[] = [];
  const head = HEAD.safeParse(root.props);
  if (!head.success) {
    parts.push(
      dslError({
        code: "dsl-invalid-props",
        message: `Scene(name, biome, children) is wrong: ${head.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
        hint: 'Write root = Scene("<floor name>", "<biome>", [ ... ]) with a biome from the list.',
      }),
    );
  }

  const children = childrenOf(root);
  const written = new Map<string, number>();
  for (const child of children) written.set(child.typeName, (written.get(child.typeName) ?? 0) + 1);
  const floor = readFloor(children, issues);
  // A Floor refused for its arguments is already a complaint; asking for one would add a second.
  if (floor === null && issues.length === 0 && !refused.has("Floor")) {
    parts.push(
      dslError({
        code: "dsl-missing-floor",
        message: "The scene has no usable Floor, so there is nothing to stand on.",
        hint: `Add exactly one Floor(width, depth, tile) with width and depth between ${LIMITS.floor.min} and ${LIMITS.floor.max}, and list it in the Scene children.`,
      }),
    );
  }

  const { buckets, duplicateIds } = collect(children, floor ?? STAND_IN_FLOOR, issues);
  for (const issue of issues) if (issue.component !== undefined) refused.add(issue.component);
  if (issues.length > 0) parts.push(invalidProps(issues));
  if (duplicateIds.length > 0) {
    parts.push(
      dslError({
        code: "dsl-duplicate-id",
        message: `These ids are used more than once: ${duplicateIds.join(", ")}.`,
        hint: "Give every NPC, Monster, Treasure, Trigger and Quest its own unique ascii snake_case id.",
      }),
    );
  }
  const graph = head.success && floor !== null ? graphOf(head.data, floor, buckets) : null;
  return { graph, parts, written };
}

const unreadable = (): DslError =>
  dslError({
    code: "dsl-parse",
    message: "No Scene program could be read from the answer.",
    hint: 'End with root = Scene("<floor name>", "<biome>", [ ... ]).',
  });

/** Walk a parsed `Scene` root into the engine's SceneGraph. */
export function toSceneGraph(root: ElementNode): Result<SceneGraph, DslError> {
  const read = readRoot(root, new Set());
  const error = mergeDslErrors(read.parts);
  if (error !== null) return failWith(error);
  return read.graph === null ? failWith(unreadable()) : ok(read.graph);
}

/** A Scene program read as far as it goes, with everything wrong with it (null: nothing). */
export interface SceneReading {
  /** What could be read. With an error beside it, it is only for further checks — never kept. */
  graph: SceneGraph | null;
  error: DslError | null;
  /** Components (public names) with a statement that was sent back or never used. */
  refused: ReadonlySet<string>;
  /** The root's children by component as the model wrote them, readable or not. */
  written: ReadonlyMap<string, number>;
}

/** One Scene program, every kind of mistake in it at once (see `parseOrigin` for the origin's). */
export function readScene(source: string): SceneReading {
  const program = readProgram(dialect, source);
  const refused = new Set(program.refused);
  if (program.root === null) {
    return { graph: null, error: program.error, refused, written: new Map() };
  }
  const read = readRoot(program.root, refused);
  const error = mergeDslErrors([program.error, ...read.parts]);
  return { graph: read.graph, error, refused, written: read.written };
}

/** Parse one `Scene` program (fences, prose and <think> blocks tolerated). */
export function parseScene(source: string): Result<SceneGraph, DslError> {
  const read = readScene(source);
  if (read.error !== null) return failWith(read.error);
  return read.graph === null ? failWith(unreadable()) : ok(read.graph);
}
