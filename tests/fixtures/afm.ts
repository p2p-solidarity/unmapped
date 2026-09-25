// Native AFM wire fixtures. These stay outside production code and model the bridge contract,
// never generated gameplay content used by the application.

import type { NativeRequest } from "@main/inference/nativeTransport";
import { BIOMES, PROP_KINDS, TILES } from "@shared/world";

export const afmEventPlan = {
  entryEventId: "enter_room",
  events: [
    {
      id: "enter_room",
      trigger: "enter" as const,
      subjectId: null,
      requires: [],
      effects: [],
      nextEventIds: [],
    },
  ],
  terminalEventIds: ["enter_room"],
};

export function afmCapabilitiesPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    protocolVersion: 1,
    bridgeVersion: "0.2.0",
    platform: "macOS",
    operatingSystem: "Version 27.0",
    foundationModels: {
      compiled: true,
      runtimeAvailable: true,
      status: "available",
      guidedGeneration: true,
      contextTokens: 4096,
    },
    methods: [
      { method: "capabilities", status: "available" },
      { method: "generateEvents", status: "available" },
      { method: "generateLayout", status: "available" },
    ],
    layoutVocabulary: { biomes: BIOMES, tiles: TILES, propKinds: PROP_KINDS },
    ...overrides,
  };
}

export function afmEventsPayload(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "room-1",
    eventPlan: afmEventPlan,
    subjectRequirements: [],
    metrics: {
      durationMs: 10,
      inputTokens: 20,
      cachedInputTokens: 0,
      outputTokens: 30,
      reasoningTokens: 0,
    },
    ...overrides,
  };
}

export function afmLayoutPayload(overrides: Record<string, unknown> = {}) {
  return {
    sceneId: "room-1",
    source:
      'root = Scene("Room", "meadow", [floor1, exit1])\n' +
      'floor1 = Floor(8, 8, "grass")\n' +
      'exit1 = Exit(6, 6, "next")',
    ast: {
      sceneId: "room-1",
      eventPlan: afmEventPlan,
      floor: { width: 8, depth: 8, tile: "grass" },
      objects: [],
      exits: [{ id: "exit1", x: 6, z: 6, targetSceneId: null }],
      lights: [],
    },
    metrics: {
      durationMs: 11,
      inputTokens: 21,
      cachedInputTokens: 1,
      outputTokens: 31,
      reasoningTokens: 0,
    },
    ...overrides,
  };
}

export function terminalResult(request: NativeRequest, payload: unknown) {
  return { v: 1 as const, requestId: request.requestId, seq: 2, type: "result" as const, payload };
}
