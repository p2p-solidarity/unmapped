// Built-in Scene Bases (plan.md §2.1: "Gallery 的候選來源可以是內建 asset pack").
//
// A base is a space, not a level: a floor, a material language, a prop palette, and the two tiles
// the author owns — where you start and where you leave. Everything between them is either the
// base's own composition or, when the cartridge declares `Generate`, the maze generator's.
//
// These are engine content in the same sense as the stock kit tuning: shipped, inspectable, and
// never presented as something a model produced.

import type { Biome, PropKind, Tile } from "./world";

export interface SceneBase {
  id: string;
  name: string;
  tagline: string;
  biome: Biome;
  tile: Tile;
  width: number;
  depth: number;
  /** Props the base composes its space from; the scene builder scatters these on open ground. */
  props: readonly PropKind[];
  /** Where the floor ends, as a fraction of the floor so it scales with the size. */
  exit: { x: number; z: number };
  sky: { color: string; fog: string; fogDensity: number };
  lights: readonly { kind: "ambient" | "sun" | "point"; color: string; intensity: number }[];
}

export const SCENE_BASES: readonly SceneBase[] = [
  {
    id: "reactor_deck",
    name: "反應爐甲板",
    tagline: "巨大機械、熔融光源與環繞核心的金屬平台",
    biome: "cyber_workshop",
    tile: "stone",
    width: 25,
    depth: 25,
    props: ["reactor", "pipe_stack", "machine_gear", "conveyor", "boiler", "crate"],
    exit: { x: 0.92, z: 0.92 },
    sky: { color: "#0d1524", fog: "#101a2c", fogDensity: 0.03 },
    lights: [
      { kind: "ambient", color: "#7fa8d4", intensity: 0.5 },
      { kind: "sun", color: "#ffd9a0", intensity: 1 },
      { kind: "point", color: "#ff6a3d", intensity: 2.2 },
    ],
  },
  {
    id: "drowned_archive",
    name: "沉沒書庫",
    tagline: "淹水的長廊、倒塌的石柱與反光的水道",
    biome: "abyss",
    tile: "water",
    width: 23,
    depth: 23,
    props: ["pillar", "statue", "well", "crate", "torch", "altar"],
    exit: { x: 0.5, z: 0.94 },
    sky: { color: "#08131a", fog: "#0c1d26", fogDensity: 0.05 },
    lights: [
      { kind: "ambient", color: "#5f9ea0", intensity: 0.45 },
      { kind: "point", color: "#9fe8ff", intensity: 1.8 },
    ],
  },
  {
    id: "spore_canopy",
    name: "孢子穹頂",
    tagline: "會發光的菌絲、巨大蕈傘與有機的階地",
    biome: "meadow",
    tile: "grass",
    width: 27,
    depth: 27,
    props: ["mushroom", "tree", "flower", "rock", "well", "signpost"],
    exit: { x: 0.08, z: 0.5 },
    sky: { color: "#101a12", fog: "#16281a", fogDensity: 0.04 },
    lights: [
      { kind: "ambient", color: "#a8e6b0", intensity: 0.55 },
      { kind: "sun", color: "#dff5c0", intensity: 0.9 },
      { kind: "point", color: "#7dff9a", intensity: 1.6 },
    ],
  },
  {
    id: "ember_keep",
    name: "餘燼要塞",
    tagline: "焦黑的城牆、熔岩溝渠與塌陷的塔樓",
    biome: "lava_forge",
    tile: "stone",
    width: 21,
    depth: 21,
    props: ["pillar", "torch", "statue", "crate", "fence", "boiler"],
    exit: { x: 0.92, z: 0.08 },
    sky: { color: "#1a0d0b", fog: "#2a120c", fogDensity: 0.06 },
    lights: [
      { kind: "ambient", color: "#d48f6a", intensity: 0.5 },
      { kind: "point", color: "#ff7a2f", intensity: 2.4 },
    ],
  },
  {
    id: "onsen_terrace",
    name: "湯屋階地",
    tagline: "層層溫泉、木造迴廊與蒸騰的霧",
    biome: "onsen_town",
    tile: "wood",
    width: 23,
    depth: 23,
    props: ["well", "torch", "fence", "signpost", "rock", "flower"],
    exit: { x: 0.5, z: 0.08 },
    sky: { color: "#1c1520", fog: "#2a1f28", fogDensity: 0.07 },
    lights: [
      { kind: "ambient", color: "#e0b7c4", intensity: 0.55 },
      { kind: "point", color: "#ffd0a8", intensity: 1.7 },
    ],
  },
  {
    id: "sky_scaffold",
    name: "浮空棧架",
    tagline: "斷裂的浮島、細長的橋與底下的無盡藍",
    biome: "sky_isle",
    tile: "stone",
    width: 27,
    depth: 19,
    props: ["pillar", "crane", "machine_gear", "fence", "statue", "signpost"],
    exit: { x: 0.94, z: 0.5 },
    sky: { color: "#16243a", fog: "#22384f", fogDensity: 0.02 },
    lights: [
      { kind: "ambient", color: "#bcd8ff", intensity: 0.6 },
      { kind: "sun", color: "#fff2d0", intensity: 1.3 },
    ],
  },
  {
    id: "frost_vault",
    name: "凍結庫房",
    tagline: "結霜的貨架、凍住的機具與踩下去會響的地板",
    biome: "snowfield",
    tile: "snow",
    width: 21,
    depth: 25,
    props: ["crate", "pipe_stack", "boiler", "conveyor", "rock", "torch"],
    exit: { x: 0.08, z: 0.92 },
    sky: { color: "#111a22", fog: "#1b2a36", fogDensity: 0.05 },
    lights: [
      { kind: "ambient", color: "#cfe6f5", intensity: 0.5 },
      { kind: "point", color: "#8fd8ff", intensity: 1.5 },
    ],
  },
  {
    id: "collapsed_keep",
    name: "崩落主堡",
    tagline: "倒塌的廳堂、傾斜的柱列與從破頂灑下的光",
    biome: "ruined_castle",
    tile: "stone",
    width: 25,
    depth: 21,
    props: ["pillar", "statue", "altar", "torch", "rock", "crate"],
    exit: { x: 0.5, z: 0.94 },
    sky: { color: "#14131a", fog: "#221f2b", fogDensity: 0.045 },
    lights: [
      { kind: "ambient", color: "#b9b2cc", intensity: 0.45 },
      { kind: "sun", color: "#ffe9c2", intensity: 1.1 },
    ],
  },
  {
    id: "void_stage",
    name: "虛空舞台",
    tagline: "什麼都沒有的平台，只有邊界和你",
    biome: "abyss",
    tile: "void",
    width: 19,
    depth: 19,
    props: ["pillar", "altar", "statue", "torch", "rock", "crate"],
    exit: { x: 0.92, z: 0.5 },
    sky: { color: "#07070c", fog: "#0c0c14", fogDensity: 0.08 },
    lights: [{ kind: "ambient", color: "#8f8fb0", intensity: 0.4 }],
  },
];

// ── Variants ─────────────────────────────────────────────────────────────────────────────────
//
// The four entries above are archetypes, not the whole catalogue. Rolling the dice varies the size,
// the ground, the prop mix and where the exit sits, so the gallery is a supply of spaces rather
// than four fixed rooms (plan.md §2.1: the dice swaps the candidate set).

const GROUND: Record<string, readonly Tile[]> = {
  reactor_deck: ["stone", "wood", "sand"],
  drowned_archive: ["water", "stone", "snow"],
  spore_canopy: ["grass", "sand", "stone"],
  ember_keep: ["stone", "lava", "sand"],
  onsen_terrace: ["wood", "stone", "water"],
  sky_scaffold: ["stone", "wood", "void"],
  frost_vault: ["snow", "stone", "wood"],
  collapsed_keep: ["stone", "sand", "grass"],
  void_stage: ["void", "stone", "snow"],
};

/** Corners and edges an exit can sit at, as fractions of the floor. */
const EXITS: readonly { x: number; z: number }[] = [
  { x: 0.92, z: 0.92 },
  { x: 0.08, z: 0.92 },
  { x: 0.92, z: 0.08 },
  { x: 0.08, z: 0.08 },
  { x: 0.5, z: 0.94 },
  { x: 0.94, z: 0.5 },
];

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

function pick<T>(items: readonly T[], next: () => number, fallback: T): T {
  return items[Math.floor(next() * items.length)] ?? fallback;
}

/** Odd spans keep the maze generator's carving grid aligned. */
function oddSpan(base: number, next: () => number): number {
  const span = base + Math.round((next() * 2 - 1) * 6);
  const clamped = Math.max(15, Math.min(41, span));
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

/**
 * One rolled variant of an archetype. Deterministic: the same archetype and seed always give the
 * same space, so a base can be re-rolled and come back to.
 */
export function rollVariant(archetype: SceneBase, seed: number): SceneBase {
  const next = rng(seed);
  const tile = pick(GROUND[archetype.id] ?? [archetype.tile], next, archetype.tile);
  const exit = pick(EXITS, next, archetype.exit);
  // Rotate the prop palette so two variants of one archetype do not read as the same room.
  const offset = Math.floor(next() * archetype.props.length);
  const props = [...archetype.props.slice(offset), ...archetype.props.slice(0, offset)];

  return {
    ...archetype,
    id: `${archetype.id}_${seed.toString(36)}`,
    name: archetype.name,
    tile,
    width: oddSpan(archetype.width, next),
    depth: oddSpan(archetype.depth, next),
    props,
    exit,
  };
}

/** A fresh set of candidates: one rolled variant per archetype. */
export function rollBases(seed: number): SceneBase[] {
  return SCENE_BASES.map((archetype, index) => rollVariant(archetype, seed + index * 0x9e3779b1));
}

export function findSceneBase(id: string): SceneBase | null {
  return SCENE_BASES.find((base) => base.id === id) ?? null;
}

/** The exit tile for a base, in whole tiles, kept one in from the edge. */
export function exitTile(base: SceneBase): { x: number; z: number } {
  return {
    x: Math.max(1, Math.min(base.width - 2, Math.round(base.exit.x * (base.width - 1)))),
    z: Math.max(1, Math.min(base.depth - 2, Math.round(base.exit.z * (base.depth - 1)))),
  };
}
