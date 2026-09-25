// What stands on the HD-2D land around a point: the same sources the 16-bit view draws (generated
// scatter per chunk, what each witnessed chunk wrote, the authored origin, notes, the door and the
// story's gates), turned into sprites, blocks and markers. Pure: no three.js objects in here.

import type { ChunkStatus } from "@renderer/state";
import { CHUNK_SIZE, type ChunkCoord, chunkKey, groundAt } from "@shared/chunks";
import type { LandNote, LandProgress } from "@shared/land";
import type { LandPlace } from "@shared/places";
import { episodeGate, nextEpisode } from "@shared/story";
import {
  type FloorSpec,
  MONSTER_KINDS,
  type MonsterKind,
  NPC_ROLES,
  type NpcRole,
  type PropSpec,
  type SceneGraph,
  type Tile,
} from "@shared/world";
import { doorPosition } from "../engine/home";
import { LAND_2D_PALETTE } from "../engine/palette";
import { MONSTER_SPRITES, MONSTER_WIDTH, ROLE_SPRITES, ROLE_WIDTH } from "../engine2d/actorSprites";
import { cachedTerrain, landTileAt } from "../engine2d/landModel";
import { placeMarkers } from "../engine2d/placeLayer";
import { type StoryView, storyMarkers } from "../engine2d/storyLayer";
import type { Foe } from "../engine2d/useLandCombat";
import { type Billboard, pickBoard, SUNKEN, TILE_HEIGHT } from "./assets";
import type { BlockInstance, BoardInstance, MarkerInstance } from "./layers";

/** Open country with no authored origin (the title screen's land): plain meadow everywhere. */
export const OPEN_FLOOR: FloorSpec = { width: 0, depth: 0, tile: "grass" };

export interface LandSource {
  origin: SceneGraph | null;
  seed: number;
  chunks: Readonly<Record<string, ChunkStatus>>;
  progress: LandProgress | null;
  notes: readonly LandNote[];
  story: StoryView | null;
  /** Living hostiles when the cartridge has combat; they replace the scene's own monster marks. */
  foes?: readonly Foe[] | null;
  /** Entrances of the land's places (courses and dungeons). */
  places?: readonly LandPlace[];
}

export function floorOf(source: Pick<LandSource, "origin">): FloorSpec {
  return source.origin?.floor ?? OPEN_FLOOR;
}

export function tileAtFor(source: Pick<LandSource, "origin" | "seed">) {
  const { origin, seed } = source;
  return (x: number, z: number): Tile =>
    origin === null ? groundAt(seed, x, z, OPEN_FLOOR.tile) : landTileAt(origin, seed, x, z);
}

/** Height of the ground under a world point, as the HD-2D view draws it (basins count as 0). */
export function standHeight(tileAt: (x: number, z: number) => Tile, x: number, z: number): number {
  const tile = tileAt(Math.floor(x), Math.floor(z));
  return SUNKEN.has(tile) ? 0 : TILE_HEIGHT[tile];
}

type Height = (x: number, z: number) => number;

/** The image-model figures (actorSprites.ts) as upright boards, one per role and per kind. */
const ROLE_BOARDS = Object.fromEntries(
  NPC_ROLES.map((role) => [role, { ...ROLE_SPRITES[role], widthTiles: ROLE_WIDTH[role] }]),
) as Record<NpcRole, Billboard>;
const MONSTER_BOARDS = Object.fromEntries(
  MONSTER_KINDS.map((kind) => [
    kind,
    { ...MONSTER_SPRITES[kind], widthTiles: MONSTER_WIDTH[kind] },
  ]),
) as Record<MonsterKind, Billboard>;

export interface StandingContent {
  boards: BoardInstance[];
  blocks: BlockInstance[];
  walls: BlockInstance[];
  markers: MarkerInstance[];
}

export function collectContent(source: LandSource, coords: readonly ChunkCoord[]): StandingContent {
  const content: StandingContent = { boards: [], blocks: [], walls: [], markers: [] };
  const floor = floorOf(source);
  const tileAt = tileAtFor(source);
  const height: Height = (x, z) => standHeight(tileAt, x, z);
  for (const coord of coords) {
    const ox = coord.cx * CHUNK_SIZE;
    const oz = coord.cz * CHUNK_SIZE;
    for (const prop of cachedTerrain(source.seed, floor, coord).props) {
      pushProp(content, height, prop, ox, oz);
    }
    const written = source.chunks[chunkKey(coord)];
    if (written?.status !== "written") continue;
    pushScene(content, height, written.scene, ox, oz, true);
  }
  const fighting = source.foes !== null && source.foes !== undefined;
  if (source.origin !== null && coords.some((c) => c.cx === 0 && c.cz === 0)) {
    pushScene(content, height, source.origin, 0, 0, !fighting);
  }
  for (const foe of source.foes ?? []) {
    const board = MONSTER_BOARDS[foe.kind];
    content.boards.push({ board, x: foe.x, y: height(foe.x, foe.z), z: foe.z, scale: 1 });
  }
  content.markers.push(...collectMarkers(source, height));
  return content;
}

function pushScene(
  content: StandingContent,
  height: Height,
  scene: SceneGraph,
  ox: number,
  oz: number,
  /** False while a fight owns the monsters (they are drawn from the roster instead). */
  withMonsters: boolean,
): void {
  for (const wall of scene.walls) {
    for (let offset = 0; offset < Math.max(1, Math.round(wall.width)); offset += 1) {
      const x = ox + wall.x + offset + 0.5;
      const z = oz + wall.z + 0.5;
      content.walls.push({ x, y: height(x, z), z, width: 1, height: 1.3 });
    }
  }
  for (const prop of scene.props) pushProp(content, height, prop, ox, oz);
  for (const npc of scene.npcs) {
    const x = ox + npc.x + 0.5;
    const z = oz + npc.z + 0.5;
    content.boards.push({ board: ROLE_BOARDS[npc.role], x, y: height(x, z), z, scale: 1 });
  }
  const marker = (key: string, x: number, z: number, color: string, glyph: string) =>
    content.markers.push({
      key,
      x: ox + x + 0.5,
      y: height(ox + x + 0.5, oz + z + 0.5),
      z: oz + z + 0.5,
      color,
      glyph,
      label: "",
      beam: false,
    });
  for (const treasure of scene.treasures) {
    marker(
      `treasure:${ox},${oz}:${treasure.id}`,
      treasure.x,
      treasure.z,
      LAND_2D_PALETTE.treasure,
      "◇",
    );
  }
  for (const exit of scene.exits) {
    marker(`exit:${ox},${oz}:${exit.x},${exit.z}`, exit.x, exit.z, LAND_2D_PALETTE.exit, "↥");
  }
  for (const monster of withMonsters ? scene.monsters : []) {
    const x = ox + monster.x + 0.5;
    const z = oz + monster.z + 0.5;
    content.boards.push({ board: MONSTER_BOARDS[monster.kind], x, y: height(x, z), z, scale: 1 });
  }
}

function pushProp(
  content: StandingContent,
  height: Height,
  prop: PropSpec,
  ox: number,
  oz: number,
): void {
  const x = ox + prop.x + 0.5;
  const z = oz + prop.z + 0.5;
  const y = height(x, z);
  // Giant grove trees may tower; everything else keeps to a believable size.
  const scale = Math.max(0.65, Math.min(prop.scale, prop.kind === "tree" ? 3.6 : 1.5));
  const board = pickBoard(prop.kind, Math.floor(x), Math.floor(z));
  if (board !== null) {
    content.boards.push({ board, x, y, z, scale });
    return;
  }
  const size = Math.min(1.6, 0.7 * scale);
  content.blocks.push({ x, y, z, width: size, height: size * 1.2 });
}

function collectMarkers(source: LandSource, height: Height): MarkerInstance[] {
  const markers: MarkerInstance[] = [];
  const at = (x: number, z: number) => ({ x, y: height(x, z), z });
  for (const note of source.notes) {
    markers.push({
      key: `note:${note.id}`,
      ...at(
        note.coord.cx * CHUNK_SIZE + note.coord.x + 0.5,
        note.coord.cz * CHUNK_SIZE + note.coord.z + 0.5,
      ),
      color: LAND_2D_PALETTE.note,
      glyph: "▯",
      label: "",
      beam: false,
    });
  }
  if (source.progress !== null && source.origin !== null) {
    const [x, z] = doorPosition(source.origin, source.progress.home);
    markers.push({
      key: "door",
      ...at(x, z),
      color: LAND_2D_PALETTE.door,
      glyph: "門",
      label: "",
      beam: false,
    });
  }
  placeMarkers(source.places ?? []).forEach((marker, index) => {
    markers.push({
      key: `place:${index}`,
      ...at(marker.x, marker.z),
      color: marker.color,
      glyph: marker.glyph,
      label: marker.label,
      beam: false,
    });
  });
  if (source.story !== null) {
    storyMarkers(source.story).forEach((marker, index) => {
      markers.push({
        key: `gate:${index}`,
        ...at(marker.x, marker.z),
        color: marker.color,
        glyph: marker.glyph,
        label: marker.label,
        beam: marker.color === LAND_2D_PALETTE.episodeOpen,
      });
    });
  }
  return markers;
}

/** The next story gate the compass points at, or null when there is no story left to walk to. */
export function compassTarget(
  story: StoryView | null,
): { x: number; z: number; label: string } | null {
  if (story === null) return null;
  const next = nextEpisode(story.episodes, story.progress);
  if (next === null) return null;
  return { ...episodeGate(next), label: next.title };
}

/** Chunks overlapping a view box around (x, z): wider than tall, deeper to the north. */
export function chunksAround(
  x: number,
  z: number,
  reach: { side: number; north: number; south: number },
): ChunkCoord[] {
  const cx0 = Math.floor((x - reach.side) / CHUNK_SIZE);
  const cx1 = Math.floor((x + reach.side) / CHUNK_SIZE);
  const cz0 = Math.floor((z - reach.north) / CHUNK_SIZE);
  const cz1 = Math.floor((z + reach.south) / CHUNK_SIZE);
  const coords: ChunkCoord[] = [];
  for (let cz = cz0; cz <= cz1; cz += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) coords.push({ cx, cz });
  }
  return coords;
}
