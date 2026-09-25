import { parseSceneGenerationRequest } from "@main/inference/sceneGenerationIpc";
import type { SceneGenerationRequest } from "@shared/scene-generation";
import { describe, expect, it } from "vitest";

const scene = `root = Scene("A room", "meadow", [floor, exit])
floor = Floor(8, 8, "grass")
exit = Exit(6, 6, "next", "next-room")`;

function request(purpose: SceneGenerationRequest["intent"]["purpose"]): SceneGenerationRequest {
  return {
    intent: {
      requestId: "request-1",
      purpose,
      brief: "Keep the path readable.",
      language: "en-US",
      sceneId: "room-1",
    },
    state: {
      worldPlan: null,
      currentSceneSource: purpose === "new-room" ? null : scene,
      flags: {},
      inventory: [],
      assetCatalog: [],
      capabilityProfile: { entries: [] },
    },
    maxRepairAttempts: 2,
  };
}

describe("scene generation IPC payload", () => {
  it("parses a state-aware repair request into the service contract", () => {
    const parsed = parseSceneGenerationRequest(request("repair-room"));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.state.currentScene?.name).toBe("A room");
    expect(parsed.value.intent.purpose).toBe("repair-room");
  });

  it("rejects repair and expansion when the renderer omits the current scene", () => {
    const input = request("expand-room");
    input.state.currentSceneSource = null;

    expect(parseSceneGenerationRequest(input)).toMatchObject({
      ok: false,
      error: { code: "invalid-payload" },
    });
  });

  it("rejects unknown fields instead of forwarding them across the trust boundary", () => {
    expect(parseSceneGenerationRequest({ ...request("new-room"), surprise: true })).toMatchObject({
      ok: false,
      error: { code: "invalid-payload" },
    });
  });
});
