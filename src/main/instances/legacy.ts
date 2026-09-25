// Saves written before runtime pins existed (instance and save format 1, until 8d67e09): the same
// fields as today minus `runtimePin`, and saves without `player`/`party`. They are upgraded when
// read: the pin is derived from the exact cartridge revision the save already names (installed
// with the same hash), `player`/`party` start empty, nothing else changes. The upgrade is pure;
// the files on disk stay as they are until the next ordinary save writes the current format.

import {
  type CartridgeManifest,
  INSTANCE_FORMAT_VERSION,
  type InstanceMeta,
  LEGACY_INSTANCE_FORMAT_VERSION,
  LEGACY_SAVE_FORMAT_VERSION,
  SAVE_FORMAT_VERSION,
  type SaveState,
} from "@shared/cartridge";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import { deriveRuntimePin } from "../cartridges/integrity";
import { cartridgeRefSchema } from "../cartridges/schemas";
import { inventorySchema, worldFlagsSchema } from "../worlds/schemas";
import { instanceMetaSchema, mutationSchema, saveStateSchema } from "./schemas";

export const legacyInstanceMetaSchema = z
  .object({
    formatVersion: z.literal(LEGACY_INSTANCE_FORMAT_VERSION),
    instanceId: z.string().min(1).max(96),
    name: z.string().trim().min(1).max(120),
    cartridge: cartridgeRefSchema,
    activeSaveId: z.string().min(1).max(64),
    saveSchemaVersion: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const legacySaveStateSchema = z
  .object({
    formatVersion: z.literal(LEGACY_SAVE_FORMAT_VERSION),
    instanceId: z.string().min(1).max(96),
    cartridge: cartridgeRefSchema,
    saveSchemaVersion: z.number().int().min(1),
    currentSceneId: z.string().min(1).max(80),
    flags: worldFlagsSchema,
    inventory: inventorySchema,
    mutation: mutationSchema.nullable(),
    completedSceneIds: z.array(z.string().min(1).max(80)).max(256),
    updatedAt: z.string().min(1),
  })
  .strict();

function issue(file: string, error: z.ZodError): string {
  const first = error.issues[0];
  return `${file}: ${first?.path.join(".") || "root"} — ${first?.message ?? "invalid"}`;
}

/** A format 1 instance and its active save, in the current format, pinned to `manifest`. */
export function upgradeLegacyInstance(
  rawMeta: unknown,
  rawSave: unknown,
  manifest: CartridgeManifest,
): Result<{ meta: InstanceMeta; save: SaveState }> {
  const meta = legacyInstanceMetaSchema.safeParse(rawMeta);
  if (!meta.success) return err("instance-invalid", issue("instance.json", meta.error));
  const save = legacySaveStateSchema.safeParse(rawSave);
  if (!save.success) return err("save-invalid", issue("save.json", save.error));
  const ref = meta.data.cartridge;
  const same = (other: typeof ref): boolean =>
    other.cartridgeId === ref.cartridgeId &&
    other.version === ref.version &&
    other.contentHash === ref.contentHash;
  if (
    !same(save.data.cartridge) ||
    !same({
      cartridgeId: manifest.cartridgeId,
      version: manifest.version,
      contentHash: manifest.contentHash,
    })
  ) {
    return err(
      "save-identity-mismatch",
      "The older save does not belong to this instance and cartridge.",
    );
  }
  const pin = deriveRuntimePin(manifest);
  if (!pin.ok) return pin;
  const { formatVersion: _metaVersion, ...metaRest } = meta.data;
  const { formatVersion: _saveVersion, ...saveRest } = save.data;
  const upgradedMeta = instanceMetaSchema.safeParse({
    formatVersion: INSTANCE_FORMAT_VERSION,
    ...metaRest,
    runtimePin: pin.value,
  });
  if (!upgradedMeta.success) {
    return err("instance-invalid", issue("instance.json", upgradedMeta.error));
  }
  const upgradedSave = saveStateSchema.safeParse({
    formatVersion: SAVE_FORMAT_VERSION,
    ...saveRest,
    runtimePin: pin.value,
    player: null,
    party: null,
  });
  if (!upgradedSave.success) return err("save-invalid", issue("save.json", upgradedSave.error));
  return ok({ meta: upgradedMeta.data, save: upgradedSave.data });
}
