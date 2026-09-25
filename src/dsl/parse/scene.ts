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
import {
  type ChildNode,
  childrenOf,
  createDialect,
  dslError,
  failWith,
  parseRoot,
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

/** Walk a parsed `Scene` root into the engine's SceneGraph. */
export function toSceneGraph(root: ElementNode): Result<SceneGraph, DslError> {
  const issues: OpenUIError[] = [];
  const head = HEAD.safeParse(root.props);
  if (!head.success) {
    return failWith(
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
  const floor = readFloor(children, issues);
  if (floor === null) {
    return failWith(
      issues.length > 0
        ? invalidProps(issues)
        : dslError({
            code: "dsl-missing-floor",
            message: "The scene has no usable Floor, so there is nothing to stand on.",
            hint: `Add exactly one Floor(width, depth, tile) with width and depth between ${LIMITS.floor.min} and ${LIMITS.floor.max}, and list it in the Scene children.`,
          }),
    );
  }

  const { buckets, duplicateIds } = collect(children, floor, issues);
  if (issues.length > 0) return failWith(invalidProps(issues));
  if (duplicateIds.length > 0) {
    return failWith(
      dslError({
        code: "dsl-duplicate-id",
        message: `These ids are used more than once: ${duplicateIds.join(", ")}.`,
        hint: "Give every NPC, Monster, Treasure, Trigger and Quest its own unique ascii snake_case id.",
      }),
    );
  }

  return ok({
    name: clampText(head.data.name, LIMITS.text.name),
    biome: head.data.biome,
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
  });
}

/** Parse one `Scene` program (fences, prose and <think> blocks tolerated). */
export function parseScene(source: string): Result<SceneGraph, DslError> {
  const root = parseRoot(dialect, source);
  return root.ok ? toSceneGraph(root.value) : root;
}
