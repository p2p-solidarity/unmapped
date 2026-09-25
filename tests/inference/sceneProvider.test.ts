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
  it("uses PCC for world plans when PCC is available", async () => {
    const local = new FakeProvider("apple-local", ok(capabilities("apple-local")));
    const pcc = new FakeProvider("apple-pcc", ok(capabilities("apple-pcc", true, ["world-plan"])));
    const router = new SceneProviderRouter([local, pcc]);

    const selected = await router.selectProvider(intent("world-plan"));

    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.value.provider.id).toBe("apple-pcc");
  });

  it("falls back to local for a world plan when PCC is unavailable", async () => {
    const local = new FakeProvider("apple-local", ok(capabilities("apple-local")));
    const pcc = new FakeProvider("apple-pcc", ok(capabilities("apple-pcc", false, ["world-plan"])));
    const router = new SceneProviderRouter([pcc, local]);

    const result = await router.generateScene(intent("world-plan"), state, options);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.providerId).toBe("apple-local");
    expect(local.calls).toEqual(["request-1"]);
    expect(pcc.calls).toEqual([]);
  });

  it("prefers local providers for room generation and never routes a room to PCC", async () => {
    const pcc = new FakeProvider("apple-pcc", ok(capabilities("apple-pcc", true, ["world-plan"])));
    const llama = new FakeProvider("llamacpp", ok(capabilities("llamacpp")));
    const remote = new FakeProvider("openai-compatible", ok(capabilities("openai-compatible")));
    const router = new SceneProviderRouter([remote, pcc, llama]);

    const result = await router.generateScene(intent("new-room"), state, options);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.providerId).toBe("llamacpp");
    expect(pcc.calls).toEqual([]);
  });

  it("falls through an unavailable local provider to OpenAI-compatible", async () => {
    const local = new FakeProvider("apple-local", ok(capabilities("apple-local", false)));
    const remote = new FakeProvider("openai-compatible", ok(capabilities("openai-compatible")));
    const router = new SceneProviderRouter([local, remote]);

    const result = await router.generateScene(intent("new-room"), state, options);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.providerId).toBe("openai-compatible");
  });

  it("falls through a local generation failure to the next capable provider", async () => {
    const local = new FakeProvider("apple-local", ok(capabilities("apple-local")), {
      ok: false,
      error: {
        code: "connection-refused",
        message: "Apple Foundation Models is not running.",
        hint: "Start the local model or use llama.cpp.",
      },
    });
    const llama = new FakeProvider("llamacpp", ok(capabilities("llamacpp")));
    const router = new SceneProviderRouter([local, llama]);

    const result = await router.generateScene(intent("new-room"), state, options);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.providerId).toBe("llamacpp");
    expect(local.calls).toEqual(["request-1"]);
    expect(llama.calls).toEqual(["request-1"]);
  });

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

  it("rejects a world-plan response without a RoomGraph", async () => {
    const local = new FakeProvider(
      "apple-local",
      ok(capabilities("apple-local")),
      ok({ ...draft("apple-local", "world-plan"), worldPlan: null }),
    );
    const router = new SceneProviderRouter([local]);

    const result = await router.generateScene(intent("world-plan"), state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "provider-generation-failed" } });
  });

  it("returns a typed capability error when every provider probe fails", async () => {
    const broken = new FakeProvider("apple-local", {
      ok: false,
      error: { code: "bridge-unavailable", message: "Foundation Models is unavailable." },
    });
    const router = new SceneProviderRouter([broken]);

    const result = await router.capabilities();

    expect(result).toMatchObject({ ok: false, error: { code: "provider-capabilities-failed" } });
  });
});
