// A `.spire-backup` is instance.json plus the active save (save.json, karma.jsonl). It carries the
// pinned CartridgeRef but never cartridge content, so restoring on a machine without that exact
// revision reports what is missing instead of silently substituting a newer one (plan §一, §七).

import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CartridgeRef, InstanceRecord, ResolvedInstance } from "@shared/cartridge";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { validateArchiveEntryNames } from "../archive";
import { verifyRuntimePin } from "../cartridges/integrity";
import { cartridgeCompatibility, readCartridgeRevision } from "../cartridges/store";
import { parseKarmaText } from "../worlds/schemas";
import { instanceDir, isInstanceId, isSaveId } from "./paths";
import { instanceMetaSchema, saveStateSchema } from "./schemas";
import { readInstance, resolveInstance } from "./store";

const INSTANCE_FILE = "instance.json";
const SAVE_ENTRY = /^saves\/([a-z0-9][a-z0-9-]{0,63})\/(save\.json|karma\.jsonl)$/;
const ZIP_LEVEL = 6;
const MAX_INSTANCE_ID_BYTES = 96;
const SHAPE_HINT =
  "A .spire-backup holds exactly instance.json, saves/<id>/save.json and saves/<id>/karma.jsonl.";

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
  const { meta, save, karma } = instance.value;
  const base = `saves/${meta.activeSaveId}`;
  try {
    return ok(
      zipSync(
        {
          [INSTANCE_FILE]: strToU8(`${JSON.stringify(meta, null, 2)}\n`),
          [`${base}/save.json`]: strToU8(`${JSON.stringify(save, null, 2)}\n`),
          [`${base}/karma.jsonl`]: strToU8(serializeKarma(karma)),
        },
        { level: ZIP_LEVEL },
      ),
    );
  } catch (error) {
    return fail(toError(error, "backup-pack-failed"));
  }
}

function unsafeEntry(name: string): boolean {
  return (
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /^[A-Za-z]:/.test(name) ||
    name.split(/[\\/]/).some((segment) => segment === "..")
  );
}

export function unpackInstanceBackup(bytes: Uint8Array): Result<InstanceRecord> {
  const names = validateArchiveEntryNames(bytes, "backup-duplicate");
  if (!names.ok) return names;
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (error) {
    return err(
      "backup-unreadable",
      "That file is not a readable .spire-backup archive.",
      `Export it again from Unwritten Land. (${toError(error).message})`,
    );
  }
  const saves = new Map<string, { save?: string; karma?: string }>();
  const saveDirectories = new Set<string>();
  let metaText: string | null = null;
  for (const [name, raw] of Object.entries(unzipped)) {
    if (unsafeEntry(name))
      return err("backup-unsafe", `Refusing archive entry ${name}.`, SHAPE_HINT);
    if (name.endsWith("/")) {
      if (name === "saves/") continue;
      const directory = /^saves\/([a-z0-9][a-z0-9-]{0,63})\/$/.exec(name);
      if (directory?.[1] === undefined) {
        return err("backup-unknown-file", `Unexpected entry ${name}.`, SHAPE_HINT);
      }
      saveDirectories.add(directory[1]);
      continue;
    }
    if (name === INSTANCE_FILE) {
      metaText = strFromU8(raw);
      continue;
    }
    const match = SAVE_ENTRY.exec(name);
    if (match?.[1] === undefined || match[2] === undefined) {
      return err("backup-unknown-file", `Unexpected entry ${name}.`, SHAPE_HINT);
    }
    const slot = saves.get(match[1]) ?? {};
    if (match[2] === "save.json") slot.save = strFromU8(raw);
    else slot.karma = strFromU8(raw);
    saves.set(match[1], slot);
  }
  if (metaText === null) return err("backup-incomplete", "instance.json is missing.", SHAPE_HINT);
  let rawMeta: unknown;
  try {
    rawMeta = JSON.parse(metaText);
  } catch (error) {
    return err("instance-invalid", `instance.json: ${toError(error).message}`);
  }
  const parsedMeta = instanceMetaSchema.safeParse(rawMeta);
  if (!parsedMeta.success) {
    return err("instance-invalid", parsedMeta.error.issues[0]?.message ?? "Invalid instance.json");
  }
  const meta = parsedMeta.data;
  if (!isInstanceId(meta.instanceId) || !isSaveId(meta.activeSaveId)) {
    return err("instance-invalid", "The backup names an invalid instance or save id.");
  }
  const slot = saves.get(meta.activeSaveId);
  if (slot?.save === undefined || slot.karma === undefined) {
    return err("backup-incomplete", `saves/${meta.activeSaveId} is incomplete.`, SHAPE_HINT);
  }
  if (saves.size !== 1) {
    return err(
      "backup-unknown-file",
      "The backup contains save slots other than the active save.",
      SHAPE_HINT,
    );
  }
  if ([...saveDirectories].some((id) => id !== meta.activeSaveId)) {
    return err(
      "backup-unknown-file",
      "The backup contains save directories other than the active save.",
      SHAPE_HINT,
    );
  }
  let rawSave: unknown;
  try {
    rawSave = JSON.parse(slot.save);
  } catch (error) {
    return err("save-invalid", `save.json: ${toError(error).message}`);
  }
  const parsedSave = saveStateSchema.safeParse(rawSave);
  if (!parsedSave.success) {
    return err("save-invalid", parsedSave.error.issues[0]?.message ?? "Invalid save.json");
  }
  const save = parsedSave.data;
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
  return ok({ meta, save, karma: karma.value });
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
  record: InstanceRecord,
  now: Date = new Date(),
): Promise<Result<ResolvedInstance>> {
  const ref = record.meta.cartridge;
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
  const metaPin = verifyRuntimePin(revision.value.manifest, record.meta.runtimePin);
  if (!metaPin.ok) return metaPin;
  const savePin = verifyRuntimePin(revision.value.manifest, record.save.runtimePin);
  if (!savePin.ok) return savePin;
  if (record.save.saveSchemaVersion !== revision.value.manifest.saveSchemaVersion) {
    return err(
      "save-schema-mismatch",
      "The backup's save schema does not match its cartridge revision.",
      "Restore the exact revision this save was written against.",
    );
  }
  if (revision.value.scenes[record.save.currentSceneId] === undefined) {
    return err(
      "backup-scene-missing",
      `The backup points to missing scene ${record.save.currentSceneId}.`,
      "Restore the exact unmodified cartridge revision used by this save.",
    );
  }
  const taken = await exists(instanceDir(instancesDir, record.meta.instanceId));
  const suffix = `-r${now.getTime().toString(36)}`;
  const instanceId = taken
    ? `${record.meta.instanceId.slice(0, MAX_INSTANCE_ID_BYTES - suffix.length)}${suffix}`
    : record.meta.instanceId;
  const at = now.toISOString();
  const meta = { ...record.meta, instanceId, updatedAt: at };
  const save = { ...record.save, instanceId, updatedAt: at };
  const destination = instanceDir(instancesDir, instanceId);
  const staging = join(instancesDir, `.staging-${instanceId}-${process.pid}-${Date.now()}`);
  try {
    await mkdir(instancesDir, { recursive: true });
    const saveDir = join(staging, "saves", meta.activeSaveId);
    await mkdir(saveDir, { recursive: true });
    await writeFile(join(staging, INSTANCE_FILE), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
    await writeFile(join(saveDir, "save.json"), `${JSON.stringify(save, null, 2)}\n`, "utf8");
    await writeFile(join(saveDir, "karma.jsonl"), serializeKarma(record.karma), "utf8");
    await rename(staging, destination);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    return fail(toError(error, "backup-restore-failed"));
  }
  return resolveInstance(cartridgesDir, instancesDir, instanceId);
}
