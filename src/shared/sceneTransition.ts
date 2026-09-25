import type { SaveState } from "./cartridge";
import { err, ok, type Result } from "./result";
import { EMPTY_INVENTORY, type SceneGraph } from "./world";

function missing(values: readonly string[], available: ReadonlySet<string>): string[] {
  return values.filter((value) => !available.has(value));
}

function grant(save: SaveState, contract: { grantsFlags: string[] }): SaveState["flags"] {
  const flags = { ...save.flags };
  for (const key of contract.grantsFlags) flags[key] = true;
  return flags;
}

/**
 * Completes a terminal scene: the cartridge's ending. Grants the scene's flags and records the
 * scene as completed without moving the checkpoint, so resuming lands in the finale again.
 */
export function completeScene(
  save: SaveState,
  scene: SceneGraph,
  now: Date = new Date(),
): Result<SaveState> {
  const contract = scene.contract;
  if (contract === null) {
    return err(
      "scene-contract-missing",
      "A published scene is missing its transition contract.",
      "Repair or reinstall the cartridge before continuing.",
    );
  }
  if (save.currentSceneId !== contract.sceneId) {
    return err(
      "scene-save-mismatch",
      "The loaded scene does not match the current save checkpoint.",
      "Reload the instance from its pinned cartridge revision.",
    );
  }
  if (!contract.terminal) {
    return err(
      "scene-not-terminal",
      `${contract.sceneId} is not a terminal scene, so it cannot end the cartridge.`,
      "Leave through an Exit whose targetSceneId names the next scene.",
    );
  }
  return ok({
    ...save,
    flags: grant(save, contract),
    completedSceneIds: [...new Set([...save.completedSceneIds, contract.sceneId])],
    updatedAt: now.toISOString(),
  });
}

/** Applies one deterministic, offline scene boundary without mutating cartridge content. */
export function transitionScene(
  save: SaveState,
  from: SceneGraph,
  target: SceneGraph,
  now: Date = new Date(),
): Result<SaveState> {
  const sourceContract = from.contract;
  const targetContract = target.contract;
  if (sourceContract === null || targetContract === null) {
    return err(
      "scene-contract-missing",
      "A published scene is missing its transition contract.",
      "Repair or reinstall the cartridge before continuing.",
    );
  }
  if (save.currentSceneId !== sourceContract.sceneId) {
    return err(
      "scene-save-mismatch",
      "The loaded scene does not match the current save checkpoint.",
      "Reload the instance from its pinned cartridge revision.",
    );
  }
  if (!from.exits.some((exit) => exit.targetSceneId === targetContract.sceneId)) {
    return err(
      "scene-transition-denied",
      `${sourceContract.sceneId} has no exit to ${targetContract.sceneId}.`,
      "Use a destination declared by this scene's Exit.targetSceneId.",
    );
  }

  const flags = grant(save, sourceContract);
  const missingFlags = missing(
    targetContract.requiresFlags,
    new Set(
      Object.entries(flags)
        .filter(([, value]) => value === true)
        .map(([key]) => key),
    ),
  );
  const missingItems = missing(
    targetContract.requiresItems,
    new Set(save.inventory.items.map((item) => item.id)),
  );
  if (missingFlags.length > 0 || missingItems.length > 0) {
    const requirements = [...missingFlags, ...missingItems].join(", ");
    return err(
      "scene-prerequisite-missing",
      `Cannot enter ${targetContract.sceneId}; missing ${requirements}.`,
      "Complete the required objective or collect the required item first.",
    );
  }

  const inventory =
    targetContract.inventoryPolicy === "reset"
      ? { items: [...EMPTY_INVENTORY.items], materials: [...EMPTY_INVENTORY.materials] }
      : save.inventory;
  return ok({
    ...save,
    currentSceneId: targetContract.sceneId,
    flags,
    inventory,
    completedSceneIds: [...new Set([...save.completedSceneIds, sourceContract.sceneId])],
    updatedAt: now.toISOString(),
  });
}
