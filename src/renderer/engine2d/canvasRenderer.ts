import type { ChunkStatus } from "@renderer/state";
import { CHUNK_SIZE, chunkKey } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import type { LandNote, LandProgress } from "@shared/land";
import type { LandPlace } from "@shared/places";
import type { PropSpec, SceneGraph } from "@shared/world";
import { doorPosition } from "../engine/home";
import { LAND_2D_PALETTE, MONSTER_LOOK } from "../engine/palette";
import type { RemotePlayer } from "../engine/remoteRoster";
import { MONSTER_SPRITES, MONSTER_WIDTH, ROLE_SPRITES, ROLE_WIDTH } from "./actorSprites";
import {
  ACTOR_ASSETS,
  type AtlasId,
  GROUND_ASSETS,
  PROP_ASSETS,
  type SpriteAsset,
} from "./assetCatalog";
import type { DayLight, Rgb } from "./dayClock";
import { keepsakeItems } from "./keepsakes";
import { cachedTerrain, landTileAt } from "./landModel";
import { drawRift, placeMarkers } from "./placeLayer";
import { drawPresencePixel } from "./presenceLayer";
import { drawPropShape } from "./propShapes";
import { seasonLight } from "./seasonTint";
import { drawStoryCompass, type StoryMarker, type StoryView, storyMarkers } from "./storyLayer";
import { drawMistPixel, type TraceFrame, traceItemsPixel } from "./traceLayer";
import type { Foe, ShotTrace } from "./useLandCombat";

export type SpriteAtlases = Record<AtlasId, HTMLImageElement | HTMLCanvasElement>;

export interface Player2D {
  x: number;
  z: number;
  facing: "north" | "south" | "east" | "west";
  moving: boolean;
}

export interface LandFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  tileSize: number;
  scene: SceneGraph;
  seed: number;
  player: Player2D;
  atlases: SpriteAtlases;
  chunks: Readonly<Record<string, ChunkStatus>>;
  progress: LandProgress | null;
  notes: readonly LandNote[];
  /** The world's story, when it was made from one; null for the base game. */
  story: StoryView | null;
  /** Living hostiles when the cartridge has combat (they replace the scene's monster marks). */
  foes?: readonly Foe[] | null;
  shot?: ShotTrace | null;
  /** Entrances of the land's places (courses and dungeons). */
  places?: readonly LandPlace[];
  /** The story chapter being played around its gate, in world tiles. */
  chapter?: SceneGraph | null;
  /** Where a click sent the walker, or null. */
  goal?: { x: number; z: number } | null;
  /** On a continent: whose ground each chunk is (null or absent when not merged). */
  land?: TerritoryMap | null;
  /** Other players on the continent, in this world's tiles. */
  others?: readonly RemotePlayer[];
  /** Offset markers and doors of the continent's worlds. */
  continent?: readonly StoryMarker[];
  /** Mist, signposts and gifts from the world's history (./traceLayer). */
  traces?: TraceFrame;
  now: number;
  light?: DayLight;
}

const cssRgb = (color: Rgb): string =>
  `rgb(${Math.round(color[0] * 255)} ${Math.round(color[1] * 255)} ${Math.round(color[2] * 255)})`;

/** How long a shot's streak stays on screen. */
export const SHOT_TRACE_MS = 160;

interface ScreenTransform {
  left: number;
  top: number;
  tileSize: number;
  width: number;
  height: number;
}

interface DrawItem {
  z: number;
  draw(): void;
}

export function renderLandFrame(frame: LandFrame): void {
  const { ctx, width, height, tileSize, player } = frame;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = LAND_2D_PALETTE.background;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const transform: ScreenTransform = {
    left: player.x - width / tileSize / 2,
    top: player.z - height / tileSize / 2,
    tileSize,
    width,
    height,
  };
  drawGround(frame, transform);
  drawGoal(frame, transform);
  const items = collectScenery(frame, transform);
  items.push({ z: player.z, draw: () => drawPlayer(frame, transform) });
  items.sort((a, b) => a.z - b.z);
  for (const item of items) item.draw();
  drawShot(frame, transform);
  drawMistPixel(frame);
  drawVignette(ctx, width, height);
  if (frame.light !== undefined) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = cssRgb(seasonLight(frame.light).wash);
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  if (frame.story !== null) drawStoryCompass(ctx, width, height, tileSize, player, frame.story);
  drawPresencePixel(frame);
}

function drawGround(frame: LandFrame, transform: ScreenTransform): void {
  const { ctx, scene, seed, atlases } = frame;
  const x0 = Math.floor(transform.left) - 1;
  const z0 = Math.floor(transform.top) - 1;
  const x1 = Math.ceil(transform.left + transform.width / transform.tileSize) + 1;
  const z1 = Math.ceil(transform.top + transform.height / transform.tileSize) + 1;
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const tile = landTileAt(scene, seed, x, z, frame.land ?? null);
      const asset = GROUND_ASSETS[tile];
      const [dx, dy] = toScreen(transform, x, z);
      drawSprite(ctx, atlases, asset, dx, dy, transform.tileSize, transform.tileSize);
    }
  }
}

function collectScenery(frame: LandFrame, transform: ScreenTransform): DrawItem[] {
  const items: DrawItem[] = [];
  const x0 = Math.floor(transform.left) - 2;
  const z0 = Math.floor(transform.top) - 3;
  const x1 = Math.ceil(transform.left + transform.width / transform.tileSize) + 2;
  const z1 = Math.ceil(transform.top + transform.height / transform.tileSize) + 3;
  const cx0 = Math.floor(x0 / CHUNK_SIZE);
  const cz0 = Math.floor(z0 / CHUNK_SIZE);
  const cx1 = Math.floor(x1 / CHUNK_SIZE);
  const cz1 = Math.floor(z1 / CHUNK_SIZE);

  for (let cz = cz0; cz <= cz1; cz += 1) {
    for (let cx = cx0; cx <= cx1; cx += 1) {
      const terrain = cachedTerrain(frame.seed, frame.scene.floor, { cx, cz }, frame.land ?? null);
      for (const prop of terrain.props) {
        pushProp(items, frame, transform, prop, cx * CHUNK_SIZE, cz * CHUNK_SIZE);
      }
      const written = frame.chunks[chunkKey({ cx, cz })];
      if (written?.status !== "written") continue;
      for (const wall of written.scene.walls) {
        for (let offset = 0; offset < Math.max(1, Math.round(wall.width)); offset += 1) {
          pushWall(
            items,
            frame,
            transform,
            cx * CHUNK_SIZE + wall.x + offset,
            cz * CHUNK_SIZE + wall.z,
          );
        }
      }
      for (const prop of written.scene.props) {
        pushProp(items, frame, transform, prop, cx * CHUNK_SIZE, cz * CHUNK_SIZE);
      }
      for (const npc of written.scene.npcs) {
        pushActor(
          items,
          frame,
          transform,
          cx * CHUNK_SIZE + npc.x + 0.5,
          cz * CHUNK_SIZE + npc.z + 0.5,
          ROLE_SPRITES[npc.role],
          ROLE_WIDTH[npc.role],
        );
      }
    }
  }

  for (const wall of frame.scene.walls) {
    for (let offset = 0; offset < Math.max(1, Math.round(wall.width)); offset += 1) {
      pushWall(items, frame, transform, wall.x + offset, wall.z);
    }
  }
  for (const prop of frame.scene.props) pushProp(items, frame, transform, prop, 0, 0);
  for (const npc of frame.scene.npcs) {
    pushActor(
      items,
      frame,
      transform,
      npc.x + 0.5,
      npc.z + 0.5,
      ROLE_SPRITES[npc.role],
      ROLE_WIDTH[npc.role],
    );
  }
  for (const treasure of frame.scene.treasures) {
    pushMarker(
      items,
      frame,
      transform,
      treasure.x + 0.5,
      treasure.z + 0.5,
      LAND_2D_PALETTE.treasure,
      "◇",
    );
  }
  for (const exit of frame.scene.exits) {
    pushMarker(items, frame, transform, exit.x + 0.5, exit.z + 0.5, LAND_2D_PALETTE.exit, "↥");
  }
  if (frame.foes === null || frame.foes === undefined) {
    for (const monster of frame.scene.monsters) {
      pushActor(
        items,
        frame,
        transform,
        monster.x + 0.5,
        monster.z + 0.5,
        MONSTER_SPRITES[monster.kind],
        MONSTER_WIDTH[monster.kind],
      );
    }
  }
  // The story chapter around its gate: its people and finds, and its foes when no fight holds them.
  const chapter = frame.chapter ?? null;
  for (const npc of chapter?.npcs ?? []) {
    const { x, z } = npc;
    pushActor(
      items,
      frame,
      transform,
      x + 0.5,
      z + 0.5,
      ROLE_SPRITES[npc.role],
      ROLE_WIDTH[npc.role],
    );
  }
  for (const treasure of chapter?.treasures ?? []) {
    const { x, z } = treasure;
    pushMarker(items, frame, transform, x + 0.5, z + 0.5, LAND_2D_PALETTE.treasure, "◇");
  }
  const idle = frame.foes === null || frame.foes === undefined;
  for (const monster of idle ? (chapter?.monsters ?? []) : []) {
    const sprite = MONSTER_SPRITES[monster.kind];
    pushActor(
      items,
      frame,
      transform,
      monster.x + 0.5,
      monster.z + 0.5,
      sprite,
      MONSTER_WIDTH[monster.kind],
    );
  }
  for (const foe of frame.foes ?? []) {
    pushActor(
      items,
      frame,
      transform,
      foe.x,
      foe.z,
      MONSTER_SPRITES[foe.kind],
      MONSTER_WIDTH[foe.kind],
      {
        text: `Lv ${foe.level} · ${foe.hp}/${foe.maxHp}`,
        color: MONSTER_LOOK[foe.kind]?.color ?? LAND_2D_PALETTE.monster,
      },
    );
  }
  for (const note of frame.notes) {
    const x = note.coord.cx * CHUNK_SIZE + note.coord.x + 0.5;
    const z = note.coord.cz * CHUNK_SIZE + note.coord.z + 0.5;
    pushMarker(items, frame, transform, x, z, LAND_2D_PALETTE.note, "▯");
  }
  if (frame.progress !== null) {
    const [x, z] = doorPosition(frame.scene, frame.progress.home);
    pushMarker(items, frame, transform, x, z, LAND_2D_PALETTE.door, "門");
  }
  items.push(...keepsakeItems(frame, transform));
  items.push(...traceItemsPixel(frame));
  const places = placeMarkers(frame.places ?? []);
  // An otherworld's rift lies on the ground: under its crest and anyone standing on it.
  for (const rift of places) {
    if (!rift.portal || !visible(transform, rift.x, rift.z, 2)) continue;
    const [rx, ry] = toScreen(transform, rift.x, rift.z);
    items.push({
      z: rift.z - 0.5,
      draw: () => drawRift(frame.ctx, rx, ry, transform.tileSize, frame.now),
    });
  }
  const marks = [
    ...(frame.story === null ? [] : storyMarkers(frame.story)),
    ...places,
    ...(frame.continent ?? []),
  ];
  // Other players on the continent: the same walker figure, facing and stepping the way they do,
  // with their name over it.
  for (const other of frame.others ?? []) {
    const figure: SpriteAsset = {
      ...ACTOR_ASSETS.player,
      sx: FACING_COLUMN[other.facing],
      sy: other.moving ? (Math.floor(frame.now / 140) % 4) * 16 : 0,
    };
    pushActor(items, frame, transform, other.x, other.z, figure, 1, {
      text: other.name,
      color: LAND_2D_PALETTE.remote,
    });
  }
  for (const marker of marks) {
    pushMarker(
      items,
      frame,
      transform,
      marker.x,
      marker.z,
      marker.color,
      marker.glyph,
      marker.label,
    );
  }
  return items;
}

function pushProp(
  items: DrawItem[],
  frame: LandFrame,
  transform: ScreenTransform,
  prop: PropSpec,
  ox: number,
  oz: number,
): void {
  const x = ox + prop.x + 0.5;
  const z = oz + prop.z + 0.5;
  if (!visible(transform, x, z, 3)) return;
  const asset = PROP_ASSETS[prop.kind];
  items.push({
    z,
    draw: () => {
      const [cx, cy] = toScreen(transform, x, z);
      if (asset === undefined) {
        if (!drawPropShape(frame.ctx, prop.kind, cx, cy, transform.tileSize, frame.now)) {
          drawFallback(frame.ctx, cx, cy, transform.tileSize);
        }
        return;
      }
      const scale = Math.max(0.65, Math.min(prop.scale, 2.2));
      const width = transform.tileSize * (asset.widthTiles ?? asset.sw / 16) * scale;
      const height = width * (asset.sh / asset.sw);
      drawSprite(
        frame.ctx,
        frame.atlases,
        asset,
        cx - width / 2,
        cy + transform.tileSize / 2 - height,
        width,
        height,
      );
    },
  });
}

function pushWall(
  items: DrawItem[],
  frame: LandFrame,
  transform: ScreenTransform,
  x: number,
  z: number,
): void {
  if (!visible(transform, x + 0.5, z + 0.5, 1)) return;
  items.push({
    z: z + 0.5,
    draw: () => {
      const [dx, dy] = toScreen(transform, x, z);
      drawSprite(
        frame.ctx,
        frame.atlases,
        GROUND_ASSETS.stone,
        dx,
        dy - transform.tileSize * 0.35,
        transform.tileSize,
        transform.tileSize * 1.35,
      );
    },
  });
}

/** A figure standing on its tile: `widthTiles` wide, feet just below the tile's centre. */
function pushActor(
  items: DrawItem[],
  frame: LandFrame,
  transform: ScreenTransform,
  x: number,
  z: number,
  asset: SpriteAsset,
  widthTiles: number,
  label: { text: string; color: string } | null = null,
): void {
  if (!visible(transform, x, z, 2)) return;
  items.push({
    z,
    draw: () => {
      const [cx, cy] = toScreen(transform, x, z);
      const size = transform.tileSize * widthTiles;
      const top = cy + transform.tileSize * 0.4 - size;
      drawSprite(frame.ctx, frame.atlases, asset, cx - size / 2, top, size, size);
      if (label !== null) {
        frame.ctx.fillStyle = label.color;
        frame.ctx.font = `${Math.round(transform.tileSize * 0.3)}px sans-serif`;
        frame.ctx.textAlign = "center";
        frame.ctx.textBaseline = "middle";
        frame.ctx.fillText(label.text, cx, top + size * 0.1);
      }
    },
  });
}

function pushMarker(
  items: DrawItem[],
  frame: LandFrame,
  transform: ScreenTransform,
  x: number,
  z: number,
  color: string,
  glyph: string,
  label = "",
): void {
  if (!visible(transform, x, z, 2)) return;
  items.push({
    z,
    draw: () => {
      const [cx, cy] = toScreen(transform, x, z);
      const size = transform.tileSize * 0.72;
      frame.ctx.fillStyle = LAND_2D_PALETTE.markerSurface;
      frame.ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      frame.ctx.strokeStyle = color;
      frame.ctx.lineWidth = Math.max(1, transform.tileSize / 16);
      frame.ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
      frame.ctx.fillStyle = color;
      frame.ctx.font = `${Math.round(size * 0.55)}px sans-serif`;
      frame.ctx.textAlign = "center";
      frame.ctx.textBaseline = "middle";
      frame.ctx.fillText(glyph, cx, cy + 1);
      if (label !== "") {
        frame.ctx.font = `${Math.round(transform.tileSize * 0.3)}px sans-serif`;
        frame.ctx.fillText(label, cx, cy - size * 0.95);
      }
    },
  });
}

/** A small ring on the ground where a click sent the walker. */
function drawGoal(frame: LandFrame, transform: ScreenTransform): void {
  const goal = frame.goal;
  if (goal === null || goal === undefined) return;
  const [x, y] = toScreen(transform, goal.x, goal.z);
  const pulse = 0.8 + 0.2 * Math.sin(frame.now / 160);
  frame.ctx.strokeStyle = LAND_2D_PALETTE.goal;
  frame.ctx.lineWidth = Math.max(1, transform.tileSize / 20);
  frame.ctx.beginPath();
  frame.ctx.ellipse(
    x,
    y,
    transform.tileSize * 0.32 * pulse,
    transform.tileSize * 0.2 * pulse,
    0,
    0,
    Math.PI * 2,
  );
  frame.ctx.stroke();
}

const FACING_COLUMN = { south: 0, north: 16, west: 32, east: 48 } as const;

function drawPlayer(frame: LandFrame, transform: ScreenTransform): void {
  const { player, ctx, atlases, now } = frame;
  const [cx, cy] = toScreen(transform, player.x, player.z);
  const source = ACTOR_ASSETS.player;
  // Character sheets are one column per facing and one row per walk frame.
  const facingColumn = FACING_COLUMN[player.facing];
  const walkFrame = player.moving ? Math.floor(now / 140) % 4 : 0;
  const animated: SpriteAsset = {
    ...source,
    sx: facingColumn,
    sy: walkFrame * 16,
  };
  drawSprite(
    ctx,
    atlases,
    animated,
    cx - transform.tileSize / 2,
    cy - transform.tileSize / 2,
    transform.tileSize,
    transform.tileSize,
  );
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  atlases: SpriteAtlases,
  asset: SpriteAsset,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  ctx.drawImage(atlases[asset.atlas], asset.sx, asset.sy, asset.sw, asset.sh, dx, dy, dw, dh);
}

/** A prop kind with neither a sprite nor a shape (a future kind): a plain block, never a label. */
function drawFallback(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tileSize: number,
): void {
  const size = tileSize * 0.55;
  ctx.fillStyle = LAND_2D_PALETTE.fallbackBody;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
}

function toScreen(transform: ScreenTransform, x: number, z: number): [number, number] {
  return [(x - transform.left) * transform.tileSize, (z - transform.top) * transform.tileSize];
}

function visible(transform: ScreenTransform, x: number, z: number, margin: number): boolean {
  return (
    x >= transform.left - margin &&
    z >= transform.top - margin &&
    x <= transform.left + transform.width / transform.tileSize + margin &&
    z <= transform.top + transform.height / transform.tileSize + margin
  );
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, LAND_2D_PALETTE.vignetteClear);
  gradient.addColorStop(1, LAND_2D_PALETTE.vignetteEdge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawShot(frame: LandFrame, transform: ScreenTransform): void {
  const shot = frame.shot;
  if (shot === null || shot === undefined || frame.now - shot.at > SHOT_TRACE_MS) return;
  const [x0, y0] = toScreen(transform, shot.x0, shot.z0);
  const [x1, y1] = toScreen(transform, shot.x1, shot.z1);
  const ctx = frame.ctx;
  ctx.save();
  ctx.globalAlpha = 1 - (frame.now - shot.at) / SHOT_TRACE_MS;
  ctx.strokeStyle = shot.hit ? LAND_2D_PALETTE.shotHit : LAND_2D_PALETTE.shotMiss;
  ctx.lineWidth = Math.max(2, transform.tileSize / 12);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}
