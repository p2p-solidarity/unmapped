import type { PlayerProfile, PlayerProfileInput } from "@shared/player";
import { z } from "zod";

const profileIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const scalarSchema = z.union([z.string(), z.number().finite(), z.boolean()]);

export const playerProfileInputSchema: z.ZodType<PlayerProfileInput> = z
  .object({
    profileId: profileIdSchema.optional(),
    displayName: z.string().trim().min(1).max(80),
    appearance: z.record(z.string().min(1).max(80), z.string().max(240)),
    controlPreferences: z.record(z.string().min(1).max(80), scalarSchema),
  })
  .strict();

export const playerProfileSchema: z.ZodType<PlayerProfile> = z
  .object({
    profileId: profileIdSchema,
    displayName: z.string().trim().min(1).max(80),
    appearance: z.record(z.string().min(1).max(80), z.string().max(240)),
    controlPreferences: z.record(z.string().min(1).max(80), scalarSchema),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export { profileIdSchema };
