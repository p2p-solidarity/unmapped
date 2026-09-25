// The sprite sheets both land views draw from, loaded once as images: the CC0 ground, village and
// player sheets, and the image-model sheet of residents and monsters (scripts/gen-sprites.ts).

import ninjaUrl from "../../assets/cc0/ninja_blue.png";
import floorUrl from "../../assets/cc0/tileset_floor.png";
import villageUrl from "../../assets/cc0/tileset_village_abandoned.png";
import actorsUrl from "../../assets/generated/actors.png";
import boilerUrl from "../../assets/generated/props/boiler.png";
import breakwaterUrl from "../../assets/generated/props/breakwater.png";
import busStopUrl from "../../assets/generated/props/bus_stop.png";
import chimneyUrl from "../../assets/generated/props/chimney.png";
import conveyorUrl from "../../assets/generated/props/conveyor.png";
import craneUrl from "../../assets/generated/props/crane.png";
import machineGearUrl from "../../assets/generated/props/machine_gear.png";
import pipeStackUrl from "../../assets/generated/props/pipe_stack.png";
import railTrackUrl from "../../assets/generated/props/rail_track.png";
import reactorUrl from "../../assets/generated/props/reactor.png";
import signpostUrl from "../../assets/generated/props/signpost.png";
import steelTowerUrl from "../../assets/generated/props/steel_tower.png";
import utilityPoleUrl from "../../assets/generated/props/utility_pole.png";
import vendingMachineUrl from "../../assets/generated/props/vending_machine.png";
import windmillUrl from "../../assets/generated/props/windmill.png";
import { type AtlasId, GENERATED_PROP_KINDS } from "./assetCatalog";
import type { SpriteAtlases } from "./canvasRenderer";

let pending: Promise<SpriteAtlases> | null = null;

const generatedSources: Record<(typeof GENERATED_PROP_KINDS)[number], string> = {
  utility_pole: utilityPoleUrl,
  vending_machine: vendingMachineUrl,
  bus_stop: busStopUrl,
  rail_track: railTrackUrl,
  chimney: chimneyUrl,
  steel_tower: steelTowerUrl,
  windmill: windmillUrl,
  breakwater: breakwaterUrl,
  signpost: signpostUrl,
  machine_gear: machineGearUrl,
  conveyor: conveyorUrl,
  boiler: boilerUrl,
  pipe_stack: pipeStackUrl,
  crane: craneUrl,
  reactor: reactorUrl,
};

export function loadAtlases(): Promise<SpriteAtlases> {
  if (pending !== null) return pending;
  const sources: Record<Exclude<AtlasId, "generated">, string> = {
    floor: floorUrl,
    village: villageUrl,
    ninja: ninjaUrl,
    actors: actorsUrl,
  };
  pending = Promise.all([
    Promise.all(
      Object.entries(sources).map(async ([id, url]) => [id, await loadImage(url)] as const),
    ),
    loadGeneratedAtlas(),
  ]).then(
    ([entries, generated]) =>
      Object.fromEntries([...entries, ["generated", generated]]) as SpriteAtlases,
  );
  // A failed load must be retryable, not cached forever.
  pending.catch(() => {
    pending = null;
  });
  return pending;
}

async function loadGeneratedAtlas(): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 384;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new Error("Could not prepare generated prop atlas");
  const images = await Promise.all(
    GENERATED_PROP_KINDS.map((kind) => loadImage(generatedSources[kind])),
  );
  for (const [index, image] of images.entries()) {
    const scratch = document.createElement("canvas");
    scratch.width = image.naturalWidth;
    scratch.height = image.naturalHeight;
    const source = scratch.getContext("2d", { willReadFrequently: true });
    if (source === null) throw new Error("Could not read generated prop");
    source.drawImage(image, 0, 0);
    const alpha = source.getImageData(0, 0, scratch.width, scratch.height).data;
    let left = scratch.width;
    let top = scratch.height;
    let right = 0;
    let bottom = 0;
    for (let y = 0; y < scratch.height; y++) {
      for (let x = 0; x < scratch.width; x++) {
        if ((alpha[(y * scratch.width + x) * 4 + 3] ?? 0) <= 8) continue;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x + 1);
        bottom = Math.max(bottom, y + 1);
      }
    }
    if (right <= left || bottom <= top) continue;
    const width = right - left;
    const height = bottom - top;
    const size = 88 / Math.max(width, height);
    const dw = width * size;
    const dh = height * size;
    const cellX = (index % 4) * 96;
    const cellY = Math.floor(index / 4) * 96;
    ctx.drawImage(image, left, top, width, height, cellX + (96 - dw) / 2, cellY + 92 - dh, dw, dh);
  }
  return canvas;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}
