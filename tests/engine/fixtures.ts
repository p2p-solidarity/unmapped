// Minimal SceneGraph builders for the engine's pure-helper tests. Test-only (Rule 2).

import type {
  ExitSpec,
  LightSpec,
  MonsterSpec,
  NpcSpec,
  PatchSpec,
  PlatformSpec,
  PropSpec,
  SceneGraph,
  Tile,
  TreasureSpec,
  TriggerSpec,
  WallSpec,
} from "@shared/world";

export function makeScene(overrides: Partial<SceneGraph> = {}): SceneGraph {
  return {
    name: "test-floor",
    biome: "meadow",
    floor: { width: 8, depth: 8, tile: "grass" },
    patches: [],
    platforms: [],
    walls: [],
    props: [],
    npcs: [],
    monsters: [],
    treasures: [],
    exits: [],
    lights: [],
    sky: null,
    triggers: [],
    quests: [],
    ...overrides,
    contract: overrides.contract ?? null,
  };
}

export function wall(x: number, z: number, width = 1, height = 2): WallSpec {
  return { x, z, width, height, material: "stone" };
}

export function prop(kind: PropSpec["kind"], x: number, z: number, scale = 1): PropSpec {
  return { kind, x, z, scale, tint: null, dynamic: false };
}

export function npc(
  id: string,
  x: number,
  z: number,
  name = id,
  overrides: Partial<NpcSpec> = {},
): NpcSpec {
  return {
    id,
    name,
    x,
    z,
    role: "merchant",
    mood: "calm",
    color: "#aabbcc",
    body: "slim",
    hat: "none",
    held: "none",
    accent: "#ffdd88",
    ...overrides,
  };
}

export function monster(
  id: string,
  x: number,
  z: number,
  kind: MonsterSpec["kind"] = "slime",
  level = 1,
  overrides: Partial<MonsterSpec> = {},
): MonsterSpec {
  return { id, kind, x, z, level, weakness: "puns", size: 1, color: null, ...overrides };
}

export function treasure(id: string, x: number, z: number): TreasureSpec {
  return { id, x, z, loot: ["ore"] };
}

export function exit(x: number, z: number, to = "Second Floor"): ExitSpec {
  return { x, z, to, targetSceneId: null };
}

export function trigger(id: string, x: number, z: number, radius = 1.5): TriggerSpec {
  return { id, x, z, radius, event: "bell" };
}

export function patch(x: number, z: number, width: number, depth: number, tile: Tile): PatchSpec {
  return { x, z, width, depth, tile };
}

export function platform(
  x: number,
  z: number,
  overrides: Partial<PlatformSpec> = {},
): PlatformSpec {
  return {
    x,
    z,
    width: 2,
    depth: 2,
    y: 1,
    height: 0.4,
    tile: "stone",
    bounce: false,
    ...overrides,
  };
}

export function pointLight(
  intensity: number,
  x: number | null = null,
  z: number | null = null,
  color = "#ffffff",
): LightSpec {
  return { kind: "point", color, intensity, x, z };
}
