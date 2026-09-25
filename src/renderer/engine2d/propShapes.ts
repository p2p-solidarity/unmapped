// The 16-bit look's props that have no sprite in the atlases (torch, altar, well, statue, pillar),
// drawn from a few shapes in the land palette so they read as what they are — never a labelled box.
// Anchored like a sprite: (cx, cy) is the tile's centre, and the shape stands up from its base.

import type { PropKind } from "@shared/world";
import { LAND_2D_PALETTE as P } from "../engine/palette/land2d";

type Ctx = CanvasRenderingContext2D;

function block(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function shadow(ctx: Ctx, cx: number, base: number, half: number): void {
  ctx.fillStyle = P.propShadow;
  ctx.beginPath();
  ctx.ellipse(cx, base, half, half * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
}

function torch(ctx: Ctx, cx: number, base: number, u: number, now: number): void {
  shadow(ctx, cx, base, u * 2.5);
  block(ctx, cx - u, base - u * 9, u * 2, u * 9, P.propWood);
  block(ctx, cx - u * 1.5, base - u * 10, u * 3, u * 1.5, P.propStoneDark);
  // The flame breathes: three rows that shift a pixel as time passes.
  const flicker = Math.floor(now / 120) % 3;
  block(ctx, cx - u * 1.5, base - u * 13 + flicker * 0.3 * u, u * 3, u * 3, P.propFlame);
  block(ctx, cx - u * 0.75, base - u * 14.5, u * 1.5, u * 2, P.propFlameCore);
}

function altar(ctx: Ctx, cx: number, base: number, u: number): void {
  shadow(ctx, cx, base, u * 6);
  block(ctx, cx - u * 5, base - u * 5, u * 10, u * 5, P.propStone);
  block(ctx, cx - u * 6, base - u * 6.5, u * 12, u * 1.5, P.propStoneLight);
  block(ctx, cx - u * 5, base - u * 1, u * 10, u, P.propStoneDark);
}

function well(ctx: Ctx, cx: number, base: number, u: number): void {
  shadow(ctx, cx, base, u * 6);
  // Two posts and a little roof over a round stone lip with dark water inside.
  block(ctx, cx - u * 5, base - u * 12, u, u * 9, P.propWood);
  block(ctx, cx + u * 4, base - u * 12, u, u * 9, P.propWood);
  block(ctx, cx - u * 6, base - u * 13.5, u * 12, u * 1.5, P.propWoodDark);
  ctx.fillStyle = P.propStone;
  ctx.beginPath();
  ctx.ellipse(cx, base - u * 3, u * 5.5, u * 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = P.propWater;
  ctx.beginPath();
  ctx.ellipse(cx, base - u * 3.5, u * 3.8, u * 1.8, 0, 0, Math.PI * 2);
  ctx.fill();
}

function statue(ctx: Ctx, cx: number, base: number, u: number): void {
  shadow(ctx, cx, base, u * 4.5);
  block(ctx, cx - u * 4, base - u * 3, u * 8, u * 3, P.propStoneDark);
  // A standing figure: body, shoulders and head, lit from the upper left.
  block(ctx, cx - u * 2, base - u * 11, u * 4, u * 8, P.propStone);
  block(ctx, cx - u * 3, base - u * 11, u * 6, u * 1.5, P.propStone);
  block(ctx, cx - u * 1.5, base - u * 14, u * 3, u * 3, P.propStoneLight);
  block(ctx, cx - u * 2, base - u * 11, u, u * 8, P.propStoneLight);
}

function pillar(ctx: Ctx, cx: number, base: number, u: number): void {
  shadow(ctx, cx, base, u * 3.5);
  block(ctx, cx - u * 3, base - u * 2, u * 6, u * 2, P.propStoneDark);
  block(ctx, cx - u * 2, base - u * 16, u * 4, u * 14, P.propStone);
  block(ctx, cx - u * 2, base - u * 16, u, u * 14, P.propStoneLight);
  block(ctx, cx - u * 3, base - u * 17.5, u * 6, u * 1.5, P.propStoneLight);
}

/** Draws a prop the atlases have no sprite for; false when this kind has no shape either. */
export function drawPropShape(
  ctx: Ctx,
  kind: PropKind,
  cx: number,
  cy: number,
  tileSize: number,
  now: number,
): boolean {
  // One "pixel" of the 16-bit look: a tile is 16 of them.
  const u = tileSize / 16;
  const base = cy + tileSize * 0.4;
  switch (kind) {
    case "torch":
      torch(ctx, cx, base, u, now);
      return true;
    case "altar":
      altar(ctx, cx, base, u);
      return true;
    case "well":
      well(ctx, cx, base, u);
      return true;
    case "statue":
      statue(ctx, cx, base, u);
      return true;
    case "pillar":
      pillar(ctx, cx, base, u);
      return true;
    default:
      return false;
  }
}
