import {
  BIBLE_MAX_CHARS,
  CARTRIDGE_FORMAT_VERSION,
  type CartridgeManifest,
  type CartridgeManifestCore,
  type ContentHash,
  GAMEPLAY_KIT_IDS,
  LEGACY_CARTRIDGE_FORMAT_VERSION,
  type PublishCartridgeInput,
} from "@shared/cartridge";
import type { GameDefinition } from "@shared/game-definition";
import { GAME_DEFINITION_FORMAT_VERSION } from "@shared/game-definition";
import { storyPlanSchema } from "@shared/story";
import { z } from "zod";
import { genesisSchema } from "../worlds/schemas";

export const contentHashSchema = z.custom<ContentHash>(
  (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value),
  "must be an algorithm-tagged SHA-256 hash",
);

export const cartridgeRefSchema = z
  .object({
    cartridgeId: z.string().min(1).max(80),
    version: z.string().min(1).max(128),
    contentHash: contentHashSchema,
  })
  .strict();

const lineageSchema = z
  .object({
    kind: z.enum(["revision", "remix", "legacy-import"]),
    parent: cartridgeRefSchema.nullable(),
  })
  .strict();

const sceneEntrySchema = z
  .object({ id: z.string().min(1).max(80), title: z.string().min(1).max(160) })
  .strict();

const storySchema = z
  .object({
    premise: z.string().trim().min(1).max(1_200),
    finale: z.string().trim().min(1).max(800),
    scenes: z
      .array(
        sceneEntrySchema.extend({
          summary: z.string().trim().min(1).max(800),
          objective: z.string().trim().min(1).max(300),
          kit: z.enum(GAMEPLAY_KIT_IDS),
        }),
      )
      .min(1)
      .max(256),
  })
  .strict();

const legacyManifestCoreSchema = z
  .object({
    formatVersion: z.literal(LEGACY_CARTRIDGE_FORMAT_VERSION),
    cartridgeId: z.string().min(1).max(80),
    version: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2_000),
    author: z.string().trim().min(1).max(120),
    createdAt: z.string().min(1),
    engineApiVersion: z.number().int().min(1),
    saveSchemaVersion: z.number().int().min(1),
    entrySceneId: z.string().min(1).max(80),
    story: storySchema,
    scenes: z.array(sceneEntrySchema).min(1).max(256),
    requiredKits: z.array(z.enum(GAMEPLAY_KIT_IDS)).min(1).max(GAMEPLAY_KIT_IDS.length),
    genesis: genesisSchema,
    lineage: lineageSchema.nullable(),
  })
  .strict();

export const capabilityModuleSchema = z
  .object({
    moduleId: z.string().min(1).max(120),
    version: z.string().min(1).max(128),
    source: z.enum(["builtin", "signed_engine_extension"]),
    provides: z.array(z.string().min(3).max(160)).max(64),
    requires: z.array(z.string().min(1).max(120)).max(64),
    deterministic: z.boolean(),
    implementedBy: z.string().min(1).max(240),
  })
  .strict();

const capabilityProfileSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            key: z.enum([
              "camera",
              "physics",
              "combat",
              "timing",
              "network",
              "party",
              "ui",
              "progression",
              "content",
            ]),
            value: z.string().min(1).max(120),
            moduleId: z.string().min(1).max(120),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();

const assetRefSchema = z
  .object({
    assetId: z.string().min(1).max(160),
    role: z.enum(["environment", "character", "weapon", "vehicle", "ui", "audio"]),
    path: z.string().min(1).max(240),
    contentHash: contentHashSchema,
  })
  .strict();

export const modLockSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            name: z.string().min(1).max(120),
            version: z.string().min(1).max(128),
            contentHash: contentHashSchema,
            affectsRuntime: z.boolean(),
            provides: z.array(z.string().min(1).max(160)).max(128),
          })
          .strict(),
      )
      .max(128),
    lockHash: contentHashSchema,
  })
  .strict();

const gameDefinitionObjectSchema = z
  .object({
    formatVersion: z.literal(GAME_DEFINITION_FORMAT_VERSION),
    gameId: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(120),
    description: z.string().max(2_000),
    author: z.string().trim().min(1).max(120),
    modeSelection: z
      .object({
        genres: z.array(z.string().min(1)).max(64),
        timings: z.array(z.string().min(1)).max(64),
        structures: z.array(z.string().min(1)).max(64),
        settings: z.array(z.string().min(1)).max(64),
      })
      .strict(),
    capabilityProfile: z
      .object({
        profileId: z.string().min(1).max(120),
        defaultContextId: z.string().min(1).max(120),
        contexts: z
          .array(
            z
              .object({
                contextId: z.string().min(1).max(120),
                profile: capabilityProfileSchema,
              })
              .strict(),
          )
          .min(1)
          .max(64),
        transitions: z
          .array(
            z
              .object({
                fromContextId: z.string().min(1).max(120),
                toContextId: z.string().min(1).max(120),
                trigger: z.enum(["scene_enter", "scene_exit", "phase_change", "typed_effect"]),
                triggerId: z.string().min(1).max(160),
              })
              .strict(),
          )
          .max(256),
      })
      .strict(),
    assetPacks: z
      .array(
        z
          .object({
            packId: z.string().min(1).max(120),
            version: z.string().min(1).max(128),
            contentHash: contentHashSchema,
            assets: z.array(assetRefSchema).max(2048),
          })
          .strict(),
      )
      .max(128),
    scenePlan: z
      .object({
        orderedSceneIds: z.array(z.string().min(1).max(80)).min(1).max(256),
        entrySceneId: z.string().min(1).max(80),
        endingSceneIds: z.array(z.string().min(1).max(80)).min(1).max(256),
        transitions: z
          .array(
            z
              .object({
                fromSceneId: z.string().min(1).max(80),
                toSceneId: z.string().min(1).max(80),
                triggerId: z.string().min(1).max(160),
                requiresFlags: z.array(z.string().min(1).max(120)).max(256),
              })
              .strict(),
          )
          .max(1024),
      })
      .strict(),
    scenes: z
      .array(
        z
          .object({
            sceneId: z.string().min(1).max(80),
            slotId: z.string().min(1).max(80),
            candidateId: z.string().min(1).max(120),
            sourceHash: contentHashSchema,
            requiredProfileId: z.string().min(1).max(120),
            requiredContextId: z.string().min(1).max(120),
            requiredModules: z.array(z.string().min(1).max(120)).max(128),
            assets: z.array(assetRefSchema).max(2048),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    narrative: z
      .object({
        required: z.boolean(),
        premise: z.string().max(1_200),
        finale: z.string().max(800),
        scenes: z
          .array(
            z
              .object({
                sceneId: z.string().min(1).max(80),
                title: z.string().min(1).max(160),
                summary: z.string().max(800),
                objective: z.string().max(300),
              })
              .strict(),
          )
          .max(256),
      })
      .strict(),
    moduleLock: z.object({ entries: z.array(capabilityModuleSchema).max(256) }).strict(),
    modLock: modLockSchema,
    provenance: z
      .object({
        source: z.enum(["new", "remix", "legacy-import"]),
        parent: cartridgeRefSchema.nullable(),
        generation: z
          .array(
            z
              .object({
                operation: z.enum([
                  "base",
                  "initial",
                  "reroll_all",
                  "reroll_slot",
                  "refine",
                  "duplicate",
                  "visual_edit",
                ]),
                generationSeed: z.number().int(),
                requestHash: contentHashSchema,
                parentCandidateHash: contentHashSchema.nullable(),
                modelId: z.string().max(160).nullable(),
                createdAt: z.string().min(1),
              })
              .strict(),
          )
          .max(4096),
      })
      .strict(),
  })
  .strict();

export const gameDefinitionSchema =
  gameDefinitionObjectSchema as unknown as z.ZodType<GameDefinition>;

const v2ManifestCoreSchema = z
  .object({
    formatVersion: z.literal(CARTRIDGE_FORMAT_VERSION),
    cartridgeId: z.string().min(1).max(80),
    version: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2_000),
    author: z.string().trim().min(1).max(120),
    createdAt: z.string().min(1),
    engineApiVersion: z.number().int().min(1),
    saveSchemaVersion: z.number().int().min(1),
    networkProtocolVersion: z.number().int().min(1),
    definition: gameDefinitionSchema,
    lineage: lineageSchema,
  })
  .strict();

export const cartridgeManifestCoreSchema: z.ZodType<CartridgeManifestCore> = z.discriminatedUnion(
  "formatVersion",
  [legacyManifestCoreSchema, v2ManifestCoreSchema],
) as z.ZodType<CartridgeManifestCore>;

const fileIntegritySchema = z
  .object({
    path: z.string().min(1).max(240),
    bytes: z.number().int().nonnegative(),
    contentHash: contentHashSchema,
  })
  .strict();

export const cartridgeManifestSchema: z.ZodType<CartridgeManifest> = z.intersection(
  cartridgeManifestCoreSchema,
  z.object({
    contentHash: contentHashSchema,
    files: z.array(fileIntegritySchema).min(2).max(4098),
  }),
);

export const publishCartridgeInputSchema: z.ZodType<PublishCartridgeInput> = z
  .object({
    manifest: cartridgeManifestCoreSchema,
    rules: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    scenes: z.record(z.string(), z.string().max(4 * 1024 * 1024)),
    // Baked NPC conversations, keyed `<sceneId>/<npcId>`. The key shape and the NPC's existence
    // are checked against the parsed scenes at publish time (cartridges/dialogue-files.ts).
    dialogues: z
      .record(
        z.string().max(161),
        z
          .string()
          .min(1)
          .max(256 * 1024),
      )
      .optional(),
    assets: z.record(z.string(), z.instanceof(Uint8Array)).optional(),
    bible: z
      .object({ core: z.string().max(BIBLE_MAX_CHARS), style: z.string().max(BIBLE_MAX_CHARS) })
      .strict()
      .optional(),
    story: storyPlanSchema.optional(),
  })
  .strict();
