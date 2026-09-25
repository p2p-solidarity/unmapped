// The host's CC0 image library, resolved to files electron-vite ships with the app. Only the paths
// declared in `WORK_LIBRARY` exist; a world can never name any other file on disk.

import { readFile } from "node:fs/promises";
import type { LibraryPath } from "@shared/works";
import heart from "../../assets/cc0/heart.png?asset";
import ninjaBlue from "../../assets/cc0/ninja_blue.png?asset";
import samuraiBlue from "../../assets/cc0/samurai_blue.png?asset";
import samuraiGreen from "../../assets/cc0/samurai_green.png?asset";
import tilesetFloor from "../../assets/cc0/tileset_floor.png?asset";
import tilesetVillage from "../../assets/cc0/tileset_village_abandoned.png?asset";

const FILES: Record<LibraryPath, string> = {
  "library/ninja_blue.png": ninjaBlue,
  "library/samurai_blue.png": samuraiBlue,
  "library/samurai_green.png": samuraiGreen,
  "library/heart.png": heart,
  "library/tileset_floor.png": tilesetFloor,
  "library/tileset_village_abandoned.png": tilesetVillage,
};

const cache = new Map<LibraryPath, Uint8Array>();

export async function readLibrary(path: LibraryPath): Promise<Uint8Array | null> {
  const hit = cache.get(path);
  if (hit !== undefined) return hit;
  try {
    const bytes = new Uint8Array(await readFile(FILES[path]));
    cache.set(path, bytes);
    return bytes;
  } catch {
    return null;
  }
}
