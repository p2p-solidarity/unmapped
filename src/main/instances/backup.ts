// A `.spire-backup` is instance.json plus the active save: save.json, karma.jsonl and the land the
// player witnessed (chunks, lore.jsonl, notes.jsonl — backupLand.ts). It carries the pinned
// CartridgeRef but never cartridge content, so restoring on a machine without that exact revision
// reports what is missing instead of silently substituting a newer one (plan §一, §七). Backups
// from an older build (instance format 1) are upgraded against that exact revision on import.

import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CartridgeRef,
  InstanceMeta,
  InstanceRecord,
  ResolvedInstance,
  SaveState,
} from "@shared/cartridge";
import type { LandRecord } from "@shared/land";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { strToU8, zipSync } from "fflate";
import { verifyRuntimePin } from "../cartridges/integrity";
import { cartridgeCompatibility, readCartridgeRevision } from "../cartridges/store";
import { parseKarmaText } from "../worlds/schemas";
import { landEntries, landFromFiles, validateLand, writeLand } from "./backupLand";
import { BACKUP_LIMITS, readBackupFiles, SHAPE_HINT } from "./backupShape";
import { readLand } from "./land";
import { legacyInstanceMetaSchema, upgradeLegacyFromLibrary } from "./legacy";
import { instanceDir, isInstanceId, isSaveId } from "./paths";
import { instanceMetaSchema, saveStateSchema } from "./schemas";
import { readInstance, resolveInstance } from "./store";

const INSTANCE_FILE = "instance.json";
const ZIP_LEVEL = 6;
const MAX_INSTANCE_ID_BYTES = 96;

/** One instance, its active save and that save's witnessed land. */
export interface InstanceBackup extends InstanceRecord {
  land: LandRecord;
}

function serializeKarma(entries: InstanceRecord["karma"]): string {
  return entries.length === 0
    ? ""
    : `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function sameRef(a: CartridgeRef, b: CartridgeRef): boolean {
  return (
    a.cartridgeId === b.cartridgeId && a.version === b.version && a.contentHash === b.contentHash
  );
}

/** A save from an older build is packed in the current format when `cartridgesDir` is given. */
export async function packInstanceBackup(
  instancesDir: string,
  instanceId: string,
  cartridgesDir?: string,
): Promise<Result<Uint8Array>> {
  const instance = await readInstance(instancesDir, instanceId, cartridgesDir);
  if (!instance.ok) return instance;
  const land = await readLand(instancesDir, instanceId, cartridgesDir);
  if (!land.ok) return land;
  const valid = validateLand(instanceId, land.value);
  if (!valid.ok) return valid;
  const { meta, save, karma } = instance.value;
  const base = `saves/${meta.activeSaveId}`;
  const texts: Record<string, string> = {
    [INSTANCE_FILE]: `${JSON.stringify(meta, null, 2)}\n`,
    [`${base}/save.json`]: `${JSON.stringify(save, null, 2)}\n`,
    [`${base}/karma.jsonl`]: serializeKarma(karma),
  };
  for (const [path, text] of Object.entries(landEntries(land.value))) {
    texts[`${base}/${path}`] = text;
  }
  const files = Object.fromEntries(
    Object.entries(texts).map(([path, text]) => [path, strToU8(text)]),
  );
  const total = Object.values(files).reduce((sum, bytes) => sum + bytes.byteLength, 0);
  if (Object.keys(files).length > BACKUP_LIMITS.entries || total > BACKUP_LIMITS.totalBytes) {
    return err(
      "backup-too-large",
      `This save is ${total} bytes in ${Object.keys(files).length} files, more than one backup holds.`,
      TOO_LARGE_TO_EXPORT,
    );
  }
  let packed: Uint8Array;
  try {
    packed = zipSync(files, { level: ZIP_LEVEL });
  } catch (error) {
    return fail(toError(error, "backup-pack-failed"));
  }
  // Export refuses exactly what import refuses — the same reader and the same per-file, chunk and
  // dialogue limits — so a player is never handed a backup that can never be restored.
  const readable = readBackupFiles(packed);
  if (!readable.ok) {
    return readable.error.code === "backup-too-large"
      ? err("backup-too-large", readable.error.message, TOO_LARGE_TO_EXPORT)
      : readable;
  }
  return ok(packed);
}

const TOO_LARGE_TO_EXPORT =
  "Copy the instance folder itself to keep it; a .spire-backup cannot hold this much land.";

function parseJson(text: string, file: string, code: string): Result<unknown> {
  try {
    return ok(JSON.parse(text));
  } catch (error) {
    return err(code, `${file}: ${toError(error).message}`);
  }
}

/** instance.json + save.json in the current format; a format 1 pair is upgraded (legacy.ts). */
async function readRecord(
  cartridgesDir: string,
  rawMeta: unknown,
  saveText: string,
): Promise<Result<{ meta: InstanceMeta; save: SaveState }>> {
  const rawSave = parseJson(saveText, "save.json", "save-invalid");
  if (!rawSave.ok) return rawSave;
  if ((rawMeta as { formatVersion?: unknown } | null)?.formatVersion === 1) {
    return upgradeLegacyFromLibrary(cartridgesDir, rawMeta, rawSave.value);
  }
  const meta = instanceMetaSchema.safeParse(rawMeta);
  if (!meta.success) {
    return err("instance-invalid", meta.error.issues[0]?.message ?? "Invalid instance.json");
  }
  const save = saveStateSchema.safeParse(rawSave.value);
  if (!save.success) {
    return err("save-invalid", save.error.issues[0]?.message ?? "Invalid save.json");
  }
  return ok({ meta: meta.data, save: save.data });
}

/**
 * Reads a backup archive without writing anything. `cartridgesDir` is only consulted for a format 1
 * backup, whose runtime pin is derived from the exact revision it names.
 */
export async function unpackInstanceBackup(
  bytes: Uint8Array,
  cartridgesDir: string,
): Promise<Result<InstanceBackup>> {
  const files = readBackupFiles(bytes);
  if (!files.ok) return files;
  if (files.value.instance === null) {
    return err("backup-incomplete", "instance.json is missing.", SHAPE_HINT);
  }
  const rawMeta = parseJson(files.value.instance, INSTANCE_FILE, "instance-invalid");
  if (!rawMeta.ok) return rawMeta;
  // Which save is active, from either format, before its files are looked at.
  const named =
    (rawMeta.value as { formatVersion?: unknown } | null)?.formatVersion === 1
      ? legacyInstanceMetaSchema.safeParse(rawMeta.value)
      : instanceMetaSchema.safeParse(rawMeta.value);
  if (!named.success) {
    return err("instance-invalid", named.error.issues[0]?.message ?? "Invalid instance.json");
  }
  const { instanceId, activeSaveId } = named.data;
  if (!isInstanceId(instanceId) || !isSaveId(activeSaveId)) {
    return err("instance-invalid", "The backup names an invalid instance or save id.");
  }
  const slot = files.value.saves.get(activeSaveId);
  if (slot?.save === undefined || slot.karma === undefined) {
    return err("backup-incomplete", `saves/${activeSaveId} is incomplete.`, SHAPE_HINT);
  }
  if (files.value.saves.size !== 1) {
    return err(
      "backup-unknown-file",
      "The backup contains save slots other than the active save.",
      SHAPE_HINT,
    );
  }
  const record = await readRecord(cartridgesDir, rawMeta.value, slot.save);
  if (!record.ok) return record;
  const { meta, save } = record.value;
  if (
    save.instanceId !== meta.instanceId ||
    !sameRef(meta.cartridge, save.cartridge) ||
    !sameRef(meta.runtimePin.cartridge, meta.cartridge) ||
    !sameRef(save.runtimePin.cartridge, save.cartridge) ||
    JSON.stringify(meta.runtimePin) !== JSON.stringify(save.runtimePin)
  ) {
    return err(
      "save-identity-mismatch",
      "The save does not belong to this instance and cartridge.",
    );
  }
  const karma = parseKarmaText(slot.karma);
  if (!karma.ok) return karma;
  const land = landFromFiles(meta.instanceId, slot);
  if (!land.ok) return land;
  return ok({ meta, save, karma: karma.value, land: land.value });
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes a backup back to disk. Requires the exact pinned revision to be installed; when the
 * original instance id is taken the save is restored under a fresh id so nothing is overwritten.
 */
export async function restoreInstanceBackup(
  cartridgesDir: string,
  instancesDir: string,
  backup: InstanceBackup,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const ref = backup.meta.cartridge;
  const revision = await readCartridgeRevision(cartridgesDir, ref.cartridgeId, ref.version);
  const shortHash = ref.contentHash.slice(0, 23);
  if (!revision.ok || revision.value.manifest.contentHash !== ref.contentHash) {
    return err(
      "cartridge-missing",
      `${ref.cartridgeId}@${ref.version} (${shortHash}…) is not installed here.`,
      "Import that exact cartridge revision first; a save is never re-pinned on restore.",
    );
  }
  const compatibility = cartridgeCompatibility(revision.value.manifest);
  if (!compatibility.ok) return compatibility;
  const metaPin = verifyRuntimePin(revision.value.manifest, backup.meta.runtimePin);
  if (!metaPin.ok) return metaPin;
  const savePin = verifyRuntimePin(revision.value.manifest, backup.save.runtimePin);
  if (!savePin.ok) return savePin;
  if (backup.save.saveSchemaVersion !== revision.value.manifest.saveSchemaVersion) {
    return err(
      "save-schema-mismatch",
      "The backup's save schema does not match its cartridge revision.",
      "Restore the exact revision this save was written against.",
    );
  }
  if (revision.value.scenes[backup.save.currentSceneId] === undefined) {
    return err(
      "backup-scene-missing",
      `The backup points to missing scene ${backup.save.currentSceneId}.`,
      "Restore the exact unmodified cartridge revision used by this save.",
    );
  }
  const taken = await exists(instanceDir(instancesDir, backup.meta.instanceId));
  const suffix = `-r${now.getTime().toString(36)}`;
  const instanceId = taken
    ? `${backup.meta.instanceId.slice(0, MAX_INSTANCE_ID_BYTES - suffix.length)}${suffix}`
    : backup.meta.instanceId;
  const at = now.toISOString();
  const meta = { ...backup.meta, instanceId, updatedAt: at };
  const save = { ...backup.save, instanceId, updatedAt: at };
  const destination = instanceDir(instancesDir, instanceId);
  const staging = join(instancesDir, `.staging-${instanceId}-${process.pid}-${Date.now()}`);
  try {
    await mkdir(instancesDir, { recursive: true });
    const saveDir = join(staging, "saves", meta.activeSaveId);
    await mkdir(saveDir, { recursive: true });
    await writeFile(join(staging, INSTANCE_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await writeFile(join(saveDir, "save.json"), `${JSON.stringify(save, null, 2)}\n`, "utf8");
    await writeFile(join(saveDir, "karma.jsonl"), serializeKarma(backup.karma), "utf8");
    await writeLand(saveDir, backup.land);
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "backup-restore-failed"));
  }
  return resolveInstance(cartridgesDir, instancesDir, instanceId);
}
