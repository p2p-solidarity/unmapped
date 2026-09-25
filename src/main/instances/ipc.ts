import { IPC } from "@shared/ipc";
import { ok } from "@shared/result";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { inventorySchema, karmaEntrySchema, worldFlagsSchema } from "../worlds/schemas";
import { mutationSchema } from "./schemas";
import {
  checkpointInstance,
  completeInstance,
  createInstance,
  listInstances,
  resolveInstance,
  transitionInstance,
} from "./store";

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
}
