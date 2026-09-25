import { SceneArtifactService } from "@main/inference/sceneArtifactService";
import { ok } from "@shared/result";
import type {
  GenerationOptions,
  SceneAST,
  SceneDraft,
  SceneIntent,
  SceneProvider,
  SceneState,
} from "@shared/scene-generation";
import { describe, expect, it } from "vitest";
import { exit, makeScene } from "../engine/fixtures";

const source = `root = Scene("A room", "meadow", [floor, exit])
floor = Floor(8, 8, "grass")
exit = Exit(6, 6, "next", "next-room")`;

const intent: SceneIntent = {
  requestId: "artifact-request",
  purpose: "new-room",
  brief: "a calm meadow room",
  language: "en-US",
  sceneId: "room-1",
};

const state = {
  worldPlan: null,
  currentScene: null,
  flags: {},
  inventory: [],
  assetCatalog: [],
  capabilityProfile: { entries: [] },
} satisfies SceneState;

const options: GenerationOptions = {
  signal: new AbortController().signal,
  maxRepairAttempts: 0,
};

class StaticProvider implements SceneProvider {
  readonly id = "apple-local" as const;

  constructor(private readonly output: SceneDraft) {}

  async capabilities() {
    return ok({
      providerId: this.id,
      available: true,
      locality: "device" as const,
      constraintModes: ["swift-generable"] as const,
      contextTokens: null,
      supportsStreaming: true,
      supportsReasoning: false,
    });
  }

  async generateScene() {
    return ok(this.output);
  }
}

function draft(overrides: Partial<SceneDraft> = {}): SceneDraft {
  return {
    requestId: intent.requestId,
    providerId: "apple-local",
    purpose: intent.purpose,
    source,
    ast: {
      sceneId: intent.sceneId,
      eventPlan: {
        entryEventId: "enter_room",
        events: [
          {
            id: "enter_room",
            trigger: "enter",
            subjectId: null,
            requires: [],
            effects: [],
            nextEventIds: [],
          },
        ],
        terminalEventIds: ["enter_room"],
      },
      floor: { width: 8, depth: 8, tile: "grass" },
      objects: [],
      exits: [{ id: "exit1", x: 6, z: 6, targetSceneId: "next-room" }],
      lights: [],
    },
    graph: null,
    worldPlan: null,
    ...overrides,
  };
}

describe("SceneArtifactService", () => {
  it("parses provider source then validates a reachable generated scene", async () => {
    const service = new SceneArtifactService([new StaticProvider(draft())]);

    const result = await service.generateScene(intent, state, options);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toContain('Scene("A room"');
    expect(result.value.graph.exits[0]?.targetSceneId).toBe("next-room");
    expect(result.value.validation.metrics.reachableRequiredTargets).toBe(1);
  });

  it("refuses a draft that has no canonical OpenUI source or graph", async () => {
    const service = new SceneArtifactService([
      new StaticProvider(draft({ source: null, ast: null })),
    ]);

    const result = await service.generateScene(intent, state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "scene-draft-not-canonical" } });
  });

  it("refuses graph output which fails local navigation validation", async () => {
    const graph = makeScene({
      walls: Array.from({ length: 8 }, (_, z) => ({
        x: 3,
        z,
        width: 1,
        height: 1,
        material: "stone" as const,
      })),
      exits: [exit(1, 1)],
    });
    const service = new SceneArtifactService([new StaticProvider(draft({ source: null, graph }))]);

    const result = await service.generateScene(intent, state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "scene-validation-failed" } });
  });

  it("refuses a causal plan whose entry event is not declared", async () => {
    const original = draft().ast;
    if (original === null) throw new Error("test draft must include a causal AST");
    const ast: SceneAST = {
      ...original,
      eventPlan: { entryEventId: "missing", events: [], terminalEventIds: [] },
    };
    const service = new SceneArtifactService([new StaticProvider(draft({ ast }))]);

    const result = await service.generateScene(intent, state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "causal-plan-invalid" } });
  });

  it("refuses an event chain with an undeclared transition", async () => {
    const original = draft().ast;
    if (original === null) throw new Error("test draft must include a causal AST");
    const entryEvent = original.eventPlan.events[0];
    if (entryEvent === undefined) throw new Error("test draft must include an entry event");
    const ast: SceneAST = {
      ...original,
      eventPlan: {
        ...original.eventPlan,
        events: [{ ...entryEvent, nextEventIds: ["missing"] }],
      },
    };
    const service = new SceneArtifactService([new StaticProvider(draft({ ast }))]);

    const result = await service.generateScene(intent, state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "causal-plan-invalid" } });
  });

  it("refuses native AST spatial data that disagrees with reparsed OpenUI source", async () => {
    const original = draft().ast;
    if (original === null) throw new Error("test draft must include a causal AST");
    const ast: SceneAST = {
      ...original,
      floor: { ...original.floor, width: 12 },
    };
    const service = new SceneArtifactService([new StaticProvider(draft({ ast }))]);

    const result = await service.generateScene(intent, state, options);

    expect(result).toMatchObject({ ok: false, error: { code: "scene-draft-mismatch" } });
  });
});
