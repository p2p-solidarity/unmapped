// Places on the 2D land: an entrance per course or dungeon (glyph by kind, a check once crossed)
// and the interaction target that walks into it.

import { type LandPlace, placeGate, placeTarget } from "@shared/places";
import { LAND_2D_PALETTE } from "../engine/palette";
import type { TargetPoint } from "../engine/targets";
import type { StoryMarker } from "./storyLayer";

export function placeMarkers(places: readonly LandPlace[]): StoryMarker[] {
  return places.map((place) => ({
    ...placeGate(place),
    color: place.cleared
      ? LAND_2D_PALETTE.episodeCleared
      : place.kind === "side"
        ? LAND_2D_PALETTE.placeSide
        : LAND_2D_PALETTE.placeDungeon,
    glyph: place.cleared ? "✓" : place.kind === "side" ? "➜" : "▼",
    label: place.title,
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
