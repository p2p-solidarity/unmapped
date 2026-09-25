import {
  INSTANCE_FORMAT_VERSION,
  type InstanceMeta,
  type RuntimePin,
  SAVE_FORMAT_VERSION,
  type SaveState,
} from "@shared/cartridge";
import { DOOR_SLOTS } from "@shared/land";
import { SEED_PATTERN } from "@shared/seedCode";
import { BIOMES } from "@shared/world";
import { z } from "zod";
import {
  capabilityModuleSchema,
  cartridgeRefSchema,
  contentHashSchema,
  modLockSchema,
} from "../cartridges/schemas";
import { inventorySchema, itemSpecSchema, worldFlagsSchema } from "../worlds/schemas";

export const runtimePinSchema: z.ZodType<RuntimePin> = z
  .object({
    cartridge: cartridgeRefSchema,
    moduleLock: z.object({ entries: z.array(capabilityModuleSchema).max(256) }).strict(),
    modLock: modLockSchema,
    profileHash: contentHashSchema,
    effectiveHash: contentHashSchema,
  })
  .strict() as unknown as z.ZodType<RuntimePin>;

export const instanceMetaSchema: z.ZodType<InstanceMeta> = z
  .object({
    formatVersion: z.literal(INSTANCE_FORMAT_VERSION),
    instanceId: z.string().min(1).max(96),
    name: z.string().trim().min(1).max(120),
    cartridge: cartridgeRefSchema,
    runtimePin: runtimePinSchema,
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

/** Open land is unbounded, but a coordinate is still a finite number a float can hold exactly. */
const landCoord = z.number().min(-1_000_000).max(1_000_000);

export const savedPositionSchema = z
  .object({
    sceneId: z.string().min(1).max(80),
    x: landCoord,
    y: z.number().min(-1_000).max(1_000),
    z: landCoord,
    yaw: z.number().min(-1_000).max(1_000),
  })
  .strict();

const placedItemSchema = itemSpecSchema;

export const landProgressSchema = z
  .object({
    errands: z.record(z.string().max(120), z.enum(["accepted", "reached", "done"])),
    home: z
      .object({
        cx: z.number().int().min(-40_000).max(40_000),
        cz: z.number().int().min(-40_000).max(40_000),
        keepsakes: z.array(placedItemSchema).max(64),
      })
      .strict(),
    door: z
      .array(
        z
          .discriminatedUnion("kind", [
            z
              .object({
                kind: z.literal("place"),
                cx: z.number().int().min(-40_000).max(40_000),
                cz: z.number().int().min(-40_000).max(40_000),
                label: z.string().max(60),
              })
              .strict(),
            z
              .object({
                kind: z.literal("room"),
                code: z.string().max(16),
                label: z.string().max(60),
              })
              .strict(),
          ])
          .nullable(),
      )
      .length(DOOR_SLOTS),
  })
  .strict();

export const saveStateSchema: z.ZodType<SaveState> = z
  .object({
    formatVersion: z.literal(SAVE_FORMAT_VERSION),
    instanceId: z.string().min(1).max(96),
    cartridge: cartridgeRefSchema,
    runtimePin: runtimePinSchema,
    saveSchemaVersion: z.number().int().min(1),
    currentSceneId: z.string().min(1).max(80),
    flags: worldFlagsSchema,
    inventory: inventorySchema,
    player: z
      .object({
        profileId: z.string().min(1).max(120),
        loadout: z.record(z.string(), z.string()),
        progression: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      })
      .strict()
      .nullable(),
    party: z
      .object({
        members: z
          .array(
            z
              .object({
                id: z.string().min(1).max(120),
                role: z.string().min(1).max(120),
                loadout: z.record(z.string(), z.string()),
                state: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
              })
              .strict(),
          )
          .max(64),
      })
      .strict()
      .nullable(),
    mutation: mutationSchema.nullable(),
    completedSceneIds: z.array(z.string().min(1).max(80)).max(256),
    endless: z
      .object({
        seed: z.number().int().min(0).max(0xffffffff),
        depth: z.number().int().min(1).max(1_000_000),
      })
      .strict()
      .optional(),
    position: savedPositionSchema.optional(),
    land: landProgressSchema.optional(),
    seed: z.string().regex(SEED_PATTERN).optional(),
    updatedAt: z.string().min(1),
  })
  .strict();
