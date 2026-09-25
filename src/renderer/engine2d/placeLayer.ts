// Places on the 2D land: an entrance per course, dungeon or otherworld (glyph and colour by kind, a
// check once crossed; an otherworld also turns a rift on the ground under it) and the interaction
// target that walks into it.

import { type LandPlace, type PlaceKind, placeGate, placeTarget } from "@shared/places";
import { LAND_2D_PALETTE } from "../engine/palette";
import type { TargetPoint } from "../engine/targets";
import type { StoryMarker } from "./storyLayer";

export interface PlaceMarker extends StoryMarker {
  /** An otherworld (異界): drawn over a rift ring, in both land looks. */
  portal: boolean;
}

const PLACE_COLOR: Record<PlaceKind, string> = {
  side: LAND_2D_PALETTE.placeSide,
  dungeon: LAND_2D_PALETTE.placeDungeon,
  otherworld: LAND_2D_PALETTE.placeOtherworld,
};

const PLACE_GLYPH: Record<PlaceKind, string> = { side: "➜", dungeon: "▼", otherworld: "異" };

export function placeMarkers(places: readonly LandPlace[]): PlaceMarker[] {
  return places.map((place) => ({
    ...placeGate(place),
    color: place.cleared ? LAND_2D_PALETTE.episodeCleared : PLACE_COLOR[place.kind],
    glyph: place.cleared ? "✓" : PLACE_GLYPH[place.kind],
    label: place.title,
    portal: place.kind === "otherworld",
  }));
}

export function placeTargets(places: readonly LandPlace[]): TargetPoint[] {
  return places.map((place) => ({
    kind: "place",
    id: placeTarget(place.id),
    label: place.title,
    ...placeGate(place),
    reach: 0.8,
  }));
}

/** The 16-bit look's rift under an otherworld's entrance: a glow and a dashed ring that turns. */
export function drawRift(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tileSize: number,
  now: number,
): void {
  const seconds = now / 1000;
  const rx = tileSize * (0.66 + 0.05 * Math.sin(seconds * 2.4));
  const ry = rx * 0.48;
  const y = cy + tileSize * 0.22;
  ctx.save();
  ctx.fillStyle = LAND_2D_PALETTE.otherworldGlow;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = LAND_2D_PALETTE.placeOtherworld;
  ctx.lineWidth = Math.max(1, tileSize / 14);
  ctx.setLineDash([tileSize * 0.2, tileSize * 0.12]);
  ctx.lineDashOffset = -seconds * tileSize * 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
