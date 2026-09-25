// Capability negotiation and provider routing. This module deliberately knows nothing about a
// provider's wire protocol; adapters implement SceneProvider and return typed Results.

import { type AppError, ok, type Result } from "@shared/result";
import type {
  GenerationEvent,
  GenerationOptions,
  ProviderCapabilities,
  ProviderId,
  SceneDraft,
  SceneGenerationPurpose,
  SceneIntent,
  SceneProvider,
  SceneState,
} from "@shared/scene-generation";

export interface ProviderSelection {
  provider: SceneProvider;
  capabilities: ProviderCapabilities;
}

export type SceneProviderErrorCode =
  | "no-suitable-provider"
  | "provider-capabilities-failed"
  | "provider-generation-failed"
  | "duplicate-request-id"
  | "request-aborted";

export interface SceneProviderError extends AppError {
  code: SceneProviderErrorCode;
}

const PREFERENCE: Record<SceneGenerationPurpose, readonly ProviderId[]> = {
  "world-plan": ["apple-pcc", "apple-local", "llamacpp", "openai-compatible"],
  "new-room": ["apple-local", "llamacpp", "openai-compatible"],
  "repair-room": ["apple-local", "llamacpp", "openai-compatible"],
  "expand-room": ["apple-local", "llamacpp", "openai-compatible"],
};

const localHint =
  "Start Apple Foundation Models or llama.cpp locally, or configure an OpenAI-compatible endpoint.";

function providerError(
  code: SceneProviderErrorCode,
  message: string,
  hint?: string,
): Result<never, SceneProviderError> {
  return {
    ok: false,
    error: hint === undefined ? { code, message } : { code, message, hint },
  };
}

function isAbort(signal: AbortSignal): boolean {
  return signal.aborted;
}

function supportsPurpose(
  capabilities: ProviderCapabilities,
  purpose: SceneGenerationPurpose,
): boolean {
  if (!capabilities.available) return false;
  if (capabilities.providerId === "apple-pcc" && purpose !== "world-plan") return false;
  return capabilities.supportedPurposes?.includes(purpose) ?? true;
}

function emit(options: GenerationOptions, event: GenerationEvent): void {
  try {
    options.onEvent?.(event);
  } catch {
    // Event listeners are observers; a UI listener must not turn a provider result into a throw.
  }
}

/** Routes by declared capabilities, with deterministic local-first fallback for room work. */
export class SceneProviderRouter {
  private readonly providers: readonly SceneProvider[];
  private readonly activeRequests = new Set<string>();

  constructor(providers: readonly SceneProvider[]) {
    const unique = new Map<ProviderId, SceneProvider>();
    for (const provider of providers) {
      if (!unique.has(provider.id)) unique.set(provider.id, provider);
    }
    this.providers = [...unique.values()];
  }

  async capabilities(): Promise<Result<ProviderCapabilities[]>> {
    const values: ProviderCapabilities[] = [];
    let lastFailure: SceneProviderError | undefined;
    for (const provider of this.providers) {
      const result = await this.readCapabilities(provider);
      if (result.ok) values.push(result.value);
      else lastFailure = result.error;
    }
    if (values.length === 0 && lastFailure !== undefined) return { ok: false, error: lastFailure };
    return ok(values);
  }

  async selectProvider(intent: SceneIntent): Promise<Result<ProviderSelection>> {
    const purpose = intent.purpose;
    const inspected = await this.inspectProviders();
    const order = PREFERENCE[purpose];
    for (const id of order) {
      const candidate = inspected.get(id);
      if (candidate !== undefined && candidate.capabilities.providerId === id) {
        if (supportsPurpose(candidate.capabilities, purpose)) return ok(candidate);
      }
    }
    return this.noSuitableProvider(purpose, inspected);
  }

  /** Provider-facing operation used by the Gate 1 service until validation is wired in. */
  async generateScene(
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneDraft>> {
    if (isAbort(options.signal)) {
      emit(options, { type: "cancelled", requestId: intent.requestId });
      return providerError("request-aborted", "Scene generation was cancelled.");
    }
    if (this.activeRequests.has(intent.requestId)) {
      const duplicate = providerError(
        "duplicate-request-id",
        `A scene generation request with id ${intent.requestId} is already running.`,
        "Wait for the existing request to finish before retrying.",
      );
      if (!duplicate.ok)
        emit(options, { type: "error", requestId: intent.requestId, error: duplicate.error });
      return duplicate;
    }
    this.activeRequests.add(intent.requestId);
    try {
      const inspected = await this.inspectProviders();
      const candidates = this.orderedCandidates(intent.purpose, inspected);
      if (candidates.length === 0) {
        const unavailable = this.noSuitableProvider(intent.purpose, inspected);
        if (!unavailable.ok)
          emit(options, { type: "error", requestId: intent.requestId, error: unavailable.error });
        return unavailable;
      }
      const first = candidates[0];
      if (first === undefined) {
        const unavailable = this.noSuitableProvider(intent.purpose, inspected);
        if (!unavailable.ok)
          emit(options, { type: "error", requestId: intent.requestId, error: unavailable.error });
        return unavailable;
      }

      emit(options, {
        type: "started",
        requestId: intent.requestId,
        providerId: first.provider.id,
      });
      let lastError: AppError | undefined;
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate === undefined) continue;
        if (isAbort(options.signal)) {
          emit(options, { type: "cancelled", requestId: intent.requestId });
          return providerError("request-aborted", "Scene generation was cancelled.");
        }
        emit(options, {
          type: "provider-selected",
          requestId: intent.requestId,
          providerId: candidate.provider.id,
        });
        const result = await this.runProvider(candidate.provider, intent, state, options);
        if (result.ok) {
          if (result.value.providerId !== candidate.provider.id) {
            lastError = {
              code: "provider-generation-failed",
              message: `Provider ${candidate.provider.id} returned a draft for ${result.value.providerId}.`,
              hint: "Update the provider adapter so its draft identifies the provider that generated it.",
            };
          } else if (intent.purpose === "world-plan" && result.value.worldPlan === null) {
            lastError = {
              code: "provider-generation-failed",
              message: `Provider ${candidate.provider.id} returned no world plan for a world-plan request.`,
              hint: "Return a complete RoomGraph before attempting room-level generation.",
            };
          } else {
            emit(options, {
              type: "completed",
              requestId: intent.requestId,
              providerId: candidate.provider.id,
            });
            return result;
          }
        } else {
          lastError = result.error;
        }
        const next = candidates[index + 1];
        if (next !== undefined) {
          emit(options, {
            type: "provider-fallback",
            requestId: intent.requestId,
            from: candidate.provider.id,
            to: next.provider.id,
            reason: lastError?.message ?? "The provider could not produce a draft.",
          });
        }
      }
      const failed = providerError(
        "provider-generation-failed",
        lastError?.message ?? `All suitable providers failed for ${intent.purpose}.`,
        lastError?.hint ?? localHint,
      );
      if (!failed.ok)
        emit(options, { type: "error", requestId: intent.requestId, error: failed.error });
      return failed;
    } finally {
      this.activeRequests.delete(intent.requestId);
    }
  }

  /** Explicit alias for callers that want to distinguish drafts from validated artifacts. */
  generateDraft(intent: SceneIntent, state: SceneState, options: GenerationOptions) {
    return this.generateScene(intent, state, options);
  }

  private orderedCandidates(
    purpose: SceneGenerationPurpose,
    inspected: ReadonlyMap<ProviderId, ProviderSelection>,
  ): ProviderSelection[] {
    return PREFERENCE[purpose]
      .map((id) => inspected.get(id))
      .filter(
        (candidate): candidate is ProviderSelection =>
          candidate !== undefined && supportsPurpose(candidate.capabilities, purpose),
      );
  }

  private async inspectProviders(): Promise<Map<ProviderId, ProviderSelection>> {
    const inspected = new Map<ProviderId, ProviderSelection>();
    for (const provider of this.providers) {
      const result = await this.readCapabilities(provider);
      if (result.ok) inspected.set(provider.id, { provider, capabilities: result.value });
    }
    return inspected;
  }

  private async readCapabilities(
    provider: SceneProvider,
  ): Promise<Result<ProviderCapabilities, SceneProviderError>> {
    try {
      const result = await provider.capabilities();
      if (!result.ok) {
        return providerError(
          "provider-capabilities-failed",
          `Could not inspect ${provider.id}: ${result.error.message}`,
          result.error.hint ?? localHint,
        );
      }
      if (result.value.providerId !== provider.id) {
        return providerError(
          "provider-capabilities-failed",
          `Provider ${provider.id} advertised capabilities for ${result.value.providerId}.`,
          "Update the provider adapter so capability and provider IDs match.",
        );
      }
      return result;
    } catch (error) {
      return providerError(
        "provider-capabilities-failed",
        `Could not inspect ${provider.id}: ${error instanceof Error ? error.message : String(error)}`,
        localHint,
      );
    }
  }

  private async runProvider(
    provider: SceneProvider,
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneDraft, AppError>> {
    try {
      const result = await provider.generateScene(intent, state, options);
      if (!result.ok && options.signal.aborted) {
        return providerError("request-aborted", "Scene generation was cancelled.");
      }
      return result;
    } catch (error) {
      return providerError(
        "provider-generation-failed",
        `${provider.id} failed while generating the scene: ${error instanceof Error ? error.message : String(error)}`,
        provider.id === "apple-pcc" ? localHint : "Check the provider and retry the request.",
      );
    }
  }

  private noSuitableProvider(
    purpose: SceneGenerationPurpose,
    inspected: ReadonlyMap<ProviderId, ProviderSelection>,
  ): Result<never, SceneProviderError> {
    const unavailable = PREFERENCE[purpose].filter((id) => !inspected.has(id)).join(", ");
    const suffix = unavailable.length > 0 ? ` Unavailable providers: ${unavailable}.` : "";
    return providerError(
      "no-suitable-provider",
      `No suitable provider is available for ${purpose}.${suffix}`,
      localHint,
    );
  }
}

export function createSceneProviderRouter(
  providers: readonly SceneProvider[],
): SceneProviderRouter {
  return new SceneProviderRouter(providers);
}

export const createProviderRouter = createSceneProviderRouter;
export const ProviderRouter = SceneProviderRouter;
