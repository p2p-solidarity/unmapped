import { join } from "node:path";

const CARTRIDGE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const SCENE_ID = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const STRICT_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function isCartridgeId(value: string): boolean {
  return CARTRIDGE_ID.test(value);
}

export function isSceneId(value: string): boolean {
  return SCENE_ID.test(value);
}

export function isCartridgeVersion(value: string): boolean {
  return STRICT_SEMVER.test(value);
}

export function cartridgeDir(cartridgesDir: string, cartridgeId: string): string {
  return join(cartridgesDir, cartridgeId);
}

export function cartridgeRevisionDir(
  cartridgesDir: string,
  cartridgeId: string,
  version: string,
): string {
  return join(cartridgeDir(cartridgesDir, cartridgeId), version);
}

export function cartridgeScenePath(revisionDir: string, sceneId: string): string {
  return join(revisionDir, "scenes", `${sceneId}.oui`);
}
