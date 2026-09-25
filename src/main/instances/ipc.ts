import { readFile, stat, writeFile } from "node:fs/promises";
import { IPC, type SeedExport } from "@shared/ipc";
import { LANGUAGE_TAG_PATTERN } from "@shared/language";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { SEED_PATTERN } from "@shared/seedCode";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { inventorySchema, karmaEntrySchema, worldFlagsSchema } from "../worlds/schemas";
import { packInstanceBackup, restoreInstanceBackup, unpackInstanceBackup } from "./backup";
import { chooseBackupSource, chooseBackupTarget } from "./backupDialog";
import { BACKUP_LIMITS } from "./backupShape";
import { appendNote, appendNoteSchema, readLand, witnessChunk, witnessChunkSchema } from "./land";
import { landProgressSchema, mutationSchema, savedPositionSchema } from "./schemas";
import {
  checkpointInstance,
  completeInstance,
  createInstance,
  descendInstance,
  listInstances,
  listLegacyInstances,
  resolveInstance,
  transitionInstance,
} from "./store";
import { upgradeInstance } from "./upgrade";

const instanceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const sceneIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const createInstanceSchema = z
  .object({
    cartridgeId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    version: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    seed: z.string().regex(SEED_PATTERN).optional(),
    language: z.string().regex(LANGUAGE_TAG_PATTERN).optional(),
  })
  .strict();
const checkpointSchema = z
  .object({
    instanceId: instanceIdSchema,
    expectedUpdatedAt: z.string().min(1),
    flags: worldFlagsSchema,
    inventory: inventorySchema,
    mutation: mutationSchema.nullable(),
    karma: z.array(karmaEntrySchema).max(10_000),
    position: savedPositionSchema.optional(),
    land: landProgressSchema.optional(),
  })
  .strict();
const upgradeSchema = z
  .object({ instanceId: instanceIdSchema, version: z.string().min(1).max(128) })
  .strict();
const CANCEL_HINT = "Choose a file to continue, or pick the action again when you are ready.";

async function exportBackup(ctx: MainContext, instanceId: string): Promise<Result<SeedExport>> {
  const packed = await packInstanceBackup(ctx.instancesDir, instanceId, ctx.cartridgesDir);
  if (!packed.ok) return packed;
  const target = await chooseBackupTarget(`${instanceId}.spire-backup`);
  if (target === null) return err("cancelled", "Export cancelled", CANCEL_HINT);
  try {
    await writeFile(target, packed.value);
  } catch (error) {
    return fail(toError(error, "backup-write-failed"));
  }
  return ok({ path: target, bytes: packed.value.byteLength });
}

async function importBackup(ctx: MainContext) {
  const path = await chooseBackupSource();
  if (path === null) return err("cancelled", "Import cancelled", CANCEL_HINT);
  let bytes: Buffer;
  try {
    if ((await stat(path)).size > BACKUP_LIMITS.archiveBytes) {
      return err(
        "backup-too-large",
        "That file is larger than a .spire-backup may be.",
        "Choose a backup exported by Unwritten Land.",
      );
    }
    bytes = await readFile(path);
  } catch (error) {
    return fail(toError(error, "backup-read-failed"));
  }
  const unpacked = await unpackInstanceBackup(new Uint8Array(bytes), ctx.cartridgesDir);
  if (!unpacked.ok) return unpacked;
  return restoreInstanceBackup(ctx.cartridgesDir, ctx.instancesDir, unpacked.value);
}

export function registerInstancesIpc(ctx: MainContext): void {
  handle(IPC.instances.list, z.tuple([]), () => listInstances(ctx.instancesDir, ctx.cartridgesDir));
  handle(IPC.instances.listLegacy, z.tuple([]), () =>
    listLegacyInstances(ctx.instancesDir, ctx.cartridgesDir),
  );
  handle(IPC.instances.create, z.tuple([createInstanceSchema]), async ([input]) => {
    const cartridge = await readCartridgeRevision(
      ctx.cartridgesDir,
      input.cartridgeId,
      input.version,
    );
    if (!cartridge.ok) return cartridge;
    const instance = await createInstance(
      ctx.instancesDir,
      cartridge.value.manifest,
      input.name,
      new Date(),
      input.seed,
      input.language,
    );
    return instance.ok ? ok({ instance: instance.value, cartridge: cartridge.value }) : instance;
  });
  handle(IPC.instances.resolve, z.tuple([instanceIdSchema]), ([instanceId]) =>
    resolveInstance(ctx.cartridgesDir, ctx.instancesDir, instanceId),
  );
  handle(
    IPC.instances.transition,
    z.tuple([instanceIdSchema, sceneIdSchema]),
    ([instanceId, targetSceneId]) =>
      transitionInstance(ctx.cartridgesDir, ctx.instancesDir, instanceId, targetSceneId),
  );
  handle(IPC.instances.complete, z.tuple([instanceIdSchema]), ([instanceId]) =>
    completeInstance(ctx.cartridgesDir, ctx.instancesDir, instanceId),
  );
  handle(IPC.instances.descend, z.tuple([instanceIdSchema]), ([instanceId]) =>
    descendInstance(ctx.cartridgesDir, ctx.instancesDir, instanceId),
  );
  handle(IPC.instances.checkpoint, z.tuple([checkpointSchema]), ([input]) =>
    checkpointInstance(ctx.instancesDir, input, new Date(), ctx.cartridgesDir),
  );
  handle(IPC.instances.upgrade, z.tuple([upgradeSchema]), ([input]) =>
    upgradeInstance(ctx.cartridgesDir, ctx.instancesDir, input.instanceId, input.version),
  );
  handle(IPC.instances.exportBackup, z.tuple([instanceIdSchema]), ([instanceId]) =>
    exportBackup(ctx, instanceId),
  );
  handle(IPC.instances.importBackup, z.tuple([]), () => importBackup(ctx));
  handle(IPC.instances.readLand, z.tuple([instanceIdSchema]), ([instanceId]) =>
    readLand(ctx.instancesDir, instanceId, ctx.cartridgesDir),
  );
  handle(IPC.instances.witness, z.tuple([witnessChunkSchema]), ([input]) =>
    witnessChunk(ctx.instancesDir, input, ctx.cartridgesDir),
  );
  handle(IPC.instances.appendNote, z.tuple([appendNoteSchema]), ([input]) =>
    appendNote(ctx.instancesDir, input, ctx.cartridgesDir),
  );
}
