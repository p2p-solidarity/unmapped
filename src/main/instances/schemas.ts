import {
  INSTANCE_FORMAT_VERSION,
  type InstanceMeta,
  SAVE_FORMAT_VERSION,
  type SaveState,
} from "@shared/cartridge";
import { BIOMES } from "@shared/world";
import { z } from "zod";
import { cartridgeRefSchema } from "../cartridges/schemas";
import { inventorySchema, worldFlagsSchema } from "../worlds/schemas";

export const instanceMetaSchema: z.ZodType<InstanceMeta> = z
  .object({
    formatVersion: z.literal(INSTANCE_FORMAT_VERSION),
    instanceId: z.string().min(1).max(96),
    name: z.string().trim().min(1).max(120),
    cartridge: cartridgeRefSchema,
    activeSaveId: z.string().min(1).max(64),
    saveSchemaVersion: z.number().int().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

export const mutationSchema = z
  .object({
    skyColor: z.string().nullable(),
    fogDensity: z.number().nullable(),
    biome: z.enum(BIOMES).nullable(),
  })
  .strict();

export const saveStateSchema: z.ZodType<SaveState> = z
  .object({
    formatVersion: z.literal(SAVE_FORMAT_VERSION),
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
