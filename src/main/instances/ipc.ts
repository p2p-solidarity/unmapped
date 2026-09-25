import { readFile, writeFile } from "node:fs/promises";
import { IPC, type SeedExport } from "@shared/ipc";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { dialog } from "electron";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { inventorySchema, karmaEntrySchema, worldFlagsSchema } from "../worlds/schemas";
import { packInstanceBackup, restoreInstanceBackup, unpackInstanceBackup } from "./backup";
import { mutationSchema } from "./schemas";
import {
  checkpointInstance,
  completeInstance,
  createInstance,
  listInstances,
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
  })
  .strict();
const upgradeSchema = z
  .object({ instanceId: instanceIdSchema, version: z.string().min(1).max(128) })
  .strict();
const BACKUP_FILTER = [{ name: "Aether Spire save backup", extensions: ["spire-backup"] }];
const CANCEL_HINT = "Choose a file to continue, or pick the action again when you are ready.";

async function exportBackup(ctx: MainContext, instanceId: string): Promise<Result<SeedExport>> {
  const packed = await packInstanceBackup(ctx.instancesDir, instanceId);
  if (!packed.ok) return packed;
  const chosen = await dialog.showSaveDialog({
    title: "Export save backup",
    defaultPath: `${instanceId}.spire-backup`,
    filters: BACKUP_FILTER,
  });
  if (chosen.canceled || chosen.filePath === undefined || chosen.filePath.length === 0) {
    return err("cancelled", "Export cancelled", CANCEL_HINT);
  }
  try {
    await writeFile(chosen.filePath, packed.value);
  } catch (error) {
    return fail(toError(error, "backup-write-failed"));
  }
  return ok({ path: chosen.filePath, bytes: packed.value.byteLength });
}

async function importBackup(ctx: MainContext) {
  const chosen = await dialog.showOpenDialog({
    title: "Import save backup",
    properties: ["openFile"],
    filters: BACKUP_FILTER,
  });
  const path = chosen.filePaths[0];
  if (chosen.canceled || path === undefined) {
    return err("cancelled", "Import cancelled", CANCEL_HINT);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch (error) {
    return fail(toError(error, "backup-read-failed"));
  }
  const unpacked = unpackInstanceBackup(new Uint8Array(bytes));
  if (!unpacked.ok) return unpacked;
  return restoreInstanceBackup(ctx.cartridgesDir, ctx.instancesDir, unpacked.value);
}

export function registerInstancesIpc(ctx: MainContext): void {
  handle(IPC.instances.list, z.tuple([]), () => listInstances(ctx.instancesDir));
  handle(IPC.instances.create, z.tuple([createInstanceSchema]), async ([input]) => {
    const cartridge = await readCartridgeRevision(
      ctx.cartridgesDir,
      input.cartridgeId,
      input.version,
    );
    if (!cartridge.ok) return cartridge;
    const instance = await createInstance(ctx.instancesDir, cartridge.value.manifest, input.name);
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
  handle(IPC.instances.checkpoint, z.tuple([checkpointSchema]), ([input]) =>
    checkpointInstance(ctx.instancesDir, input),
  );
  handle(IPC.instances.upgrade, z.tuple([upgradeSchema]), ([input]) =>
    upgradeInstance(ctx.cartridgesDir, ctx.instancesDir, input.instanceId, input.version),
  );
  handle(IPC.instances.exportBackup, z.tuple([instanceIdSchema]), ([instanceId]) =>
    exportBackup(ctx, instanceId),
  );
  handle(IPC.instances.importBackup, z.tuple([]), () => importBackup(ctx));
}
