// Distant landmarks, for both looks ("there is always something tall in the distance", plan.md §3):
// the rare giant grove trees of the deterministic terrain and the tall things people built on
// witnessed chunks, up to FAR_RINGS chunks away. A chunk's giant trees are derived once and cached;
// only a few missing chunks are derived per frame, so crossing into a new chunk never stalls.
// The shapes are flat silhouettes painted once onto a small sheet; each look places them itself.

import type { ChunkStatus } from "@renderer/state";
import { CHUNK_SIZE, type ChunkCoord, chunkKey, chunkTerrain } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import type { FloorSpec, PropKind, PropSpec, SceneGraph } from "@shared/world";

export const LANDMARK_KINDS = ["tree", "tower", "chimney", "windmill", "house"] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

export interface Landmark {
  x: number;
  z: number;
  kind: LandmarkKind;
  /** Tiles tall, as its silhouette cell stands (the cell is square). */
  height: number;
}

/** Built by people and tall enough to read from far away: its silhouette and cell height. */
const TALL: Partial<Record<PropKind, { kind: LandmarkKind; height: number }>> = {
  chimney: { kind: "chimney", height: 9 },
  steel_tower: { kind: "tower", height: 14 },
  windmill: { kind: "windmill", height: 7 },
  house: { kind: "house", height: 4.5 },
};
/** Grove trees at least this big (the terrain's giants stand at 3.6) are landmarks. */
const GIANT_SCALE = 3;
/** Rings of chunks whose landmarks stay in view. */
export const FAR_RINGS = 6;
/** Chunks whose terrain may be derived in one update. */
const BUDGET = 6;
const MAX_LANDMARKS = 48;
const CACHE_LIMIT = 2048;

export interface FarSource {
  seed: number;
  /** The authored origin's floor (sets the base ground), or the open meadow of the title land. */
  floor: FloorSpec;
  land: TerritoryMap | null;
  chunks: Readonly<Record<string, ChunkStatus>>;
  origin: SceneGraph | null;
}

const giants = new Map<string, readonly Landmark[]>();

function tall(prop: PropSpec, ox: number, oz: number, out: Landmark[]): void {
  const x = ox + prop.x + 0.5;
  const z = oz + prop.z + 0.5;
  if (prop.kind === "tree" && prop.scale >= GIANT_SCALE) {
    out.push({ x, z, kind: "tree", height: 2.5 * prop.scale });
    return;
  }
  const shape = TALL[prop.kind];
  if (shape !== undefined) {
    out.push({ x, z, kind: shape.kind, height: shape.height * Math.min(1.6, prop.scale) });
  }
}

/** Giant trees of one chunk, or null when the budget for this update is spent. */
function giantTrees(
  source: FarSource,
  coord: ChunkCoord,
  budget: { left: number },
): readonly Landmark[] | null {
  // On a continent a chunk of another world grows that world's trees, read at its own coordinates.
  const foreign = source.land?.at(coord) ?? null;
  const seed = foreign?.seed ?? source.seed;
  const floor = foreign?.origin.floor ?? source.floor;
  const at: ChunkCoord =
    foreign === null
      ? coord
      : { cx: coord.cx + foreign.dx / CHUNK_SIZE, cz: coord.cz + foreign.dz / CHUNK_SIZE };
  const key = `${seed}:${floor.tile}:${floor.width}x${floor.depth}:${at.cx},${at.cz}`;
  const hit = giants.get(key);
  if (hit !== undefined) return hit;
  if (budget.left <= 0) return null;
  budget.left -= 1;
  const out: Landmark[] = [];
  const ox = coord.cx * CHUNK_SIZE;
  const oz = coord.cz * CHUNK_SIZE;
  for (const prop of chunkTerrain({ seed, coord: at, origin: { floor } }).props) {
    if (prop.kind === "tree" && prop.scale >= GIANT_SCALE) tall(prop, ox, oz, out);
  }
  if (giants.size >= CACHE_LIMIT) {
    const oldest = giants.keys().next().value;
    if (oldest !== undefined) giants.delete(oldest);
  }
  giants.set(key, out);
  return out;
}

/** The landmarks around the player, recollected only when the chunk or the land changes. */
export class FarField {
  private list: Landmark[] = [];
  private cx = Number.NaN;
  private cz = Number.NaN;
  private refs: unknown[] = [];
  private pending = false;

  /** Landmarks within FAR_RINGS of chunk (cx, cz), the most prominent first. */
  around(source: FarSource, cx: number, cz: number): readonly Landmark[] {
    const refs = [source.seed, source.floor, source.land, source.chunks, source.origin];
    const same =
      cx === this.cx && cz === this.cz && refs.every((ref, index) => ref === this.refs[index]);
    if (same && !this.pending) return this.list;
    this.cx = cx;
    this.cz = cz;
    this.refs = refs;
    const budget = { left: BUDGET };
    const out: Landmark[] = [];
    let missing = 0;
    for (let dz = -FAR_RINGS; dz <= FAR_RINGS; dz += 1) {
      for (let dx = -FAR_RINGS; dx <= FAR_RINGS; dx += 1) {
        const coord = { cx: cx + dx, cz: cz + dz };
        const trees = giantTrees(source, coord, budget);
        if (trees === null) missing += 1;
        else out.push(...trees);
        const written = source.chunks[chunkKey(coord)];
        if (written?.status !== "written") continue;
        for (const prop of written.scene.props) {
          tall(prop, coord.cx * CHUNK_SIZE, coord.cz * CHUNK_SIZE, out);
        }
      }
    }
    for (const prop of source.origin?.props ?? []) {
      if (prop.kind !== "tree") tall(prop, 0, 0, out);
    }
    const mx = (cx + 0.5) * CHUNK_SIZE;
    const mz = (cz + 0.5) * CHUNK_SIZE;
    const prominence = (mark: Landmark) =>
      mark.height / Math.max(8, Math.hypot(mark.x - mx, mark.z - mz));
    out.sort((a, b) => prominence(b) - prominence(a));
    this.list = out.slice(0, MAX_LANDMARKS);
    this.pending = missing > 0;
    return this.list;
  }
}

export const SILHOUETTE_CELL = 128;

/** Every landmark's silhouette side by side, one square cell each, filled with `color`. */
export function paintSilhouettes(color: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = SILHOUETTE_CELL * LANDMARK_KINDS.length;
  canvas.height = SILHOUETTE_CELL;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return canvas;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  LANDMARK_KINDS.forEach((kind, index) => {
    ctx.save();
    ctx.translate(index * SILHOUETTE_CELL, 0);
    ctx.scale(SILHOUETTE_CELL / 128, SILHOUETTE_CELL / 128);
    PAINT[kind](ctx);
    ctx.restore();
  });
  return canvas;
}

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

const polygon = (ctx: CanvasRenderingContext2D, points: readonly number[]): void => {
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
};

const line = (ctx: CanvasRenderingContext2D, points: readonly number[]): void => {
  ctx.beginPath();
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
};

/** Shapes drawn in a 128 × 128 cell standing on its bottom edge. */
const PAINT: Record<LandmarkKind, (ctx: CanvasRenderingContext2D) => void> = {
  tree: (ctx) => {
    ctx.fillRect(57, 78, 14, 50);
    circle(ctx, 64, 54, 34);
    circle(ctx, 38, 72, 24);
    circle(ctx, 90, 72, 24);
    circle(ctx, 64, 24, 22);
    circle(ctx, 44, 40, 18);
    circle(ctx, 86, 40, 18);
  },
  tower: (ctx) => {
    ctx.lineWidth = 5;
    line(ctx, [34, 128, 60, 10]);
    line(ctx, [94, 128, 68, 10]);
    line(ctx, [38, 116, 88, 84, 44, 58, 80, 36, 56, 18]);
    line(ctx, [90, 116, 40, 84, 84, 58, 48, 36, 72, 18]);
    ctx.lineWidth = 4;
    line(ctx, [36, 34, 92, 34]);
    line(ctx, [44, 62, 84, 62]);
    line(ctx, [64, 10, 64, 0]);
  },
  chimney: (ctx) => {
    polygon(ctx, [50, 128, 78, 128, 72, 24, 56, 24]);
    ctx.fillRect(53, 20, 22, 8);
    circle(ctx, 72, 12, 7);
    circle(ctx, 84, 6, 6);
  },
  windmill: (ctx) => {
    polygon(ctx, [50, 128, 78, 128, 70, 52, 58, 52]);
    polygon(ctx, [54, 54, 74, 54, 64, 42]);
    ctx.lineWidth = 7;
    for (const angle of [0.35, 1.92, 3.49, 5.06]) {
      line(ctx, [64, 46, 64 + Math.cos(angle) * 44, 46 + Math.sin(angle) * 44]);
    }
    circle(ctx, 64, 46, 6);
  },
  house: (ctx) => {
    polygon(ctx, [22, 128, 106, 128, 106, 80, 64, 46, 22, 80]);
    ctx.fillRect(82, 50, 12, 24);
  },
};
