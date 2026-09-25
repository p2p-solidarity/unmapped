// SceneGraph → OpenUI Lang text. The inverse of parse/scene.ts: the visual platform editor bakes
// its drafts into `world.oui` with this, so the output must be a program the parser walks back
// into exactly the same graph — `parseScene(serializeScene(g))` deep-equals `g`.
//
// Deterministic by construction: statements come out in one fixed order (root, floor, sky,
// lights, patches, platforms, walls, props, npcs, monsters, treasures, exits, triggers, quests),
// ids are reused where the entity has one, and a trailing argument that equals the component's
// default is left out so a hand-edited file stays short.

import type { SceneContract } from "@shared/gameplay";
import type {
  ExitSpec,
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
import { accentFor, ROLE_LOOK } from "./schemas/looks";

const IDENTIFIER = /^[a-z_][a-zA-Z0-9_]*$/;

const str = (value: string): string => JSON.stringify(value);
const num = (value: number): string => String(value);
const list = (values: readonly string[]): string => `[${values.map(str).join(", ")}]`;

/** A trailing argument, and whether it may be dropped because it equals the default. */
interface Tail {
  text: string;
  isDefault: boolean;
}

const tail = (text: string, isDefault: boolean): Tail => ({ text, isDefault });

function call(name: string, args: readonly string[], optional: readonly Tail[] = []): string {
  const kept = [...optional];
  while (kept.at(-1)?.isDefault === true) kept.pop();
  return `${name}(${[...args, ...kept.map((entry) => entry.text)].join(", ")})`;
}

interface Statement {
  id: string;
  text: string;
}

/** Hands out statement names: an entity's own id when it can be one, else `<base><n>`. */
function createNames(): { keep(id: string, base: string): string; next(base: string): string } {
  const used = new Set<string>(["root"]);
  const next = (base: string): string => {
    let n = 1;
    while (used.has(`${base}${n}`)) n += 1;
    used.add(`${base}${n}`);
    return `${base}${n}`;
  };
  return {
    next,
    keep: (id, base) => {
      if (!IDENTIFIER.test(id) || used.has(id)) return next(base);
      used.add(id);
      return id;
    },
  };
}

const skyLine = (sky: SkySpec): string =>
  call("Sky", [str(sky.color), str(sky.fog), num(sky.fogDensity)]);

/** A light stands somewhere only when it is a placed point light; ambient and sun never do. */
function lightLine(light: LightSpec): string {
  const placed = light.x !== null && light.z !== null;
  return call(
    "Light",
    [str(light.kind), str(light.color), num(light.intensity)],
    placed
      ? [tail(num(light.x ?? 0), false), tail(num(light.z ?? 0), false)]
      : [tail("null", true), tail("null", true)],
  );
}

const patchLine = (patch: PatchSpec): string =>
  call("Patch", [num(patch.x), num(patch.z), num(patch.width), num(patch.depth), str(patch.tile)]);

const platformLine = (platform: PlatformSpec): string =>
  call(
    "Platform",
    [
      num(platform.x),
      num(platform.z),
      num(platform.width),
      num(platform.depth),
      num(platform.y),
      num(platform.height),
      str(platform.tile),
    ],
    [tail(platform.bounce ? "true" : "false", !platform.bounce)],
  );

const wallLine = (wall: WallSpec): string =>
  call("Wall", [num(wall.x), num(wall.z), num(wall.width), num(wall.height), str(wall.material)]);

const propLine = (prop: PropSpec): string =>
  call(
    "Prop",
    [str(prop.kind), num(prop.x), num(prop.z)],
    [
      tail(num(prop.scale), prop.scale === 1),
      tail(prop.tint === null ? "null" : str(prop.tint), prop.tint === null),
    ],
  );

const npcLine = (npc: NpcSpec): string => {
  const look = ROLE_LOOK[npc.role];
  return call(
    "NPC",
    [
      str(npc.id),
      str(npc.name),
      num(npc.x),
      num(npc.z),
      str(npc.role),
      str(npc.mood),
      str(npc.color),
    ],
    [
      tail(str(npc.body), npc.body === look.body),
      tail(str(npc.hat), npc.hat === look.hat),
      tail(str(npc.held), npc.held === look.held),
      tail(str(npc.accent), npc.accent === accentFor(npc.color)),
    ],
  );
};

const monsterLine = (monster: MonsterSpec): string =>
  call(
    "Monster",
    [
      str(monster.id),
      str(monster.kind),
      num(monster.x),
      num(monster.z),
      num(monster.level),
      str(monster.weakness),
    ],
    [
      tail(num(monster.size), monster.size === 1),
      tail(monster.color === null ? "null" : str(monster.color), monster.color === null),
    ],
  );

const treasureLine = (treasure: TreasureSpec): string =>
  call("Treasure", [str(treasure.id), num(treasure.x), num(treasure.z), list(treasure.loot)]);

const exitLine = (exit: ExitSpec): string =>
  call(
    "Exit",
    [num(exit.x), num(exit.z), str(exit.to)],
    [
      tail(
        exit.targetSceneId === null ? "null" : str(exit.targetSceneId),
        exit.targetSceneId === null,
      ),
    ],
  );

const contractLine = (contract: SceneContract): string =>
  call("Contract", [
    str(contract.sceneId),
    str(contract.kit),
    list(contract.requiresFlags),
    list(contract.requiresItems),
    str(contract.inventoryPolicy),
    list(contract.grantsFlags),
    contract.terminal ? "true" : "false",
  ]);

const triggerLine = (trigger: TriggerSpec): string =>
  call("Trigger", [
    str(trigger.id),
    num(trigger.x),
    num(trigger.z),
    num(trigger.radius),
    str(trigger.event),
  ]);

const questLine = (quest: QuestSpec): string => call("Quest", [str(quest.id), str(quest.text)]);

/** Every statement of the program except the root, in the order they are written out. */
function statements(graph: SceneGraph): Statement[] {
  const names = createNames();
  const out: Statement[] = [];
  const add = (id: string, text: string): void => {
    out.push({ id, text });
  };

  const { floor } = graph;
  if (graph.contract !== null) add(names.next("contract"), contractLine(graph.contract));
  add(names.next("floor"), call("Floor", [num(floor.width), num(floor.depth), str(floor.tile)]));
  if (graph.sky !== null) add(names.next("sky"), skyLine(graph.sky));
  for (const light of graph.lights) add(names.next("light"), lightLine(light));
  for (const patch of graph.patches) add(names.next("patch"), patchLine(patch));
  for (const platform of graph.platforms) add(names.next("platform"), platformLine(platform));
  for (const wall of graph.walls) add(names.next("wall"), wallLine(wall));
  for (const prop of graph.props) add(names.next("prop"), propLine(prop));
  for (const npc of graph.npcs) add(names.keep(npc.id, "npc"), npcLine(npc));
  for (const monster of graph.monsters)
    add(names.keep(monster.id, "monster"), monsterLine(monster));
  for (const treasure of graph.treasures) {
    add(names.keep(treasure.id, "treasure"), treasureLine(treasure));
  }
  for (const exit of graph.exits) add(names.next("exit"), exitLine(exit));
  for (const trigger of graph.triggers)
    add(names.keep(trigger.id, "trigger"), triggerLine(trigger));
  for (const quest of graph.quests) add(names.keep(quest.id, "quest"), questLine(quest));
  return out;
}

/** A SceneGraph as an OpenUI Lang `Scene` program the parser reads back into the same graph. */
export function serializeScene(graph: SceneGraph): string {
  const body = statements(graph);
  const root = `root = ${call("Scene", [
    str(graph.name),
    str(graph.biome),
    `[${body.map((statement) => statement.id).join(", ")}]`,
  ])}`;
  return [root, ...body.map((statement) => `${statement.id} = ${statement.text}`)].join("\n");
}
