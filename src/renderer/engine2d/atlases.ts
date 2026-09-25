// The sprite sheets both land views draw from, loaded once as images: the CC0 ground, village and
// player sheets, and the image-model sheet of residents and monsters (scripts/gen-sprites.ts).

import ninjaUrl from "../../assets/cc0/ninja_blue.png";
import floorUrl from "../../assets/cc0/tileset_floor.png";
import villageUrl from "../../assets/cc0/tileset_village_abandoned.png";
import actorsUrl from "../../assets/generated/actors.png";
import type { AtlasId } from "./assetCatalog";
import type { SpriteAtlases } from "./canvasRenderer";

let pending: Promise<SpriteAtlases> | null = null;

export function loadAtlases(): Promise<SpriteAtlases> {
  if (pending !== null) return pending;
  const sources: Record<AtlasId, string> = {
    floor: floorUrl,
    village: villageUrl,
    ninja: ninjaUrl,
    actors: actorsUrl,
  };
  pending = Promise.all(
    Object.entries(sources).map(async ([id, url]) => [id, await loadImage(url)] as const),
  ).then((entries) => Object.fromEntries(entries) as SpriteAtlases);
  // A failed load must be retryable, not cached forever.
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}
