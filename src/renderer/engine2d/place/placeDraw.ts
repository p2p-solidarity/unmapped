// Drawing pieces both place views share, in the land's 16-bit look: the same sprite sheets, actor
// cells, walker and markers, with the canvas sized to the device's pixels. Rendering only — nothing
// here decides where anything stands.

import type { MonsterKind } from "@shared/world";
import { LAND_2D_PALETTE, MONSTER_LOOK } from "../../engine/palette";
import { PLACE_2D_PALETTE } from "../../engine/palette/place2d";
import type { Facing4 } from "../../engine/playerProbe";
import { ACTOR_ASSETS, type SpriteAsset } from "../assetCatalog";
import { SHOT_TRACE_MS, type SpriteAtlases } from "../canvasRenderer";

/** Walker sheet: one 16 px column per facing, one row per walk frame. */
const FACING_COLUMN: Record<Facing4, number> = { south: 0, north: 16, west: 32, east: 48 };
const WALK_FRAME_MS = 140;

/** Sizes the canvas backing store to its CSS box at the device's pixel ratio (at most 2). */
export function fitCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

export function drawSprite(
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

/** The top `share` of a sprite (0–1], drawn into the given box: a thin ledge, a low wall course. */
export function drawSpriteTop(
  ctx: CanvasRenderingContext2D,
  atlases: SpriteAtlases,
  asset: SpriteAsset,
  share: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const rows = Math.max(1, Math.round(asset.sh * Math.min(1, Math.max(0, share))));
  ctx.drawImage(atlases[asset.atlas], asset.sx, asset.sy, asset.sw, rows, dx, dy, dw, dh);
}

/** The player's walker, facing one of four ways, stepping while it walks. */
export function walkerSprite(facing: Facing4, stepping: boolean, now: number): SpriteAsset {
  const frame = stepping ? Math.floor(now / WALK_FRAME_MS) % 4 : 0;
  return { ...ACTOR_ASSETS.player, sx: FACING_COLUMN[facing], sy: frame * 16 };
}

/** A figure `size` px square whose feet stand at (cx, footY), with a shadow under it. */
export function drawFigure(
  ctx: CanvasRenderingContext2D,
  atlases: SpriteAtlases,
  asset: SpriteAsset,
  cx: number,
  footY: number,
  size: number,
  shadow = true,
): void {
  if (shadow) {
    ctx.fillStyle = PLACE_2D_PALETTE.shadow;
    ctx.beginPath();
    ctx.ellipse(cx, footY, size * 0.28, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  drawSprite(ctx, atlases, asset, cx - size / 2, footY - size, size, size);
}

/** A boxed glyph (a chest, a way out), the land's marker; faded once it has been used. */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  glyph: string,
  faded = false,
): void {
  ctx.save();
  if (faded) ctx.globalAlpha = 0.45;
  ctx.fillStyle = LAND_2D_PALETTE.markerSurface;
  ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
  ctx.strokeStyle = faded ? PLACE_2D_PALETTE.opened : color;
  ctx.lineWidth = Math.max(1, size / 12);
  ctx.strokeRect(cx - size / 2, cy - size / 2, size, size);
  ctx.fillStyle = faded ? PLACE_2D_PALETTE.opened : color;
  ctx.font = `${Math.round(size * 0.55)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, cy + 1);
  ctx.restore();
}

/** A way out standing on the ground: a door frame with its glyph (back to the land, or the end). */
export function drawDoor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  tileSize: number,
  color: string,
  glyph: string,
): void {
  const width = tileSize * 0.9;
  const height = tileSize * 1.6;
  ctx.fillStyle = PLACE_2D_PALETTE.doorSurface;
  ctx.fillRect(cx - width / 2, footY - height, width, height);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, tileSize / 14);
  ctx.strokeRect(cx - width / 2, footY - height, width, height);
  ctx.fillStyle = color;
  ctx.font = `${Math.round(tileSize * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, cx, footY - height / 2);
}

/** What a hostile has left, over its head: level, hit points and a bar. */
export function drawFoeLabel(
  ctx: CanvasRenderingContext2D,
  foe: { kind: MonsterKind; level: number; hp: number; maxHp: number },
  cx: number,
  topY: number,
  tileSize: number,
): void {
  const width = tileSize * 0.9;
  const bar = Math.max(3, tileSize / 12);
  ctx.fillStyle = PLACE_2D_PALETTE.hpTrack;
  ctx.fillRect(cx - width / 2, topY - bar, width, bar);
  ctx.fillStyle = PLACE_2D_PALETTE.hpLeft;
  ctx.fillRect(cx - width / 2, topY - bar, width * Math.max(0, foe.hp / foe.maxHp), bar);
  ctx.fillStyle = MONSTER_LOOK[foe.kind]?.color ?? LAND_2D_PALETTE.monster;
  ctx.font = `${Math.round(tileSize * 0.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(`Lv ${foe.level} · ${foe.hp}/${foe.maxHp}`, cx, topY - bar - 2);
}

/** A shot's streak, fading over the land's trace time; warm when it connected. */
export function drawShotLine(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  hit: boolean,
  age: number,
  tileSize: number,
): void {
  if (age < 0 || age > SHOT_TRACE_MS) return;
  ctx.save();
  ctx.globalAlpha = 1 - age / SHOT_TRACE_MS;
  ctx.strokeStyle = hit ? LAND_2D_PALETTE.shotHit : LAND_2D_PALETTE.shotMiss;
  ctx.lineWidth = Math.max(2, tileSize / 12);
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
  ctx.restore();
}

export function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  gradient.addColorStop(0, LAND_2D_PALETTE.vignetteClear);
  gradient.addColorStop(1, LAND_2D_PALETTE.vignetteEdge);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}
