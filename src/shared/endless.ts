// Endless depths: the floors that follow a finished cartridge.
//
// When the author's scenes are done, the run keeps going downward. Each floor is derived from three
// things only — the save's endless seed, the depth, and the cartridge's own authored scenes — so the
// same save always regenerates the same floor and nothing generated is ever written into the
// immutable cartridge (Rule 9). Pure and deterministic: no model, no clock, no Math.random.
//
// Rule 2 holds for generated content too. Every name, loot line, weakness and colour on a generated
// floor is lifted from what the author already wrote; the generator decides only where things stand,
// how many there are and how strong they are. A cartridge with no monsters gets no monsters.

import type { GameplayKitId } from "./gameplay";
import type {
  LightSpec,
  MonsterSpec,
  PatchSpec,
  PlatformSpec,
  PropSpec,
  SceneGraph,
  TreasureSpec,
  WallSpec,
} from "./world";

export interface EndlessState {
  /** Fixed for the life of the save; floors differ by depth, not by re-rolling. */
  seed: number;
  /** 0 = still in the authored scenes; 1 is the first generated floor below the ending. */
  depth: number;
}

export const ENDLESS_OBJECTIVES = ["clear", "loot", "reach"] as const;
export type EndlessObjective = (typeof ENDLESS_OBJECTIVES)[number];

/** Quest ids carry the objective so the scene program itself says what the floor asks for. */
export const ENDLESS_QUEST_PREFIX = "endless_";

export interface AuthoredScene {
  sceneId: string;
  graph: SceneGraph;
}

export interface EndlessFloorInput {
  /** Authored scenes in scene-plan order. */
  scenes: readonly AuthoredScene[];
  seed: number;
  depth: number;
  /** The cartridge declares Combat; without it monsters would stand around unkillable. */
  combat: boolean;
  /** Player-facing objective line per kind, supplied by the UI layer in its language. */
  objectiveText: Record<EndlessObjective, string>;
}

export interface EndlessFloor {
  graph: SceneGraph;
  objective: EndlessObjective;
  /** The authored scene whose contract (kit and capability context) this floor plays under. */
  template: AuthoredScene;
}

/** A kit you cannot walk in cannot host a floor you have to cross. */
const STATIC_KITS: ReadonlySet<GameplayKitId> = new Set<GameplayKitId>(["vn_fixed@1"]);

/** The last authored scene the player can move in, which is what the depths continue from. */
export function endlessTemplate(scenes: readonly AuthoredScene[]): AuthoredScene | null {
  for (let index = scenes.length - 1; index >= 0; index -= 1) {
    const scene = scenes[index];
    const kit = scene?.graph.contract?.kit;
    if (scene !== undefined && kit !== undefined && !STATIC_KITS.has(kit)) return scene;
  }
  return null;
}

/** Stable per-save seed from any string, e.g. the instance id. */
export function seedFromText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Next = () => number;
const int = (next: Next, min: number, max: number): number =>
  min + Math.floor(next() * (max - min + 1));
function pick<T>(next: Next, items: readonly T[]): T | undefined {
  return items[Math.floor(next() * items.length)];
}
const key = (x: number, z: number): string => `${x},${z}`;

/** Tiles reachable from `from` on a grid where `blocked` tiles cannot be entered. */
function reachable(
  width: number,
  depth: number,
  blocked: ReadonlySet<string>,
  from: { x: number; z: number },
): Set<string> {
  const seen = new Set([key(from.x, from.z)]);
  const queue = [from];
  while (queue.length > 0) {
    const tile = queue.shift();
    if (tile === undefined) break;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = tile.x + dx;
      const z = tile.z + dz;
      const id = key(x, z);
      if (x < 0 || z < 0 || x >= width || z >= depth || seen.has(id) || blocked.has(id)) continue;
      seen.add(id);
      queue.push({ x, z });
    }
  }
  return seen;
}

function palette(scenes: readonly AuthoredScene[]) {
  const graphs = scenes.map((scene) => scene.graph);
  return {
    props: graphs.flatMap((graph) => graph.props),
    monsters: graphs.flatMap((graph) => graph.monsters),
    loot: [...new Set(graphs.flatMap((graph) => graph.treasures.flatMap((one) => one.loot)))],
    tiles: [...new Set(graphs.flatMap((graph) => graph.patches.map((patch) => patch.tile)))],
    level: Math.max(1, ...graphs.flatMap((graph) => graph.monsters.map((one) => one.level))),
  };
}

/** Cover walls and the exit on an open floor, keeping a guaranteed walk to the exit. */
function arena(
  next: Next,
  width: number,
  depth: number,
  level: number,
  material: WallSpec["material"],
) {
  const cx = Math.floor(width / 2);
  const cz = Math.floor(depth / 2);
  const corners = [
    { x: 1, z: 1 },
    { x: width - 2, z: 1 },
    { x: 1, z: depth - 2 },
    { x: width - 2, z: depth - 2 },
    { x: cx, z: 1 },
    { x: cx, z: depth - 2 },
  ];
  const exit = pick(next, corners) ?? { x: width - 2, z: depth - 2 };
  const clear = (x: number, z: number, radius: number, at: { x: number; z: number }) =>
    Math.abs(x - at.x) + Math.abs(z - at.z) <= radius;
  const blocked = new Set<string>();
  const walls: WallSpec[] = [];
  const wallCount = 3 + Math.min(6, Math.floor(level / 2));
  for (let attempt = 0; attempt < wallCount * 4 && walls.length < wallCount; attempt += 1) {
    const wall: WallSpec = {
      x: int(next, 1, width - 3),
      z: int(next, 1, depth - 2),
      width: int(next, 2, 5),
      height: 2,
      material,
    };
    const tiles = Array.from({ length: wall.width }, (_, i) => [wall.x + i, wall.z] as const);
    if (tiles.some(([x, z]) => x >= width - 1 || clear(x, z, 3, { x: cx, z: cz }))) continue;
    if (tiles.some(([x, z]) => clear(x, z, 2, exit))) continue;
    const trial = new Set([...blocked, ...tiles.map(([x, z]) => key(x, z))]);
    if (!reachable(width, depth, trial, { x: cx, z: cz }).has(key(exit.x, exit.z))) continue;
    walls.push(wall);
    for (const [x, z] of tiles) blocked.add(key(x, z));
  }
  const open = [...reachable(width, depth, blocked, { x: cx, z: cz })]
    .map((id) => id.split(",").map(Number) as [number, number])
    .filter(([x, z]) => !clear(x, z, 2, { x: cx, z: cz }) && !clear(x, z, 1, exit));
  // A prop is solid too: it may only stand where the exit stays reachable around it.
  const solid = (x: number, z: number): boolean => {
    const trial = new Set([...blocked, key(x, z)]);
    if (!reachable(width, depth, trial, { x: cx, z: cz }).has(key(exit.x, exit.z))) return false;
    blocked.add(key(x, z));
    return true;
  };
  return { exit, walls, open, solid, platforms: [] as PlatformSpec[] };
}

/** A side-on course along the spawn row: steps up, a barrier to clear, and the exit at the end. */
function course(next: Next, width: number, depth: number) {
  const row = Math.floor(depth / 2);
  const start = Math.floor(width / 2) + 2;
  const platforms: PlatformSpec[] = [];
  const walls: WallSpec[] = [];
  // Underside elevations; the walking surface is 0.4 higher. The first step and every rise stay
  // under the 2.5D kit's ~1.4-tile jump, and the barrier only follows a step high enough to clear it.
  let y = 0.6;
  for (let x = start; x < width - 4; x += int(next, 2, 3)) {
    if (platforms.length > 0) y = Math.max(0.6, Math.min(2.4, y + (next() < 0.5 ? -0.5 : 0.6)));
    platforms.push({
      x,
      z: row - 1,
      width: 2,
      depth: 3,
      y,
      height: 0.4,
      tile: "wood",
      bounce: false,
    });
    if (y >= 0.8 && walls.length === 0 && x + 2 < width - 4) {
      walls.push({ x: x + 2, z: row, width: 1, height: 2, material: "stone" });
      x += 1;
    }
  }
  const exit = { x: width - 2, z: row };
  const open: [number, number][] = [];
  for (let x = start; x < width - 3; x += 1) {
    if (!walls.some((wall) => wall.x === x)) open.push([x, row]);
  }
  return { exit, walls, platforms, open, solid: () => true };
}

export function endlessFloor(input: EndlessFloorInput): EndlessFloor | null {
  const template = endlessTemplate(input.scenes);
  if (template === null || template.graph.contract === null) return null;
  const next = rng((input.seed ^ Math.imul(input.depth + 1, 0x9e3779b1)) >>> 0);
  const movable = input.scenes.filter((scene) => {
    const kit = scene.graph.contract?.kit;
    return kit !== undefined && !STATIC_KITS.has(kit);
  });
  // Looks rotate through the author's movable scenes; the rules stay the template's.
  const style = (pick(next, movable) ?? template).graph;
  const pool = palette(input.scenes);
  const side = template.graph.contract.kit === "platformer_2_5d@1";

  const grow = Math.min(8, Math.floor(input.depth / 2) * 2);
  const width = side ? 31 : Math.min(31, 17 + grow);
  const depth = side ? 9 : Math.min(31, 17 + grow);
  const layout = side
    ? course(next, width, depth)
    : arena(next, width, depth, input.depth, style.floor.tile);
  const free = [...layout.open];
  const take = (): [number, number] | null => {
    if (free.length === 0) return null;
    return free.splice(Math.floor(next() * free.length), 1)[0] ?? null;
  };

  const props: PropSpec[] = [];
  const propCount = side ? 0 : Math.min(pool.props.length, int(next, 6, 12));
  for (let index = 0; index < propCount; index += 1) {
    const source = pick(next, pool.props);
    const at = take();
    if (source === undefined || at === null) break;
    if (layout.solid(at[0], at[1])) props.push({ ...source, x: at[0], z: at[1], dynamic: false });
  }

  const monsters: MonsterSpec[] = [];
  const count = input.combat ? Math.min(6, 2 + Math.floor((input.depth - 1) / 2)) : 0;
  for (let index = 0; index < count && pool.monsters.length > 0; index += 1) {
    const source = pick(next, pool.monsters);
    const at = take();
    if (source === undefined || at === null) break;
    // One level every two floors: weapon damage does not grow on its own, so a steeper curve
    // turns the depths into a grind rather than a challenge. Every fifth floor has a leader.
    const level = Math.min(
      99,
      pool.level +
        Math.floor((input.depth - 1) / 2) +
        (index === 0 && input.depth % 5 === 0 ? 3 : 0),
    );
    monsters.push({ ...source, id: `foe_${index + 1}`, x: at[0], z: at[1], level });
  }

  const treasures: TreasureSpec[] = [];
  const caches = pool.loot.length === 0 ? 0 : 1 + (input.depth % 3 === 0 ? 1 : 0);
  for (let index = 0; index < caches; index += 1) {
    const at = take();
    if (at === null) break;
    const loot = [...new Set([pick(next, pool.loot), pick(next, pool.loot)])].filter(
      (one): one is string => one !== undefined,
    );
    treasures.push({ id: `cache_${index + 1}`, x: at[0], z: at[1], loot });
  }

  const patches: PatchSpec[] = [];
  for (let index = 0; !side && index < Math.min(3, pool.tiles.length); index += 1) {
    const tile = pick(next, pool.tiles);
    if (tile === undefined) break;
    patches.push({
      x: int(next, 0, width - 5),
      z: int(next, 0, depth - 5),
      width: int(next, 2, 4),
      depth: int(next, 2, 4),
      tile,
    });
  }

  const objectives: EndlessObjective[] = [
    ...(monsters.length > 0 ? (["clear"] as const) : []),
    ...(treasures.length > 0 ? (["loot"] as const) : []),
    "reach",
  ];
  const objective = pick(next, objectives) ?? "reach";
  const cx = Math.floor(width / 2);
  const cz = Math.floor(depth / 2);
  const lights: LightSpec[] = style.lights.map((light) =>
    light.kind === "point" ? { ...light, x: cx, z: cz } : light,
  );

  const graph: SceneGraph = {
    name: `${style.name} · B${input.depth}`.slice(0, 40),
    biome: style.biome,
    contract: {
      ...template.graph.contract,
      sceneId: `endless-${input.depth}`,
      requiresFlags: [],
      requiresItems: [],
      grantsFlags: [],
      terminal: false,
    },
    floor: { width, depth, tile: style.floor.tile },
    patches,
    platforms: layout.platforms,
    walls: layout.walls,
    props,
    npcs: [],
    monsters,
    treasures,
    exits: [{ x: layout.exit.x, z: layout.exit.z, to: `B${input.depth + 1}`, targetSceneId: null }],
    lights,
    sky: style.sky,
    triggers: [],
    quests: [{ id: `${ENDLESS_QUEST_PREFIX}${objective}`, text: input.objectiveText[objective] }],
  };
  return { graph, objective, template };
}

/** The objective a generated floor asks for, read back from its own quest line. */
export function endlessObjectiveOf(graph: SceneGraph): EndlessObjective | null {
  for (const quest of graph.quests) {
    const kind = quest.id.slice(ENDLESS_QUEST_PREFIX.length);
    if (
      quest.id.startsWith(ENDLESS_QUEST_PREFIX) &&
      (ENDLESS_OBJECTIVES as readonly string[]).includes(kind)
    ) {
      return kind as EndlessObjective;
    }
  }
  return null;
}
