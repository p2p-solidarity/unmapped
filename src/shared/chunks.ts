// The open land: an unbounded grid of 32 × 32-tile chunks laid around an authored scene.
//
// Geography is derived from two things only — the land's seed and the chunk's coordinates — so the
// same cartridge shows every player the same ground at the same place, nothing generated is ever
// written to disk, and a chunk that scrolls out of view costs nothing to bring back. Pure and
// deterministic: no model, no clock, no Math.random.
//
// This is ground, water and vegetation — never people, names or stories (Rule 2). Whoever lives on
// a chunk is written by the model, once, when someone first walks there; that is not this file.

import type { FloorSpec, PatchSpec, PropKind, PropSpec, SceneGraph, Tile } from "./world";

/** Tiles per chunk edge. Equal to LIMITS.floor.max, so an authored scene always fits in one chunk. */
export const CHUNK_SIZE = 32;
/** Scattered props per chunk; the instanced batches and the collider count both scale with it. */
export const MAX_CHUNK_PROPS = 96;

export interface ChunkCoord {
  cx: number;
  cz: number;
}

/** The part of a chunk an authored scene already covers; generated terrain leaves it empty. */
export interface ChunkHole {
  width: number;
  depth: number;
}

export interface ChunkTerrain {
  coord: ChunkCoord;
  /** Always CHUNK_SIZE square; tile coordinates inside a chunk are local (0 … CHUNK_SIZE - 1). */
  floor: FloorSpec;
  patches: PatchSpec[];
  props: PropSpec[];
  hole: ChunkHole | null;
}

export interface ChunkTerrainInput {
  seed: number;
  coord: ChunkCoord;
  /** The authored scene standing at chunk (0, 0): it sets the base ground and fills its own tiles. */
  origin: Pick<SceneGraph, "floor">;
}

export function chunkOf(x: number, z: number): ChunkCoord {
  return { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE) };
}

export function chunkKey(coord: ChunkCoord): string {
  return `${coord.cx},${coord.cz}`;
}

/** Ring distance between chunks: 0 = same chunk, 1 = the eight neighbours. */
export function chunkDistance(a: ChunkCoord, b: ChunkCoord): number {
  return Math.max(Math.abs(a.cx - b.cx), Math.abs(a.cz - b.cz));
}

/** Every chunk within `radius` rings of `centre`, row-major so React keys mount in a stable order. */
export function chunksAround(centre: ChunkCoord, radius: number): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      out.push({ cx: centre.cx + dx, cz: centre.cz + dz });
    }
  }
  return out;
}

// ── Noise ────────────────────────────────────────────────────────────────────────────────────

function hash(seed: number, x: number, z: number): number {
  let h = (seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(z, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Deterministic 0 … 1 for one lattice point. */
function unit(seed: number, x: number, z: number): number {
  return hash(seed, x, z) / 0x100000000;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smoothed value noise: features are roughly `cell` tiles across. */
function valueNoise(seed: number, x: number, z: number, cell: number): number {
  const fx = x / cell;
  const fz = z / cell;
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  const tx = smooth(fx - x0);
  const tz = smooth(fz - z0);
  const near = unit(seed, x0, z0) * (1 - tx) + unit(seed, x0 + 1, z0) * tx;
  const far = unit(seed, x0, z0 + 1) * (1 - tx) + unit(seed, x0 + 1, z0 + 1) * tx;
  return near * (1 - tz) + far * tz;
}

// ── Ground ───────────────────────────────────────────────────────────────────────────────────

const WET_SEED = 0x51ed270b;
const ROCK_SEED = 0x2c1b3c6d;
const GROVE_SEED = 0x7f4a7c15;
const ROLL_SEED = 0x1b873593;
const SIZE_SEED = 0x3c6ef372;

const WATER_LEVEL = 0.3;
const SHORE_LEVEL = 0.35;
const ROCK_LEVEL = 0.7;

/** Ground that is already liquid or empty has no lakes cut into it. */
const LAKELESS: ReadonlySet<Tile> = new Set<Tile>(["water", "lava", "void"]);

/** Half-width of the ford along each chunk's centre row and column (3 tiles across). */
const FORD_REACH = 1;

function mod(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/**
 * Every chunk's centre row and column is a ford: water there is shallow sand and nothing grows on
 * it. Story gates stand at chunk centres, so with the origin chunk kept dry, the spawn and every
 * gate are joined by land on every seed — a lake can no longer wall anyone in.
 */
export function isFord(wx: number, wz: number): boolean {
  const middle = CHUNK_SIZE / 2;
  return (
    Math.abs(mod(wx, CHUNK_SIZE) - middle) <= FORD_REACH ||
    Math.abs(mod(wz, CHUNK_SIZE) - middle) <= FORD_REACH
  );
}

/**
 * A written chunk as the host lets it stand: whatever the model placed on a ford (a prop, a run of
 * wall) is left out, so no witnessed place can close the way between the spawn and a story gate.
 * The stored program is untouched — this is how it stands on the land, not what was written.
 */
export function clearFords(scene: SceneGraph, coord: ChunkCoord): SceneGraph {
  const ox = coord.cx * CHUNK_SIZE;
  const oz = coord.cz * CHUNK_SIZE;
  const onFord = (x: number, z: number): boolean => isFord(ox + Math.floor(x), oz + Math.floor(z));
  let changed = false;
  const props = scene.props.filter((prop) => {
    const keep = !onFord(prop.x, prop.z);
    changed ||= !keep;
    return keep;
  });
  const walls = scene.walls.flatMap((wall) => {
    const width = Math.max(1, Math.round(wall.width));
    const pieces: SceneGraph["walls"] = [];
    let start: number | null = null;
    for (let offset = 0; offset <= width; offset += 1) {
      const standing = offset < width && !onFord(wall.x + offset, wall.z);
      if (standing && start === null) start = offset;
      if (!standing && start !== null) {
        pieces.push({ ...wall, x: wall.x + start, width: offset - start });
        start = null;
      }
    }
    const whole = pieces.length === 1 && pieces[0]?.width === width;
    changed ||= !whole;
    return whole ? [wall] : pieces;
  });
  return changed ? { ...scene, props, walls } : scene;
}

function inOriginChunk(wx: number, wz: number): boolean {
  return wx >= 0 && wz >= 0 && wx < CHUNK_SIZE && wz < CHUNK_SIZE;
}

/** The tile at world tile (wx, wz). Depends on the seed and the position only, never on the chunk. */
export function groundAt(seed: number, wx: number, wz: number, base: Tile): Tile {
  if (!LAKELESS.has(base) && !inOriginChunk(wx, wz)) {
    const wet =
      (valueNoise(seed ^ WET_SEED, wx, wz, 44) + 0.35 * valueNoise(seed ^ WET_SEED, wx, wz, 11)) /
      1.35;
    if (wet < WATER_LEVEL) return isFord(wx, wz) ? "sand" : "water";
    if (wet < SHORE_LEVEL) return "sand";
  }
  if (base !== "stone" && valueNoise(seed ^ ROCK_SEED, wx, wz, 26) > ROCK_LEVEL) return "stone";
  return base;
}

interface Scatter {
  kind: PropKind;
  /** Chance per tile in open country and inside a grove. */
  open: number;
  grove: number;
}

// Vegetation grows where the ground lets it; liquid, void and lava grow nothing.
const SCATTER: Partial<Record<Tile, readonly Scatter[]>> = {
  grass: [
    { kind: "tree", open: 0.006, grove: 0.06 },
    { kind: "flower", open: 0.02, grove: 0.004 },
    { kind: "mushroom", open: 0, grove: 0.015 },
    { kind: "rock", open: 0.004, grove: 0.004 },
  ],
  snow: [
    { kind: "tree", open: 0.004, grove: 0.06 },
    { kind: "rock", open: 0.008, grove: 0.008 },
  ],
  stone: [{ kind: "rock", open: 0.05, grove: 0.05 }],
  sand: [{ kind: "rock", open: 0.008, grove: 0.008 }],
  wood: [],
};

const GROVE_LEVEL = 0.58;
/** A rare grove tree towers over the rest — roughly one every few chunks: something to walk toward. */
const GIANT_CHANCE = 0.008;

function propAt(
  seed: number,
  wx: number,
  wz: number,
  tile: Tile,
): Omit<PropSpec, "x" | "z"> | null {
  const table = SCATTER[tile];
  if (table === undefined || table.length === 0 || isFord(wx, wz)) return null;
  const grove = valueNoise(seed ^ GROVE_SEED, wx, wz, 22) > GROVE_LEVEL;
  let roll = unit(seed ^ ROLL_SEED, wx, wz);
  for (const entry of table) {
    const chance = grove ? entry.grove : entry.open;
    if (roll < chance) {
      const size = unit(seed ^ SIZE_SEED, wx, wz);
      const giant = entry.kind === "tree" && grove && size < GIANT_CHANCE;
      const scale = giant ? 3.6 : Math.round((0.8 + size * 0.8) * 100) / 100;
      return { kind: entry.kind, scale, tint: null, dynamic: false };
    }
    roll -= chance;
  }
  return null;
}

function inHole(hole: ChunkHole | null, x: number, z: number): boolean {
  return hole !== null && x < hole.width && z < hole.depth;
}

/** Row runs of one tile kind, so a lake is a few dozen patches instead of a thousand. */
function patchRuns(tiles: readonly (Tile | null)[]): PatchSpec[] {
  const patches: PatchSpec[] = [];
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    let x = 0;
    while (x < CHUNK_SIZE) {
      const tile = tiles[z * CHUNK_SIZE + x] ?? null;
      let end = x + 1;
      while (end < CHUNK_SIZE && (tiles[z * CHUNK_SIZE + end] ?? null) === tile) end += 1;
      if (tile !== null) patches.push({ x, z, width: end - x, depth: 1, tile });
      x = end;
    }
  }
  return patches;
}

/** The generated ground of one chunk, in the chunk's own local tile coordinates. */
export function chunkTerrain(input: ChunkTerrainInput): ChunkTerrain {
  const { seed, coord, origin } = input;
  const base = origin.floor.tile;
  const hole: ChunkHole | null =
    coord.cx === 0 && coord.cz === 0
      ? {
          width: Math.min(CHUNK_SIZE, Math.max(0, Math.floor(origin.floor.width))),
          depth: Math.min(CHUNK_SIZE, Math.max(0, Math.floor(origin.floor.depth))),
        }
      : null;
  const overrides: (Tile | null)[] = new Array(CHUNK_SIZE * CHUNK_SIZE).fill(null);
  const props: PropSpec[] = [];
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      if (inHole(hole, x, z)) continue;
      const wx = coord.cx * CHUNK_SIZE + x;
      const wz = coord.cz * CHUNK_SIZE + z;
      const tile = groundAt(seed, wx, wz, base);
      if (tile !== base) overrides[z * CHUNK_SIZE + x] = tile;
      if (props.length >= MAX_CHUNK_PROPS) continue;
      const prop = propAt(seed, wx, wz, tile);
      if (prop !== null) props.push({ ...prop, x, z });
    }
  }
  return {
    coord,
    floor: { width: CHUNK_SIZE, depth: CHUNK_SIZE, tile: base },
    patches: patchRuns(overrides),
    props,
    hole,
  };
}
