// A continent (plan.md §8): several players' worlds merged onto one land over the network.
//
// Every world keeps its own origin, seed and save. Joining a continent gives it an anchor — where
// its (0, 0) chunk lies on the continent, its offset — and the continent is split between worlds by
// the nearest anchor. A world is the only writer of its own territory: only its owner witnesses
// there, and whatever is written there goes into the owner's save. Everyone else sees it shifted by
// the difference of the two anchors, so a chunk key is always in the viewer's own coordinates.
//
// Pure: anchors, territory and the shapes that travel in the room document. The room itself lives
// in renderer/net.

import { z } from "zod";
import { CHUNK_SIZE, type ChunkCoord } from "./chunks";
import type { DoorSlot, HomeState, LandNote, WitnessedChunk } from "./land";
import type { SceneGraph } from "./world";

/** Bumped when the room document changes shape; a world on another version is not merged. */
export const CONTINENT_PROTOCOL = 1;
/** Chunks between neighbouring anchors: a short walk apart, with room for each world to grow. */
export const CONTINENT_SPACING = 6;

export interface AnchorClaim {
  worldId: string;
  /** The anchor this world asked for when it joined. */
  anchor: ChunkCoord;
  /** When it joined (its own clock); the earlier claim keeps a contested slot. */
  joinedAt: number;
}

/** Slot `index` of the spiral anchors take, ring by ring outward from (0, 0). */
export function anchorSlot(index: number): ChunkCoord {
  let remaining = Math.max(0, Math.floor(index));
  for (let ring = 0; ; ring += 1) {
    const cells = ringCells(ring);
    if (remaining < cells.length) {
      const cell = cells[remaining] ?? { cx: 0, cz: 0 };
      return { cx: cell.cx * CONTINENT_SPACING, cz: cell.cz * CONTINENT_SPACING };
    }
    remaining -= cells.length;
  }
}

function ringCells(ring: number): ChunkCoord[] {
  if (ring === 0) return [{ cx: 0, cz: 0 }];
  const cells: ChunkCoord[] = [];
  for (let cz = -ring; cz <= ring; cz += 1) {
    for (let cx = -ring; cx <= ring; cx += 1) {
      if (Math.max(Math.abs(cx), Math.abs(cz)) === ring) cells.push({ cx, cz });
    }
  }
  // East first, then clockwise on the map (+z is south), so the order is the same everywhere.
  const angle = (cell: ChunkCoord) => (Math.atan2(cell.cz, cell.cx) + 2 * Math.PI) % (2 * Math.PI);
  return cells.sort((a, b) => angle(a) - angle(b));
}

function sameCoord(a: ChunkCoord, b: ChunkCoord): boolean {
  return a.cx === b.cx && a.cz === b.cz;
}

/** The first spiral slot nobody holds. */
export function pickAnchor(taken: readonly ChunkCoord[]): ChunkCoord {
  for (let index = 0; ; index += 1) {
    const slot = anchorSlot(index);
    if (!taken.some((coord) => sameCoord(coord, slot))) return slot;
  }
}

function claimOrder(a: AnchorClaim, b: AnchorClaim): number {
  return a.joinedAt - b.joinedAt || (a.worldId < b.worldId ? -1 : a.worldId > b.worldId ? 1 : 0);
}

/**
 * Where every world stands. Two worlds that joined at once may claim the same slot; the earlier
 * claim keeps it and the later one takes the next free slot. Every peer resolves the same claims to
 * the same anchors, so nobody has to rewrite the document to settle a clash. The result is in claim
 * order, which is also how territory ties are broken.
 */
export function resolveAnchors(claims: readonly AnchorClaim[]): AnchorClaim[] {
  const resolved: AnchorClaim[] = [];
  for (const claim of [...claims].sort(claimOrder)) {
    const taken = resolved.map((one) => one.anchor);
    const free = !taken.some((coord) => sameCoord(coord, claim.anchor));
    resolved.push({ ...claim, anchor: free ? claim.anchor : pickAnchor(taken) });
  }
  return resolved;
}

/** Whose territory continent chunk `coord` is: the nearest anchor, ties to the earlier claim. */
export function ownerOf(anchors: readonly AnchorClaim[], coord: ChunkCoord): string | null {
  let best: { worldId: string; distance: number } | null = null;
  for (const claim of anchors) {
    const dx = coord.cx - claim.anchor.cx;
    const dz = coord.cz - claim.anchor.cz;
    const distance = dx * dx + dz * dz;
    if (best === null || distance < best.distance) best = { worldId: claim.worldId, distance };
  }
  return best?.worldId ?? null;
}

/** A chunk of world `from` in the coordinates of world `to` (both anchored on one continent). */
export function shiftChunk(coord: ChunkCoord, from: ChunkCoord, to: ChunkCoord): ChunkCoord {
  return { cx: coord.cx + from.cx - to.cx, cz: coord.cz + from.cz - to.cz };
}

/** Another world's ground, for a chunk the viewer sees: its seed and origin, and how to get there. */
export interface Territory {
  worldId: string;
  seed: number;
  origin: SceneGraph;
  /** Tiles: the owner's own coordinate of a viewer tile is (x + dx, z + dz). */
  dx: number;
  dz: number;
}

/** Territory per chunk in the viewer's coordinates; `at` returns null on the viewer's own land. */
export interface TerritoryMap {
  /** Changes whenever any territory does (renderers key their ground caches on it). */
  key: string;
  at(coord: ChunkCoord): Territory | null;
}

export interface TerritoryWorld {
  worldId: string;
  seed: number;
  origin: SceneGraph;
}

/**
 * The viewer's view of a continent. `anchors` are resolved (resolveAnchors) and include the viewer;
 * `worlds` carries the ground of every other world. A chunk owned by a world whose ground has not
 * arrived yet counts as the viewer's own until it does.
 */
export function territoryMap(
  viewerId: string,
  anchors: readonly AnchorClaim[],
  worlds: readonly TerritoryWorld[],
): TerritoryMap {
  const mine = anchors.find((claim) => claim.worldId === viewerId)?.anchor ?? { cx: 0, cz: 0 };
  const byId = new Map(worlds.map((world) => [world.worldId, world]));
  const cache = new Map<string, Territory | null>();
  const key = anchors
    .map((claim) => {
      const seed = byId.get(claim.worldId)?.seed ?? "";
      return `${claim.worldId}@${claim.anchor.cx},${claim.anchor.cz}#${seed}`;
    })
    .join("|");
  return {
    key: `${viewerId}:${key}`,
    at(coord) {
      const id = `${coord.cx},${coord.cz}`;
      const hit = cache.get(id);
      if (hit !== undefined) return hit;
      const owner = ownerOf(anchors, { cx: coord.cx + mine.cx, cz: coord.cz + mine.cz });
      const world = owner === null || owner === viewerId ? undefined : byId.get(owner);
      const anchor = anchors.find((claim) => claim.worldId === owner)?.anchor;
      const territory =
        world === undefined || anchor === undefined
          ? null
          : {
              worldId: world.worldId,
              seed: world.seed,
              origin: world.origin,
              dx: (mine.cx - anchor.cx) * CHUNK_SIZE,
              dz: (mine.cz - anchor.cz) * CHUNK_SIZE,
            };
      cache.set(id, territory);
      return territory;
    },
  };
}

// ── What travels in the room document ───────────────────────────────────────────────────────
// Everything read from the document came from another machine: it is checked here, and programs in
// it are parsed (and clamped) by the DSL before anything is drawn.

const MAX_PROGRAM = 64_000;
const MAX_LINE = 8_000;
const MAX_NAME = 80;

const coordSchema = z.object({
  cx: z.number().int().min(-100_000).max(100_000),
  cz: z.number().int().min(-100_000).max(100_000),
});
const dialoguesSchema = z.record(z.string().max(64), z.string().max(MAX_LINE));
const homeSchema = z.object({
  cx: z.number().int(),
  cz: z.number().int(),
  keepsakes: z.array(z.object({ id: z.string().max(64), name: z.string().max(MAX_NAME) })).max(64),
});
const doorSlotSchema = z.union([
  z.object({
    kind: z.literal("place"),
    cx: z.number().int(),
    cz: z.number().int(),
    label: z.string().max(MAX_NAME),
  }),
  z.object({ kind: z.literal("room"), code: z.string().max(16), label: z.string().max(MAX_NAME) }),
]);

/** One world on the continent, written by its owner. */
export interface ContinentWorldEntry {
  protocol: number;
  worldId: string;
  /** The owner's display name. */
  owner: string;
  /** The cartridge's name. */
  title: string;
  anchor: ChunkCoord;
  joinedAt: number;
  /** The land seed (`landSeedOf`) its generated ground comes from. */
  seed: number;
  /** The authored origin scene as a Scene program; only its ground and people are shown. */
  origin: string;
  /** The stored words of the origin's authored residents, keyed by NPC id. */
  originDialogues: Record<string, string>;
  /** Only `cx/cz` and keepsake names are shown to others. */
  home: Pick<HomeState, "cx" | "cz"> & { keepsakes: { id: string; name: string }[] };
  door: (DoorSlot | null)[];
}

const worldEntrySchema = z.object({
  protocol: z.number().int(),
  worldId: z.string().regex(/^[A-Za-z0-9-]{1,96}$/),
  owner: z.string().min(1).max(MAX_NAME),
  title: z.string().max(MAX_NAME),
  anchor: coordSchema,
  joinedAt: z.number().finite(),
  seed: z.number().int(),
  origin: z.string().max(MAX_PROGRAM),
  originDialogues: dialoguesSchema,
  home: homeSchema,
  door: z.array(doorSlotSchema.nullable()).max(8),
});

const chunkEntrySchema = z.object({
  cx: z.number().int(),
  cz: z.number().int(),
  scene: z.string().max(MAX_PROGRAM),
  dialogues: dialoguesSchema,
  errands: z.string().max(MAX_PROGRAM).optional(),
});

const noteEntrySchema = z.object({
  id: z.string().min(1).max(64),
  author: z.string().min(1).max(MAX_NAME),
  at: z.string().max(40),
  coord: z.object({
    cx: z.number().int(),
    cz: z.number().int(),
    x: z
      .number()
      .int()
      .min(0)
      .max(CHUNK_SIZE - 1),
    z: z
      .number()
      .int()
      .min(0)
      .max(CHUNK_SIZE - 1),
  }),
  anchors: z.array(z.string().max(160)).max(16),
  text: z.string().min(1).max(280),
  contests: z.string().max(64).nullable(),
});

/** A world entry of the protocol this build speaks, or null. */
export function readWorldEntry(value: unknown): ContinentWorldEntry | null {
  const parsed = worldEntrySchema.safeParse(value);
  if (!parsed.success || parsed.data.protocol !== CONTINENT_PROTOCOL) return null;
  return parsed.data;
}

export function readChunkEntry(value: unknown): WitnessedChunk | null {
  const parsed = chunkEntrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readNoteEntry(value: unknown): LandNote | null {
  const parsed = noteEntrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Document key of something that belongs to one world: `worldId|localKey`. */
export function worldKey(worldId: string, local: string): string {
  return `${worldId}|${local}`;
}

export function splitWorldKey(key: string): { worldId: string; local: string } | null {
  const bar = key.indexOf("|");
  if (bar <= 0) return null;
  return { worldId: key.slice(0, bar), local: key.slice(bar + 1) };
}
