// The one game (plan.md §1): every seed is a land of this cartridge. It ships with the app as
// content (`aether-land-<version>.json`, built by scripts/build-base-game.mjs) and is installed like
// any other revision — validated, hashed, immutable. Installing an identical revision again is a
// no-op. Every shipped revision is installed, oldest first, so a save or a backup pinned to an older
// one still opens on a new machine; a new game starts on the newest.

import type { CartridgeManifest } from "@shared/cartridge";
import { IPC } from "@shared/ipc";
import { err, type Result } from "@shared/result";
import { z } from "zod";
import { publishCartridgeInputSchema } from "../cartridges/schemas";
import { publishCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import v100 from "./aether-land-1.0.0.json";
import v110 from "./aether-land-1.1.0.json";
import v120 from "./aether-land-1.2.0.json";
import v130 from "./aether-land-1.3.0.json";

/** Oldest first; the last one is what New Game starts on. Never drop an entry. */
const SHIPPED: readonly unknown[] = [v100, v110, v120, v130];

/** One install at a time: the title screen can ask twice before the first answer arrives. */
let installing: Promise<Result<CartridgeManifest>> | null = null;

export function ensureBaseGame(cartridgesDir: string): Promise<Result<CartridgeManifest>> {
  installing ??= install(cartridgesDir).finally(() => {
    installing = null;
  });
  return installing;
}

async function install(cartridgesDir: string): Promise<Result<CartridgeManifest>> {
  let newest: Result<CartridgeManifest> = err("base-game-invalid", "No built-in game is shipped.");
  for (const revision of SHIPPED) {
    const parsed = publishCartridgeInputSchema.safeParse(revision);
    if (!parsed.success) {
      return err(
        "base-game-invalid",
        `The built-in game does not match the cartridge format: ${parsed.error.issues[0]?.message ?? "invalid"}`,
        "Rebuild it with scripts/build-base-game.mjs.",
      );
    }
    newest = await publishCartridgeRevision(cartridgesDir, parsed.data);
    if (!newest.ok) return newest;
  }
  return newest;
}

export function registerGameIpc(ctx: MainContext): void {
  handle(IPC.game.base, z.tuple([]), () => ensureBaseGame(ctx.cartridgesDir));
}
