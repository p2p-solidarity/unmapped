// The CC0 sprite sheets both land views draw from, loaded once as images.

import ninjaUrl from "../../assets/cc0/ninja_blue.png";
import samuraiBlueUrl from "../../assets/cc0/samurai_blue.png";
import samuraiGreenUrl from "../../assets/cc0/samurai_green.png";
import floorUrl from "../../assets/cc0/tileset_floor.png";
import villageUrl from "../../assets/cc0/tileset_village_abandoned.png";
import type { AtlasId } from "./assetCatalog";
import type { SpriteAtlases } from "./canvasRenderer";

let pending: Promise<SpriteAtlases> | null = null;

export function loadAtlases(): Promise<SpriteAtlases> {
  if (pending !== null) return pending;
  const sources: Record<AtlasId, string> = {
    floor: floorUrl,
    village: villageUrl,
    ninja: ninjaUrl,
    samuraiBlue: samuraiBlueUrl,
    samuraiGreen: samuraiGreenUrl,
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
