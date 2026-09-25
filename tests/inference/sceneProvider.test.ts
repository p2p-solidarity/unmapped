import { SceneProviderRouter } from "@main/inference/sceneProvider";
import { ok, type Result } from "@shared/result";
import type {
  GenerationOptions,
  ProviderCapabilities,
  ProviderId,
  SceneDraft,
  SceneIntent,
  SceneProvider,
  SceneState,
} from "@shared/scene-generation";
import { describe, expect, it } from "vitest";

function capabilities(
  providerId: ProviderId,
  available = true,
  supportedPurposes?: ProviderCapabilities["supportedPurposes"],
): ProviderCapabilities {
  return {
    providerId,
    available,
    locality: providerId === "apple-pcc" ? "private-cloud" : "device",
    constraintModes: ["json-schema"],
    contextTokens: 8_192,
    supportsStreaming: true,
    supportsReasoning: providerId === "apple-pcc",
    supportedPurposes,
  };
}

function draft(providerId: ProviderId, purpose: SceneIntent["purpose"]): SceneDraft {
  return {
    requestId: "request-1",
    providerId,
    purpose,
    source: null,
    ast: null,
    graph: null,
    worldPlan:
      purpose === "world-plan"
        ? {
            worldId: "world-1",
            premise: "a quiet world",
            rooms: [],
            entryRoomId: "room-1",
            terminalRoomIds: [],
          }
        : null,
  };
}

function intent(purpose: SceneIntent["purpose"]): SceneIntent {
  return {
    requestId: "request-1",
    purpose,
    brief: "a quiet room",
    language: "en-US",
    sceneId: "room-1",
  };
}

const state = {} as SceneState;
const options: GenerationOptions = { signal: new AbortController().signal, maxRepairAttempts: 2 };

class FakeProvider implements SceneProvider {
  readonly calls: string[] = [];

  constructor(
    readonly id: ProviderId,
    private readonly advertised: Result<ProviderCapabilities>,
    private readonly result?: Result<SceneDraft>,
  ) {}

  async capabilities(): Promise<Result<ProviderCapabilities>> {
    return this.advertised;
  }

  async generateScene(
    receivedIntent: SceneIntent,
    _receivedState: SceneState,
    _receivedOptions: GenerationOptions,
  ): Promise<Result<SceneDraft>> {
    this.calls.push(receivedIntent.requestId);
    return this.result ?? ok(draft(this.id, receivedIntent.purpose));
  }
}

describe("SceneProviderRouter", () => {
  it("returns an actionable typed error when no suitable provider is available", async () => {
    const pcc = new FakeProvider("apple-pcc", ok(capabilities("apple-pcc", true, ["world-plan"])));
    const router = new SceneProviderRouter([pcc]);
    const events: string[] = [];

    const result = await router.generateScene(intent("new-room"), state, {
      ...options,
      onEvent: (event) => events.push(event.type),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("no-suitable-provider");
      expect(result.error.hint).toContain("local");
    }
    expect(events).toEqual(["error"]);
  });
});
