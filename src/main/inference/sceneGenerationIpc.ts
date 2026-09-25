// Runtime validation for the untrusted renderer half of scene generation. The renderer sends the
// current OpenUI source; main reparses it so a structured-cloned graph can never bypass the DSL.

import { parseScene } from "@dsl";
import { CAPABILITY_KEYS } from "@shared/capabilities";
import type { ContentHash } from "@shared/cartridge";
import { fail, ok, type Result } from "@shared/result";
import type {
  SceneGenerationRequest,
  SceneIntent,
  SceneState,
} from "@shared/scene-generation";
import { ITEM_KINDS } from "@shared/world";
import { z } from "zod";

const MAX_SOURCE = 200_000;
const scalarSchema = z.union([z.string().max(2_000), z.number().finite(), z.boolean()]);
const contentHashSchema = z.custom<ContentHash>(
  (value) => typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value),
);

const roomNodeSchema = z
  .object({
    roomId: z.string().min(1).max(80),
    title: z.string().min(1).max(160),
    summary: z.string().max(2_000),
    requiredCapabilities: z.array(z.string().min(1).max(160)).max(64),
    exits: z.array(z.string().min(1).max(80)).max(64),
  })
  .strict();

const worldPlanSchema = z
  .object({
    worldId: z.string().min(1).max(80),
    premise: z.string().max(4_000),
    rooms: z.array(roomNodeSchema).min(1).max(256),
    entryRoomId: z.string().min(1).max(80),
    terminalRoomIds: z.array(z.string().min(1).max(80)).max(256),
  })
  .strict();

const itemSchema = z
  .object({
    id: z.string().min(1).max(120),
    name: z.string().min(1).max(240),
    kind: z.enum(ITEM_KINDS),
    power: z.number().finite().min(0).max(100),
    perk: z.string().max(2_000),
    curse: z.string().max(2_000).nullable(),
    meshDna: z.array(z.string().min(1).max(120)).max(64),
    archetype: z.array(z.string().min(1).max(120)).max(64),
    flavor: z.string().max(2_000),
  })
  .strict();

const assetSchema = z
  .object({
    assetId: z.string().min(1).max(160),
    role: z.enum(["environment", "character", "weapon", "vehicle", "ui", "audio"]),
    path: z.string().min(1).max(240),
    contentHash: contentHashSchema,
  })
  .strict();

const capabilityProfileSchema = z
  .object({
    entries: z
      .array(
        z
          .object({
            key: z.enum(CAPABILITY_KEYS),
            value: z.string().min(1).max(120),
            moduleId: z.string().min(1).max(120),
          })
          .strict(),
      )
      .max(128),
  })
  .strict();

const intentSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    purpose: z.enum(["world-plan", "new-room", "repair-room", "expand-room"]),
    brief: z.string().trim().min(1).max(4_000),
    language: z.string().min(1).max(32),
    sceneId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/),
    topology: roomNodeSchema.optional(),
  })
  .strict();

const stateSchema = z
  .object({
    worldPlan: worldPlanSchema.nullable(),
    currentSceneSource: z.string().max(MAX_SOURCE).nullable(),
    flags: z.record(z.string().min(1).max(120), scalarSchema),
    inventory: z.array(itemSchema).max(512),
    assetCatalog: z.array(assetSchema).max(2_048),
    capabilityProfile: capabilityProfileSchema,
  })
  .strict();

const requestSchema = z
  .object({
    intent: intentSchema,
    state: stateSchema,
    maxRepairAttempts: z.number().int().min(0).max(2),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      (value.intent.purpose === "repair-room" || value.intent.purpose === "expand-room") &&
      value.state.currentSceneSource === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["state", "currentSceneSource"],
        message: `${value.intent.purpose} requires the current scene source.`,
      });
    }
  });

export interface ParsedSceneGenerationRequest {
  intent: SceneIntent;
  state: SceneState;
  maxRepairAttempts: number;
}

function invalid(message: string): Result<never> {
  return fail({
    code: "invalid-payload",
    message: "Rejected a malformed scene generation request from the renderer.",
    hint: message,
  });
}

export function parseSceneGenerationRequest(raw: unknown): Result<ParsedSceneGenerationRequest> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Invalid request.");
  const request: SceneGenerationRequest = parsed.data;
  const current = request.state.currentSceneSource;
  const graph = current === null ? null : parseScene(current);
  if (graph !== null && !graph.ok) return invalid(`currentSceneSource: ${graph.error.message}`);
  return ok({
    intent: request.intent,
    state: {
      worldPlan: request.state.worldPlan,
      currentScene: graph?.value ?? null,
      flags: request.state.flags,
      inventory: request.state.inventory,
      assetCatalog: request.state.assetCatalog,
      capabilityProfile: request.state.capabilityProfile,
    },
    maxRepairAttempts: request.maxRepairAttempts,
  });
}
