// Other worlds on a continent, as the land draws them (plan.md §8): an offset marker where each
// world's (0, 0) tile lies — its owner, its name and its offset — and its home door, which can be
// walked up to and used. Labels are names and numbers only, so nothing here needs translating.

import type { ChunkStatus, ForeignWorld } from "@renderer/state";
import type { ChunkCoord } from "@shared/chunks";
import type { TerritoryMap } from "@shared/continent";
import type { LandNote } from "@shared/land";
import { foreignDoorId } from "../engine/home";
import { LAND_2D_PALETTE } from "../engine/palette";
import type { TargetPoint } from "../engine/targets";
import type { StoryMarker } from "./storyLayer";

export interface ContinentDecor {
  /** This world's own offset, or null when it is not merged. */
  anchor: ChunkCoord | null;
  /** What this player is called (for this world's own offset marker). */
  self: string;
  worlds: readonly ForeignWorld[];
}

function offset(anchor: ChunkCoord): string {
  return `(${anchor.cx}, ${anchor.cz})`;
}

export function continentMarkers(decor: ContinentDecor | null): StoryMarker[] {
  if (decor === null || decor.anchor === null) return [];
  const markers: StoryMarker[] = [
    {
      x: 0.5,
      z: 0.5,
      color: LAND_2D_PALETTE.continent,
      glyph: "◎",
      label: decor.self === "" ? offset(decor.anchor) : `${decor.self} · ${offset(decor.anchor)}`,
    },
  ];
  for (const world of decor.worlds) {
    markers.push({
      x: world.originTile.x + 0.5,
      z: world.originTile.z + 0.5,
      color: LAND_2D_PALETTE.continent,
      glyph: world.online ? "◎" : "○",
      label: `${world.owner} · ${world.title} · ${offset(world.anchor)}`,
    });
    markers.push({
      x: world.door.x,
      z: world.door.z,
      color: LAND_2D_PALETTE.door,
      glyph: "門",
      label: world.owner,
    });
  }
  return markers;
}

export function continentTargets(worlds: readonly ForeignWorld[]): TargetPoint[] {
  return worlds.map((world) => ({
    kind: "door",
    id: foreignDoorId(world.worldId),
    label: world.owner,
    x: world.door.x,
    z: world.door.z,
    reach: 0.5,
  }));
}

/**
 * This world's chunks where they are still its own, plus the other worlds' chunks on their
 * territory. A chunk this world wrote that now lies on someone else's territory is not shown while
 * merged (it is still in the save, and comes back on leaving).
 */
export function mergeChunks(
  own: Readonly<Record<string, ChunkStatus>>,
  foreign: Readonly<Record<string, ChunkStatus>>,
  land: TerritoryMap | null,
): Readonly<Record<string, ChunkStatus>> {
  if (land === null) return own;
  const out: Record<string, ChunkStatus> = {};
  for (const [key, chunk] of Object.entries(own)) {
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    if (land.at({ cx, cz }) === null) out[key] = chunk;
  }
  return { ...out, ...foreign };
}

export function mergeNotes(
  own: readonly LandNote[],
  foreign: readonly LandNote[],
  land: TerritoryMap | null,
): readonly LandNote[] {
  if (land === null) return own;
  return [...own.filter((note) => land.at(note.coord) === null), ...foreign];
}
