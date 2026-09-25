import { z } from "zod";
import { WEAPON_KINDS } from "./combat";
import { GAMEPLAY_KIT_IDS, INVENTORY_POLICIES } from "./gameplay";
import type { SeedModProposal } from "./mods";
import { TIMING_SYSTEMS, TURN_RESOLUTIONS } from "./timing";
import { MONSTER_KINDS } from "./world";

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const hash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const asset = z
  .object({
    assetId: z.string().min(1).max(160),
    role: z.enum(["environment", "character", "weapon", "vehicle", "ui", "audio"]),
    path: z.string().max(240),
    contentHash: hash,
  })
  .strict();
const contract = z
  .object({
    sceneId: id,
    kit: z.enum(GAMEPLAY_KIT_IDS),
    requiresFlags: z.array(id).max(64),
    requiresItems: z.array(id).max(64),
    inventoryPolicy: z.enum(INVENTORY_POLICIES),
    grantsFlags: z.array(id).max(64),
    terminal: z.boolean(),
    requiredProfileId: z.string().max(160).optional(),
    requiredContextId: z.string().max(160).optional(),
    requiredModules: z.array(z.string().max(160)).max(64).optional(),
  })
  .strict();
export const modOperationSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("add_weapon"),
      weapon: z
        .object({
          weaponId: id,
          name: z.string().trim().min(1).max(80),
          kind: z.enum(WEAPON_KINDS),
          damage: z.number().min(1).max(999),
          range: z.number().min(0.5).max(60),
          cooldownMs: z.number().int().min(50).max(10000),
          ammoType: z.string().max(80).nullable(),
          magazine: z.number().int().min(1).max(999).nullable(),
          assetId: z.string().min(1).max(160),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("change_timing"),
      change: z
        .object({
          from: z.enum(TIMING_SYSTEMS),
          to: z.enum(TIMING_SYSTEMS),
          resolution: z.enum(TURN_RESOLUTIONS),
          turnDurationMs: z.number().int().min(0).max(120000).nullable(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("add_capability_module"),
      moduleId: id,
      version: z.string().min(1).max(40),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene_patch"),
      sceneId: id,
      patch: z
        .object({
          operations: z
            .array(
              z.discriminatedUnion("type", [
                z
                  .object({
                    type: z.literal("replace_asset"),
                    fromAssetId: z.string().max(160),
                    toAssetId: z.string().max(160),
                  })
                  .strict(),
                z
                  .object({
                    type: z.literal("move_asset"),
                    assetId: z.string().max(160),
                    x: z.number().min(0).max(127),
                    z: z.number().min(0).max(127),
                  })
                  .strict(),
                z
                  .object({
                    type: z.literal("set_objective"),
                    text: z.string().trim().min(1).max(240),
                  })
                  .strict(),
                z.object({ type: z.literal("set_contract"), contract }).strict(),
                z
                  .object({
                    type: z.literal("add_monster"),
                    kind: z.enum(MONSTER_KINDS),
                    x: z.number().min(0).max(127),
                    z: z.number().min(0).max(127),
                    level: z.number().int().min(1).max(99),
                    weakness: z.string().trim().min(1).max(120),
                  })
                  .strict(),
              ]),
            )
            .min(1)
            .max(32),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("asset_patch"), sceneId: id, assets: z.array(asset).min(1).max(128) })
    .strict(),
]);
export const seedModProposalSchema = z
  .object({
    targetVersion: z
      .string()
      .regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
      .optional(),
    proposalId: z.string().min(1).max(100),
    base: z
      .object({ cartridgeId: id, version: z.string().min(1).max(128), contentHash: hash })
      .strict(),
    authorPrompt: z.string().trim().min(1).max(2000),
    operations: z.array(modOperationSchema).min(1).max(16),
    generatedAt: z.iso.datetime(),
  })
  .strict() as z.ZodType<SeedModProposal>;
