// A world's land drawn outside the desktop's Play (rev 6 phase 4, D7: the browser proof), as the
// single call that fills what `LandView2D` reads, with the land code's own seam:
//
//   - the land store: `applyWorld(instanceId, landFromHistory(now))`, `now` being the caller's own
//     fold of the world's history (there are no legacy chunks on a device that never had a save);
//   - the world store: the cartridge's entry scene and its rules (the pad's bindings read them);
//   - the session's instance: what LandView2D takes from a save — the seed `landSeedOf` hashes, where
//     to stand first — and the pinned revision (its story's gates).
//
// A page has no save, and an instance is the desktop's `ResolvedInstance` (meta, runtime pin, the
// whole save). So the instance set here carries only what LandView2D reads — `save.seed`,
// `save.cartridge`, `save.position`, and the revision — and is cast to that type. Nothing else in
// the browser page's module graph reads the session's instance; the desktop never calls this.
// (The cast would go if LandView2D took the seed, story and start as props; it sits at the line
// limit, so that waits for LandView2D's own split.)

import { serializeScene } from "@dsl";
import { useLandStore, useSessionStore, useWorldStore } from "@renderer/state";
import type {
  CartridgeRevision,
  ResolvedInstance,
  SavedPosition,
  SaveState,
} from "@shared/cartridge";
import type { GameplayRules } from "@shared/gameplay";
import type { WorldNow } from "@shared/history/types";
import { ready } from "@shared/result";
import type { SceneGraph } from "@shared/world";
import { landFromHistory } from "./landView";

/** What `landSeedOf` reads of a save: a world's `genesis.body.seed` and `genesis.body.cartridge`. */
export type LandSeedSource = Pick<SaveState, "seed" | "cartridge">;

export interface WorldLandFrame {
  /** The scene's rules (`rulesForSceneContext`), as the desktop hydrates them. */
  rules: GameplayRules;
  /** The revision the world pins (its story's gates are drawn). */
  revision: CartridgeRevision;
  /** Where this device last stood (honoured only in `scene`), or null. */
  position: SavedPosition | null;
}

/** The instance this page holds for `instanceId`, so a fold does not replace it. */
let held: { instanceId: string; instance: ResolvedInstance } | null = null;

function landInstance(seed: LandSeedSource, frame: WorldLandFrame): ResolvedInstance {
  const save: Partial<SaveState> = {
    seed: seed.seed,
    cartridge: seed.cartridge,
    ...(frame.position === null ? {} : { position: frame.position }),
  };
  // Partial by design (see the header): only the fields LandView2D reads are present.
  return { instance: { save }, cartridge: frame.revision } as unknown as ResolvedInstance;
}

/**
 * Puts the land of world `instanceId` as `now` says it is on the stores LandView2D reads. Called on
 * every fold change; the scene, rules and instance are set only when they differ from what is held.
 */
export function showWorldLand(
  instanceId: string,
  now: WorldNow,
  scene: SceneGraph,
  seedSource: LandSeedSource,
  frame: WorldLandFrame,
): void {
  if (useLandStore.getState().instanceId !== instanceId) {
    useLandStore.getState().beginLoad(instanceId);
  }
  useLandStore.getState().applyWorld(instanceId, landFromHistory(now));
  const world = useWorldStore.getState();
  if (world.scene.status !== "ready" || world.scene.value !== scene) {
    world.setScene(serializeScene(scene), ready(scene));
  }
  if (world.gameplayRules !== frame.rules) world.setGameplayRules(frame.rules);
  const session = useSessionStore.getState();
  if (
    held === null ||
    held.instanceId !== instanceId ||
    session.activeInstance !== held.instance ||
    held.instance.cartridge !== frame.revision
  ) {
    held = { instanceId, instance: landInstance(seedSource, frame) };
    session.setActiveInstance(held.instance);
  }
}

/** Takes the land off the stores again (the world is closed or another one opens). */
export function hideWorldLand(): void {
  held = null;
  useSessionStore.getState().setActiveInstance(null);
  useWorldStore.getState().unload();
  useLandStore.getState().reset();
}
