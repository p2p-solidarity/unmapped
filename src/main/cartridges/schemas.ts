// The manifest schemas are pure and live in @shared/cartridgeSchemas (rev 6 phase 4, WP
// "integrity"); this module re-exports them for main and keeps the IPC input schema of a publish.

import { BIBLE_MAX_CHARS, type PublishCartridgeInput } from "@shared/cartridge";
import { cartridgeManifestCoreSchema } from "@shared/cartridgeSchemas";
import { storyPlanSchema } from "@shared/story";
import { z } from "zod";

export {
  capabilityModuleSchema,
  cartridgeManifestCoreSchema,
  cartridgeManifestSchema,
  cartridgeRefSchema,
  contentHashSchema,
  gameDefinitionSchema,
  modLockSchema,
} from "@shared/cartridgeSchemas";

/** One asset of a revision, and all of them: a `.cartridge` travels as one pack of ≤ 32 MiB. */
const ASSET_MAX_BYTES = 16 * 1024 * 1024;
const ASSETS_MAX_BYTES = 32 * 1024 * 1024;

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
    // Untrusted bytes (pictures are decoded at publish): each within a pack's own limit, and all of
    // them together too, before anything reads them.
    assets: z
      .record(
        z.string().max(200),
        z
          .instanceof(Uint8Array)
          .refine((bytes) => bytes.byteLength <= ASSET_MAX_BYTES, "asset too large"),
      )
      .refine(
        (assets) =>
          Object.values(assets).reduce((sum, bytes) => sum + bytes.byteLength, 0) <=
          ASSETS_MAX_BYTES,
        "assets too large",
      )
      .optional(),
    bible: z
      .object({ core: z.string().max(BIBLE_MAX_CHARS), style: z.string().max(BIBLE_MAX_CHARS) })
      .strict()
      .optional(),
    story: storyPlanSchema.optional(),
  })
  .strict();
