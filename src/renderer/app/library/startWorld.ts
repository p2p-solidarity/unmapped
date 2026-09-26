// Starting a world from the library, in one place: a new adventure on the built-in world (row 0 of
// My worlds, and Join a world when the player has no world to bring yet), and a fresh start of any
// other installed world. Nothing here needs a model: the land is generated from the seed.

import { contentLanguage } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import type { CartridgeManifest } from "@shared/cartridge";
import { ok, type Result } from "@shared/result";
import { formatSeedCode, randomSeedCode } from "@shared/seedCode";
import { hydrateInstance } from "../useInstanceLoader";

/**
 * A new save of the built-in world: its land from `seed` (a fresh one unless the player typed
 * one), written in `language` (the UI's unless picked). Resolves with the new save's id.
 */
export async function newAdventure(
  manifest: CartridgeManifest,
  seed: string = randomSeedCode(),
  language: string = contentLanguage(),
): Promise<Result<string>> {
  const created = await window.seed.instances.create({
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    name: `${manifest.name} · ${formatSeedCode(seed)}`,
    seed,
    language,
  });
  return created.ok ? ok(created.value.instance.meta.instanceId) : created;
}

/** A new adventure with the built-in world installed (and read) first. */
export async function newBuiltInAdventure(): Promise<Result<string>> {
  const base = await window.seed.game.base();
  return base.ok ? newAdventure(base.value) : base;
}

/** Starts an installed world from the beginning (a new save of it) and enters Play. */
export async function playWorld(manifest: CartridgeManifest): Promise<Result<void>> {
  const created = await window.seed.instances.create({
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    name: manifest.name,
  });
  if (!created.ok) return created;
  const hydrated = hydrateInstance(created.value);
  if (!hydrated.ok) return hydrated;
  useSessionStore.getState().setScreen("play");
  return ok(undefined);
}
