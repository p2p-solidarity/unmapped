// Brings an instance's witnessed land into the land store. A save with open land plays on its
// world's history (rev 6 phase 3, D6): `world.ensure` migrates it once (lazily, never touching its
// legacy files), then the land is a view of the history's fold (renderer/history). A save without
// open land keeps reading its legacy files, which is all it ever had.

import { endWorld, loadLegacyLand, openWorldLand } from "@renderer/history";
import { useLandStore } from "@renderer/state";

export async function loadLand(instanceId: string, openLand = true): Promise<void> {
  if (openLand) {
    await openWorldLand(instanceId);
    return;
  }
  endWorld();
  useLandStore.getState().beginLoad(instanceId);
  await loadLegacyLand(instanceId);
}
