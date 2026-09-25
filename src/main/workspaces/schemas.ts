import { GAMEPLAY_KIT_IDS, WORKSPACE_FORMAT_VERSION, type WorkspaceMeta } from "@shared/cartridge";
import { z } from "zod";
import { cartridgeManifestCoreSchema, cartridgeRefSchema } from "../cartridges/schemas";
import { genesisSchema } from "../worlds/schemas";

export const workspaceMetaSchema: z.ZodType<WorkspaceMeta> = z
  .object({
    formatVersion: z.literal(WORKSPACE_FORMAT_VERSION),
    workspaceId: z.string().min(1).max(96),
    mode: z.enum(["revision", "remix"]),
    targetCartridgeId: z.string().min(1).max(80),
    base: cartridgeRefSchema,
    name: z.string().trim().min(1).max(120),
    description: z.string().max(2_000),
    author: z.string().trim().min(1).max(120),
    engineApiVersion: z.number().int().min(1),
    saveSchemaVersion: z.number().int().min(1),
    sourceManifest: cartridgeManifestCoreSchema.optional(),
    entrySceneId: z.string().min(1).max(80),
    story: z
      .object({
        premise: z.string().trim().min(1).max(1_200),
        finale: z.string().trim().min(1).max(800),
        scenes: z
          .array(
            z
              .object({
                id: z.string().min(1).max(80),
                title: z.string().min(1).max(160),
                summary: z.string().min(1).max(800),
                objective: z.string().min(1).max(300),
                kit: z.enum(GAMEPLAY_KIT_IDS),
              })
              .strict(),
          )
          .min(1)
          .max(12),
      })
      .strict()
      .optional(),
    scenes: z
      .array(
        z.object({ id: z.string().min(1).max(80), title: z.string().min(1).max(160) }).strict(),
      )
      .min(1)
      .max(256),
    requiredKits: z.array(z.enum(GAMEPLAY_KIT_IDS)).min(1).max(GAMEPLAY_KIT_IDS.length).optional(),
    genesis: genesisSchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
