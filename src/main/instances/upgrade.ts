// Explicit upgrade of a playthrough to another installed version of its cartridge (plan §一: a new
// release never silently touches a running instance). The active save is snapshotted first, the
// target is verified by hash and engine API, and Phase A refuses any save-schema change.

import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  type CartridgeRef,
  compareCartridgeVersions,
  type ResolvedInstance,
} from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { deriveRuntimePin } from "../cartridges/integrity";
import { cartridgeCompatibility, readCartridgeRevision } from "../cartridges/store";
import { instanceDir, saveDir } from "./paths";
import { readInstance, writeInstanceSave } from "./store";

const BACKUPS_DIR = "backups";

function stamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

export async function upgradeInstance(
  cartridgesDir: string,
  instancesDir: string,
  instanceId: string,
  version: string,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
  if (!instance.ok) return instance;
  const { meta, save } = instance.value;
  const current = meta.cartridge;
  if (compareCartridgeVersions(version, current.version) <= 0) {
    return err(
      "upgrade-version-not-newer",
      `${current.cartridgeId}@${version} is not newer than the pinned ${current.version}.`,
      "Choose a newer installed revision.",
    );
  }
  const target = await readCartridgeRevision(cartridgesDir, current.cartridgeId, version);
  if (!target.ok) return target;
  const manifest = target.value.manifest;
  const compatibility = cartridgeCompatibility(manifest);
  if (!compatibility.ok) return compatibility;
  if (manifest.saveSchemaVersion !== save.saveSchemaVersion) {
    return err(
      "save-schema-mismatch",
      `${current.cartridgeId}@${version} expects save schema ${manifest.saveSchemaVersion}; this save is ${save.saveSchemaVersion}.`,
      "This build refuses schema changes; keep playing the pinned version until a migration exists.",
    );
  }
  if (target.value.scenes[save.currentSceneId] === undefined) {
    return err(
      "upgrade-scene-missing",
      `${current.cartridgeId}@${version} no longer has scene ${save.currentSceneId}.`,
      "Finish or leave the current scene on the pinned version, then upgrade.",
    );
  }
  const nextPin = deriveRuntimePin(manifest);
  if (!nextPin.ok) return nextPin;
  if (nextPin.value.profileHash !== meta.runtimePin.profileHash) {
    return err(
      "upgrade-runtime-migration-required",
      `${current.cartridgeId}@${version} changes the pinned runtime contract.`,
      "Create a fresh instance for this revision; no runtime migration is available.",
    );
  }
  const snapshot = join(
    instanceDir(instancesDir, instanceId),
    BACKUPS_DIR,
    `${current.version}-${stamp(now)}`,
  );
  try {
    await mkdir(snapshot, { recursive: true });
    await cp(saveDir(instancesDir, instanceId, meta.activeSaveId), snapshot, { recursive: true });
  } catch (error) {
    return fail(toError(error, "upgrade-snapshot-failed"));
  }
  const next: CartridgeRef = {
    cartridgeId: manifest.cartridgeId,
    version: manifest.version,
    contentHash: manifest.contentHash,
  };
  const written = await writeInstanceSave(
    instancesDir,
    {
      instance: {
        ...instance.value,
        meta: { ...meta, cartridge: next, runtimePin: nextPin.value },
      },
      cartridge: target.value,
    },
    {
      ...save,
      cartridge: next,
      runtimePin: nextPin.value,
      updatedAt: now.toISOString(),
    },
  );
  return written.ok ? ok(written.value) : written;
}
