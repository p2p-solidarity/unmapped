import {
  INSTANCE_FORMAT_VERSION,
  type InstanceMeta,
  type RuntimePin,
  SAVE_FORMAT_VERSION,
  type SaveState,
} from "@shared/cartridge";
import { CHAPTER_KINDS, CHAPTER_LIMITS } from "@shared/chapter";
import { FELLED_LIMITS } from "@shared/foes";
import { DOOR_SLOTS } from "@shared/land";
import { LANGUAGE_TAG_PATTERN } from "@shared/language";
import { PLACE_KINDS, PLACE_LIMITS } from "@shared/places";
import { SEED_PATTERN } from "@shared/seedCode";
import { STORY_CAP, storyEpisodeSchema } from "@shared/story";
import { DRAFT_ID, jsonBytes, jsonSchema, PLAY_ID, WORK_ID, WORK_LIMITS } from "@shared/works";
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

/** Seconds of land play: finite, never negative, bounded so a hand-edited save cannot overflow. */
const playClock = z.number().min(0).max(FELLED_LIMITS.clockMax);

/** Hostiles felled on open land (`@shared/foes`): the land's play clock and when each one fell. */
export const felledLedgerSchema = z
  .object({
    clock: playClock,
    at: z
      .record(z.string().min(1).max(FELLED_LIMITS.idChars), playClock)
      .refine((at) => Object.keys(at).length <= FELLED_LIMITS.entries, "too many felled entries"),
  })
  .strict();

/** Local ids of what a chapter's player has done: people met, treasures opened, foes felled. */
const doneIds = z.array(z.string().max(64)).max(CHAPTER_LIMITS.doneIds);

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
    episodes: z
      .record(
        z.string().regex(/^e[1-9][0-9]?$/),
        z
          .object({
            draftId: z.string().regex(DRAFT_ID).nullable(),
            work: z
              .object({
                workId: z.string().regex(WORK_ID),
                version: z.string().max(40),
                contentHash: contentHashSchema,
              })
              .strict()
              .nullable(),
            playId: z.string().regex(PLAY_ID).nullable(),
            cleared: z.boolean(),
            summary: z.string().max(WORK_LIMITS.summaryChars).nullable(),
            stage: z
              .object({
                kind: z.enum(CHAPTER_KINDS),
                source: z.string().min(1).max(CHAPTER_LIMITS.sourceChars),
                seed: z.number().int().min(0).max(0xffffffff),
                found: doneIds,
                felled: doneIds,
                met: doneIds,
              })
              .strict()
              .nullable()
              .optional(),
          })
          .strict(),
      )
      .optional(),
    storyCarry: jsonSchema
      .nullable()
      .refine(
        (value) => (jsonBytes(value) ?? Infinity) <= WORK_LIMITS.carryBytes,
        "carry too large",
      )
      .optional(),
    storyMore: z.array(storyEpisodeSchema).max(STORY_CAP).optional(),
    places: z
      .array(
        z
          .object({
            id: z.string().regex(/^p[0-9]{1,3}$/),
            kind: z.enum(PLACE_KINDS),
            title: z.string().min(1).max(PLACE_LIMITS.titleChars),
            cx: z.number().int().min(-64).max(64),
            cz: z.number().int().min(-64).max(64),
            seed: z.number().int().min(0).max(0xffffffff),
            source: z.string().min(1).max(PLACE_LIMITS.sourceChars),
            cleared: z.boolean(),
          })
          .strict(),
      )
      .max(PLACE_LIMITS.max)
      .optional(),
    felled: felledLedgerSchema.optional(),
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
    language: z.string().regex(LANGUAGE_TAG_PATTERN).optional(),
    updatedAt: z.string().min(1),
  })
  .strict();
