// The one game (plan.md §1): every seed is a land of this cartridge. It ships with the app as
// content (`aether-land.json`, built by scripts/build-base-game.mjs) and is installed like any other
// revision — validated, hashed, immutable. Installing an identical revision again is a no-op.

import type { CartridgeManifest } from "@shared/cartridge";
import { IPC } from "@shared/ipc";
import { err, type Result } from "@shared/result";
import { z } from "zod";
import { publishCartridgeInputSchema } from "../cartridges/schemas";
import { publishCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import baseGame from "./aether-land.json";

/** One install at a time: the title screen can ask twice before the first answer arrives. */
let installing: Promise<Result<CartridgeManifest>> | null = null;

export function ensureBaseGame(cartridgesDir: string): Promise<Result<CartridgeManifest>> {
  installing ??= install(cartridgesDir).finally(() => {
    installing = null;
  });
  return installing;
}

async function install(cartridgesDir: string): Promise<Result<CartridgeManifest>> {
  const parsed = publishCartridgeInputSchema.safeParse(baseGame);
  if (!parsed.success) {
    return err(
      "base-game-invalid",
      `The built-in game does not match the cartridge format: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      "Rebuild it with scripts/build-base-game.mjs.",
    );
  }
  return publishCartridgeRevision(cartridgesDir, parsed.data);
}

export function registerGameIpc(ctx: MainContext): void {
  handle(IPC.game.base, z.tuple([]), () => ensureBaseGame(ctx.cartridgesDir));
}
