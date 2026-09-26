// Whether the world being played is open land (a place on it counts: the world is still open land
// while the player is inside one). Read from the scene and its rules, not from the engine's chunk,
// which is only set once the land view has drawn its first frame.

import { isOpenLand2D } from "@renderer/engine2d";
import { useSessionStore, useWorldStore } from "@renderer/state";

export function useOpenLand(): boolean {
  const scene = useWorldStore((state) => state.scene);
  const rules = useWorldStore((state) => state.gameplayRules);
  const inPlace = useSessionStore((state) => state.place !== null);
  return inPlace || (scene.status === "ready" && isOpenLand2D(scene.value, rules));
}
