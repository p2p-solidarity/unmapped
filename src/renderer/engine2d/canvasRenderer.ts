import type { ChunkStatus } from "@renderer/state";
import { CHUNK_SIZE, chunkKey } from "@shared/chunks";
import type { LandNote, LandProgress } from "@shared/land";
import type { PropSpec, SceneGraph } from "@shared/world";
import { doorPosition } from "../engine/home";
import { LAND_2D_PALETTE } from "../engine/palette";
import {
  ACTOR_ASSETS,
  type AtlasId,
  GROUND_ASSETS,
  PROP_ASSETS,
  type SpriteAsset,
} from "./assetCatalog";
import { cachedTerrain, landTileAt } from "./landModel";
import { drawStoryCompass, type StoryView, storyMarkers } from "./storyLayer";

export type SpriteAtlases = Record<AtlasId, HTMLImageElement>;

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
  now: number;
}

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
  const items = collectScenery(frame, transform);
  items.push({ z: player.z, draw: () => drawPlayer(frame, transform) });
  items.sort((a, b) => a.z - b.z);
  for (const item of items) item.draw();
  drawVignette(ctx, width, height);
  if (frame.story !== null) drawStoryCompass(ctx, width, height, tileSize, player, frame.story);
}

function drawGround(frame: LandFrame, transform: ScreenTransform): void {
  const { ctx, scene, seed, atlases } = frame;
  const x0 = Math.floor(transform.left) - 1;
  const z0 = Math.floor(transform.top) - 1;
  const x1 = Math.ceil(transform.left + transform.width / transform.tileSize) + 1;
  const z1 = Math.ceil(transform.top + transform.height / transform.tileSize) + 1;
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const tile = landTileAt(scene, seed, x, z);
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
      const terrain = cachedTerrain(frame.seed, frame.scene.floor, { cx, cz });
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
      written.scene.npcs.forEach((npc, index) => {
        pushActor(
          items,
          frame,
          transform,
          cx * CHUNK_SIZE + npc.x + 0.5,
          cz * CHUNK_SIZE + npc.z + 0.5,
          ACTOR_ASSETS.resident[index % ACTOR_ASSETS.resident.length] ?? ACTOR_ASSETS.resident[0],
        );
      });
    }
  }

  for (const wall of frame.scene.walls) {
    for (let offset = 0; offset < Math.max(1, Math.round(wall.width)); offset += 1) {
      pushWall(items, frame, transform, wall.x + offset, wall.z);
    }
  }
  for (const prop of frame.scene.props) pushProp(items, frame, transform, prop, 0, 0);
  frame.scene.npcs.forEach((npc, index) => {
    pushActor(
      items,
      frame,
      transform,
      npc.x + 0.5,
      npc.z + 0.5,
      ACTOR_ASSETS.resident[index % ACTOR_ASSETS.resident.length] ?? ACTOR_ASSETS.resident[0],
    );
  });
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
  for (const monster of frame.scene.monsters) {
    pushMarker(
      items,
      frame,
      transform,
      monster.x + 0.5,
      monster.z + 0.5,
      LAND_2D_PALETTE.monster,
      "◆",
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
  for (const marker of frame.story === null ? [] : storyMarkers(frame.story)) {
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
        drawFallback(frame.ctx, cx, cy, transform.tileSize, prop.kind);
        return;
      }
      const scale = Math.max(0.65, Math.min(prop.scale, 2.2));
      const width = transform.tileSize * (asset.sw / 16) * scale;
      const height = transform.tileSize * (asset.sh / 16) * scale;
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

function pushActor(
  items: DrawItem[],
  frame: LandFrame,
  transform: ScreenTransform,
  x: number,
  z: number,
  asset: SpriteAsset | undefined,
): void {
  if (asset === undefined || !visible(transform, x, z, 2)) return;
  items.push({
    z,
    draw: () => {
      const [cx, cy] = toScreen(transform, x, z);
      drawSprite(
        frame.ctx,
        frame.atlases,
        asset,
        cx - transform.tileSize / 2,
        cy - transform.tileSize / 2,
        transform.tileSize,
        transform.tileSize,
      );
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

function drawPlayer(frame: LandFrame, transform: ScreenTransform): void {
  const { player, ctx, atlases, now } = frame;
  const [cx, cy] = toScreen(transform, player.x, player.z);
  const source = ACTOR_ASSETS.player;
  // Character sheets are one column per facing and one row per walk frame.
  const facingColumn = { south: 0, north: 16, west: 32, east: 48 }[player.facing];
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

function drawFallback(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tileSize: number,
  label: string,
): void {
  const size = tileSize * 0.55;
  ctx.fillStyle = LAND_2D_PALETTE.fallbackBody;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.fillStyle = LAND_2D_PALETTE.fallbackText;
  ctx.font = `${Math.max(8, Math.round(tileSize * 0.18))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.slice(0, 2), cx, cy);
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
