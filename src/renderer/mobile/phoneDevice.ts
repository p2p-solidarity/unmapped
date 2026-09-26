// What the mobile shell needs from the page it runs in, beyond `window.seed.world` (rev 6 phase 4,
// D7): the world's land as its genesis pack says it is, and a place to keep where the player stood.
// The page (src/browser) implements it over IndexedDB and hands it to the shell as a prop, so this
// renderer module never imports the page (Rule 8: `browser` may import `renderer`, never back).

import type { CartridgeRevision, SavedPosition } from "@shared/cartridge";
import type { GameplayRules } from "@shared/gameplay";
import { type AppError, fail, type Result } from "@shared/result";
import type { SceneGraph } from "@shared/world";

/** One world's land on this device: its pack's entry scene as the land runs it. */
export interface PhoneLand {
  /** The genesis pack, unpacked and checked against the world's genesis and `pack` event. */
  revision: CartridgeRevision;
  /** Its entry scene with the kit its frozen capability context selects (as the desktop runs it). */
  graph: SceneGraph;
  rules: GameplayRules;
  /** Where this device last stood in this world, or null the first time. */
  position: SavedPosition | null;
}

export interface PhoneDevice {
  /** The world's land: from the pack kept on this device, else fetched by hash when online. */
  land(worldId: string): Promise<Result<PhoneLand>>;
  /** Keeps where the player stands; device only (presence is the one thing that sends it). */
  keepPosition(worldId: string, position: SavedPosition): Promise<Result<void>>;
}

/** A device that cannot keep anything (no storage): every call says why (Rule 2). */
export function failingDevice(error: AppError): PhoneDevice {
  return {
    land: async () => fail(error),
    keepPosition: async () => fail(error),
  };
}
