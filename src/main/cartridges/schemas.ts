import {
  CARTRIDGE_FORMAT_VERSION,
  type CartridgeManifest,
  type CartridgeManifestCore,
  type ContentHash,
  GAMEPLAY_KIT_IDS,
  type PublishCartridgeInput,
} from "@shared/cartridge";
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
    kind: z.enum(["revision", "remix"]),
    parent: cartridgeRefSchema,
  })
  .strict();

const sceneEntrySchema = z
  .object({
    id: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
  })
  .strict();

const storySceneSchema = sceneEntrySchema.extend({
  summary: z.string().trim().min(1).max(800),
  objective: z.string().trim().min(1).max(300),
  kit: z.enum(GAMEPLAY_KIT_IDS),
});

const storySchema = z
  .object({
    premise: z.string().trim().min(1).max(1_200),
    finale: z.string().trim().min(1).max(800),
    scenes: z.array(storySceneSchema).min(1).max(12),
  })
  .strict();

const manifestShape = {
  formatVersion: z.literal(CARTRIDGE_FORMAT_VERSION),
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
} as const;

export const cartridgeManifestCoreSchema: z.ZodType<CartridgeManifestCore> = z
  .object(manifestShape)
  .strict();

const fileIntegritySchema = z
  .object({
    path: z.string().min(1).max(240),
    bytes: z.number().int().nonnegative(),
    contentHash: contentHashSchema,
  })
  .strict();

export const cartridgeManifestSchema: z.ZodType<CartridgeManifest> = z
  .object({
    ...manifestShape,
    contentHash: contentHashSchema,
    files: z.array(fileIntegritySchema).min(2).max(257),
  })
  .strict();

export const publishCartridgeInputSchema: z.ZodType<PublishCartridgeInput> = z
  .object({
    manifest: cartridgeManifestCoreSchema,
    rules: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    scenes: z.record(z.string(), z.string().max(4 * 1024 * 1024)),
  })
  .strict();
