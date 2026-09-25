// Main-process adapter for the persistent Swift Foundation Models helper. The native wire stays
// private to this module; callers only see the provider-neutral SceneProvider contract.

import { isDeepStrictEqual } from "node:util";
import { serializeScene } from "@dsl";
import type { Result } from "@shared/result";
import { fail, ok } from "@shared/result";
import type {
  GenerationOptions,
  ProviderCapabilities,
  SceneDraft,
  SceneIntent,
  SceneProvider,
  SceneState,
} from "@shared/scene-generation";
import { BIOMES, PROP_KINDS, TILES } from "@shared/world";
import { z } from "zod";
import {
  NATIVE_PROTOCOL_VERSION,
  type NativeEvent,
  type NativeMethod,
  type NativeTransport,
} from "./nativeTransport";

const methodSchema = z
  .object({
    method: z.string(),
    status: z.enum(["available", "unsupported"]),
  })
  .strict();

const capabilitiesSchema = z
  .object({
    protocolVersion: z.literal(NATIVE_PROTOCOL_VERSION),
    bridgeVersion: z.string(),
    platform: z.literal("macOS"),
    operatingSystem: z.string(),
    foundationModels: z
      .object({
        compiled: z.boolean(),
        runtimeAvailable: z.boolean(),
        status: z.string(),
        guidedGeneration: z.boolean().optional(),
        contextTokens: z.number().int().positive().nullable().optional(),
      })
      .strict(),
    methods: z.array(methodSchema),
    layoutVocabulary: z
      .object({
        biomes: z.array(z.string()),
        tiles: z.array(z.string()),
        propKinds: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const predicateSchema = z
  .object({
    key: z.string().min(1),
    operator: z.enum(["equals", "not-equals", "exists"]),
    value: scalarSchema.optional(),
  })
  .strict();
const effectSchema = z
  .object({
    key: z.string().min(1),
    operation: z.enum(["set", "remove"]),
    value: scalarSchema,
  })
  .strict();
const causalEventSchema = z
  .object({
    id: z.string().min(1),
    trigger: z.enum(["enter", "interact", "exit"]),
    subjectId: z.string().min(1).nullable(),
    requires: z.array(predicateSchema),
    effects: z.array(effectSchema),
    nextEventIds: z.array(z.string().min(1)),
  })
  .strict();
const eventPlanSchema = z
  .object({
    entryEventId: z.string().min(1),
    events: z.array(causalEventSchema).min(1),
    terminalEventIds: z.array(z.string().min(1)).min(1),
  })
  .strict();
const subjectRequirementSchema = z
  .object({ id: z.string().regex(/^prop[1-9]\d*$/), kind: z.enum(PROP_KINDS) })
  .strict();
const metricsSchema = z
  .object({
    durationMs: z.number().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    cachedInputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    reasoningTokens: z.number().int().nonnegative(),
  })
  .strict();
const generatedEventsSchema = z
  .object({
    sceneId: z.string().min(1),
    eventPlan: eventPlanSchema,
    subjectRequirements: z.array(subjectRequirementSchema),
    metrics: metricsSchema,
  })
  .strict();
const sceneAstSchema = z
  .object({
    sceneId: z.string().min(1),
    eventPlan: eventPlanSchema,
    floor: z
      .object({ width: z.number().int(), depth: z.number().int(), tile: z.string() })
      .strict(),
    objects: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.string().min(1),
          x: z.number(),
          z: z.number(),
          assetId: z.string().optional(),
        })
        .strict(),
    ),
    exits: z.array(
      z
        .object({
          id: z.string().min(1),
          x: z.number(),
          z: z.number(),
          targetSceneId: z.string().nullable(),
        })
        .strict(),
    ),
    lights: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.string().min(1),
          color: z.string(),
          intensity: z.number(),
          x: z.number().optional(),
          z: z.number().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const generatedLayoutSchema = z
  .object({
    sceneId: z.string().min(1),
    source: z.string().min(1),
    ast: sceneAstSchema,
    metrics: metricsSchema,
  })
  .strict();

const supportedPurposes = ["new-room", "repair-room", "expand-room"] as const;

function stateContext(intent: SceneIntent, state: SceneState): Result<string> {
  const currentScene = state.currentScene ?? null;
  if (intent.purpose !== "new-room" && currentScene === null) {
    return nativeFailure(
      "scene-state-required",
      `${intent.purpose} requires the current scene.`,
      "Reload the scene before retrying this generation request.",
    );
  }
  return ok(
    JSON.stringify({
      purpose: intent.purpose,
      currentScene: currentScene === null ? null : serializeScene(currentScene),
      worldPlan: state.worldPlan ?? null,
      flags: state.flags ?? {},
      inventory: state.inventory ?? [],
      capabilityProfile: state.capabilityProfile ?? { entries: [] },
      allowedAssetIds: (state.assetCatalog ?? []).map((asset) => asset.assetId),
    }),
  );
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function requirementsMatch(
  plan: z.infer<typeof eventPlanSchema>,
  requirements: z.infer<typeof subjectRequirementSchema>[],
): boolean {
  const expected = new Set(
    plan.events
      .filter((event) => event.trigger === "interact")
      .map((event) => event.subjectId)
      .filter((subject): subject is string => subject !== null),
  );
  const actual = new Set(requirements.map((requirement) => requirement.id));
  return (
    actual.size === requirements.length &&
    actual.size === expected.size &&
    [...expected].every((subject) => actual.has(subject))
  );
}

function nativeFailure(code: string, message: string, hint?: string): Result<never> {
  return fail(hint === undefined ? { code, message } : { code, message, hint });
}

export class AppleLocalSceneProvider implements SceneProvider {
  readonly id = "apple-local" as const;
  private sequence = 0;

  constructor(
    private readonly transport: NativeTransport,
    private readonly timeoutMs = 120_000,
  ) {}

  async capabilities(): Promise<Result<ProviderCapabilities>> {
    const response = await this.request("capabilities", {});
    if (!response.ok) return response;
    const parsed = capabilitiesSchema.safeParse(response.value);
    if (!parsed.success) {
      return nativeFailure(
        "native-invalid-capabilities",
        "The Foundation Models helper returned an invalid capability response.",
        parsed.error.issues[0]?.message,
      );
    }
    const methods = new Map(parsed.data.methods.map((entry) => [entry.method, entry.status]));
    const vocabularyMatches =
      sameOrderedValues(parsed.data.layoutVocabulary.biomes, BIOMES) &&
      sameOrderedValues(parsed.data.layoutVocabulary.tiles, TILES) &&
      sameOrderedValues(parsed.data.layoutVocabulary.propKinds, PROP_KINDS);
    const runtimeReady =
      parsed.data.foundationModels.runtimeAvailable &&
      parsed.data.foundationModels.guidedGeneration === true &&
      methods.get("generateEvents") === "available" &&
      methods.get("generateLayout") === "available";
    const available = runtimeReady && vocabularyMatches;
    return ok({
      providerId: this.id,
      available,
      locality: "device",
      constraintModes: ["swift-generable"],
      contextTokens: parsed.data.foundationModels.contextTokens ?? null,
      supportsStreaming: false,
      supportsReasoning: false,
      supportedPurposes,
      ...(available
        ? {}
        : {
            unavailableReason: runtimeReady
              ? "native_vocabulary_mismatch"
              : parsed.data.foundationModels.status,
          }),
    });
  }

  async generateScene(
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneDraft>> {
    const context = stateContext(intent, state);
    if (!context.ok) return context;
    if (options.signal.aborted) {
      return nativeFailure("request-aborted", "Foundation Models generation was cancelled.");
    }

    this.emitProgress(options, intent, "events");
    const eventResponse = await this.request(
      "generateEvents",
      {
        sceneId: intent.sceneId,
        brief: intent.brief,
        language: intent.language,
        purpose: intent.purpose,
        origin: intent.sceneId === "origin",
        stateContext: context.value,
      },
      options.signal,
    );
    if (!eventResponse.ok) return eventResponse;
    const events = generatedEventsSchema.safeParse(eventResponse.value);
    if (!events.success || events.data.sceneId !== intent.sceneId) {
      return nativeFailure(
        "native-invalid-event-plan",
        "The Foundation Models helper returned an invalid event plan.",
        events.success ? "The generated sceneId did not match the request." : events.error.message,
      );
    }
    if (!requirementsMatch(events.data.eventPlan, events.data.subjectRequirements)) {
      return nativeFailure(
        "native-invalid-subject-requirements",
        "The Foundation Models helper returned inconsistent subject requirements.",
        "Every interact event must map to exactly one typed prop requirement.",
      );
    }

    this.emitProgress(options, intent, "layout");
    const layoutResponse = await this.request(
      "generateLayout",
      {
        sceneId: intent.sceneId,
        brief: intent.brief,
        language: intent.language,
        purpose: intent.purpose,
        origin: intent.sceneId === "origin",
        stateContext: context.value,
        eventPlan: events.data.eventPlan,
        subjectRequirements: events.data.subjectRequirements,
      },
      options.signal,
    );
    if (!layoutResponse.ok) return layoutResponse;
    const layout = generatedLayoutSchema.safeParse(layoutResponse.value);
    if (!layout.success || layout.data.sceneId !== intent.sceneId) {
      return nativeFailure(
        "native-invalid-layout",
        "The Foundation Models helper returned an invalid scene layout.",
        layout.success ? "The generated sceneId did not match the request." : layout.error.message,
      );
    }
    if (!isDeepStrictEqual(layout.data.ast.eventPlan, events.data.eventPlan)) {
      return nativeFailure(
        "native-event-plan-changed",
        "The layout response changed the validated causal event plan.",
        "Regenerate layout from the original event plan.",
      );
    }
    const requiredKinds = new Map(
      events.data.subjectRequirements.map((requirement) => [requirement.id, requirement.kind]),
    );
    const subjectsMatch = [...requiredKinds].every(([id, kind]) =>
      layout.data.ast.objects.some((object) => object.id === id && object.kind === kind),
    );
    if (!subjectsMatch) {
      return nativeFailure(
        "native-layout-subject-mismatch",
        "The layout does not contain every required event subject.",
        "Regenerate the layout from the validated subject requirements.",
      );
    }
    return ok({
      requestId: intent.requestId,
      providerId: this.id,
      purpose: intent.purpose,
      source: layout.data.source,
      ast: layout.data.ast,
      graph: null,
      worldPlan: null,
    });
  }

  close(): Promise<Result<void>> {
    return this.transport.close();
  }

  private emitProgress(options: GenerationOptions, intent: SceneIntent, phase: string): void {
    try {
      options.onEvent?.({
        type: "progress",
        requestId: intent.requestId,
        providerId: this.id,
        phase,
      });
    } catch {
      // Observers cannot break provider execution.
    }
  }

  private async request(
    method: NativeMethod,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<Result<unknown>> {
    if (signal?.aborted) {
      return nativeFailure("request-aborted", "Foundation Models generation was cancelled.");
    }
    this.sequence += 1;
    const requestId = `apple-local-${method}-${this.sequence}`;
    return new Promise((resolve) => {
      let settled = false;
      let cancelling = false;
      const finish = (result: Result<unknown>) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        resolve(result);
      };
      const cancelAndFinish = async (fallback: Result<never>): Promise<void> => {
        if (settled || cancelling) return;
        cancelling = true;
        try {
          const cancelled = await this.transport.cancel(requestId);
          finish(cancelled.ok ? fallback : cancelled);
        } catch (cause) {
          finish(
            nativeFailure(
              "native-cancel-failed",
              cause instanceof Error ? cause.message : String(cause),
              "Restart the helper before retrying generation.",
            ),
          );
        }
      };
      const abort = () => {
        void cancelAndFinish(
          nativeFailure("request-aborted", "Foundation Models generation was cancelled."),
        );
      };
      const handle = (event: NativeEvent) => {
        if (event.type === "result") finish(ok(event.payload));
        else if (event.type === "error") finish(fail(event.error));
        else if (event.type === "cancelled") {
          finish(nativeFailure("request-aborted", "Foundation Models generation was cancelled."));
        }
      };
      const timer = setTimeout(() => {
        void cancelAndFinish(
          nativeFailure(
            "native-helper-timeout",
            `The Foundation Models helper did not finish ${method} in time.`,
            "Retry the request; if it repeats, restart the app or use another provider.",
          ),
        );
      }, this.timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      void this.transport
        .request({ v: NATIVE_PROTOCOL_VERSION, requestId, method, payload }, handle)
        .then((started) => {
          if (!started.ok) finish(started);
        })
        .catch((cause: unknown) => {
          finish(
            nativeFailure(
              "native-helper-request",
              cause instanceof Error ? cause.message : String(cause),
            ),
          );
        });
    });
  }
}
