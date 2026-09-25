import { AppleLocalSceneProvider } from "@main/inference/appleLocalProvider";
import type { NativeEvent, NativeRequest, NativeTransport } from "@main/inference/nativeTransport";
import { fail, ok, type Result } from "@shared/result";
import type { SceneState } from "@shared/scene-generation";
import { describe, expect, it } from "vitest";
import {
  afmCapabilitiesPayload,
  afmEventsPayload,
  afmLayoutPayload,
  terminalResult,
} from "../fixtures/afm";

class FakeTransport implements NativeTransport {
  readonly requests: NativeRequest[] = [];
  readonly cancellations: string[] = [];

  constructor(
    private readonly respond: (request: NativeRequest) => NativeEvent | undefined,
    private readonly cancelResult: Result<void> = ok(undefined),
  ) {}

  async request(request: NativeRequest, onEvent: (event: NativeEvent) => void) {
    this.requests.push(request);
    const event = this.respond(request);
    if (event !== undefined) onEvent(event);
    return ok(undefined);
  }

  async cancel(requestId: string) {
    this.cancellations.push(requestId);
    return this.cancelResult;
  }

  async close() {
    return ok(undefined);
  }
}

describe("AppleLocalSceneProvider", () => {
  it("marks the provider unavailable when native layout vocabulary drifts", async () => {
    const transport = new FakeTransport((request) =>
      terminalResult(
        request,
        afmCapabilitiesPayload({
          layoutVocabulary: { biomes: ["drifted"], tiles: ["grass"], propKinds: ["tree"] },
        }),
      ),
    );

    const result = await new AppleLocalSceneProvider(transport).capabilities();

    expect(result).toMatchObject({
      ok: true,
      value: { available: false, unavailableReason: "native_vocabulary_mismatch" },
    });
  });

  it("preserves the native availability reason before checking vocabulary", async () => {
    const transport = new FakeTransport((request) =>
      terminalResult(
        request,
        afmCapabilitiesPayload({
          foundationModels: {
            compiled: true,
            runtimeAvailable: false,
            status: "apple_intelligence_not_enabled",
            guidedGeneration: false,
            contextTokens: null,
          },
          layoutVocabulary: { biomes: [], tiles: [], propKinds: [] },
        }),
      ),
    );

    const result = await new AppleLocalSceneProvider(transport).capabilities();

    expect(result).toMatchObject({
      ok: true,
      value: { available: false, unavailableReason: "apple_intelligence_not_enabled" },
    });
  });

  it.each(["repair-room", "expand-room"] as const)(
    "includes the current scene in a state-aware %s request",
    async (purpose) => {
      const transport = new FakeTransport((request) => {
        if (request.method === "generateEvents") {
          return terminalResult(request, afmEventsPayload());
        }
        return terminalResult(request, afmLayoutPayload());
      });
      const result = await new AppleLocalSceneProvider(transport).generateScene(
        {
          requestId: `${purpose}-1`,
          purpose,
          sceneId: "room-1",
          brief: "keep the route readable",
          language: "en-US",
        },
        {
          worldPlan: null,
          currentScene: {
            name: "Existing room",
            biome: "meadow",
            floor: { width: 8, depth: 8, tile: "grass" },
            patches: [],
            platforms: [],
            walls: [],
            props: [],
            npcs: [],
            monsters: [],
            treasures: [],
            exits: [],
            lights: [],
            sky: null,
            triggers: [],
            quests: [],
            contract: null,
          },
          flags: { gateOpen: true },
          inventory: [],
          assetCatalog: [],
          capabilityProfile: { entries: [] },
        },
        { signal: new AbortController().signal, maxRepairAttempts: 1 },
      );

      expect(result.ok).toBe(true);
      expect(transport.requests[0]?.payload).toMatchObject({ purpose });
      expect(JSON.stringify(transport.requests[0]?.payload)).toContain("Existing room");
      expect(JSON.stringify(transport.requests[0]?.payload)).toContain("gateOpen");
    },
  );

  it("rejects state-aware requests without a current scene", async () => {
    const transport = new FakeTransport(() => undefined);
    const result = await new AppleLocalSceneProvider(transport).generateScene(
      {
        requestId: "repair-1",
        purpose: "repair-room",
        sceneId: "room-1",
        brief: "repair it",
        language: "en-US",
      },
      {} as SceneState,
      { signal: new AbortController().signal, maxRepairAttempts: 1 },
    );

    expect(result).toMatchObject({ ok: false, error: { code: "scene-state-required" } });
    expect(transport.requests).toEqual([]);
  });

  it("cancels the active helper request when the caller aborts", async () => {
    const transport = new FakeTransport((request) => ({
      v: 1,
      requestId: request.requestId,
      seq: 1,
      type: "accepted",
    }));
    const provider = new AppleLocalSceneProvider(transport);
    const controller = new AbortController();
    const generation = provider.generateScene(
      {
        requestId: "request-abort",
        purpose: "new-room",
        sceneId: "room-1",
        brief: "A quiet room",
        language: "en-US",
      },
      {} as SceneState,
      { signal: controller.signal, maxRepairAttempts: 1 },
    );

    controller.abort();
    const result = await generation;

    expect(result).toMatchObject({ ok: false, error: { code: "request-aborted" } });
    expect(transport.cancellations).toEqual([transport.requests[0]?.requestId]);
  });

  it("surfaces a typed cancellation write failure", async () => {
    const transport = new FakeTransport(
      (request) => ({
        v: 1,
        requestId: request.requestId,
        seq: 1,
        type: "accepted",
      }),
      fail({ code: "native-helper-write", message: "closed pipe" }),
    );
    const provider = new AppleLocalSceneProvider(transport);
    const controller = new AbortController();
    const generation = provider.generateScene(
      {
        requestId: "request-cancel-failure",
        purpose: "new-room",
        sceneId: "room-1",
        brief: "A quiet room",
        language: "en-US",
      },
      {} as SceneState,
      { signal: controller.signal, maxRepairAttempts: 1 },
    );

    controller.abort();

    await expect(generation).resolves.toMatchObject({
      ok: false,
      error: { code: "native-helper-write", message: "closed pipe" },
    });
  });
});
