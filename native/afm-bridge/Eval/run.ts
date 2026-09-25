import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SceneArtifactService } from "../../../src/main/inference/sceneArtifactService";
import { parseScene } from "../../../src/dsl";
import { ok } from "../../../src/shared/result";
import { inspectScene } from "../../../src/shared/scene-validation";
import { BIOMES, PROP_KINDS, TILES } from "../../../src/shared/world";
import type {
  EventPlan,
  SceneAST,
  SceneDraft,
  SceneIntent,
  SceneProvider,
  SceneState,
} from "../../../src/shared/scene-generation";

interface EvalCase {
  id: string;
  sceneId: string;
  language: string;
  brief: string;
}

interface TerminalEvent {
  type: "result" | "error" | "cancelled";
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

interface SubjectRequirement {
  id: string;
  kind: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(await readFile(resolve(here, "cases.json"), "utf8")) as EvalCase[];
const helper = spawn(resolve(here, "../.build/debug/afm-bridge"), [], {
  stdio: ["pipe", "pipe", "inherit"],
});
const pending = new Map<string, (event: TerminalEvent) => void>();
let outputBuffer = "";

helper.stdout.setEncoding("utf8");
helper.stdout.on("data", (chunk: string) => {
  outputBuffer += chunk;
  const lines = outputBuffer.split("\n");
  outputBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (line.length === 0) continue;
    const event = JSON.parse(line) as TerminalEvent & { requestId: string };
    if (event.type === "accepted") continue;
    pending.get(event.requestId)?.(event);
    pending.delete(event.requestId);
  }
});

function request(requestId: string, method: string, payload: Record<string, unknown>) {
  return new Promise<TerminalEvent>((resolveEvent) => {
    pending.set(requestId, resolveEvent);
    helper.stdin.write(`${JSON.stringify({ v: 1, requestId, method, payload })}\n`);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEventPlan(value: unknown): EventPlan {
  if (!isRecord(value) || typeof value.entryEventId !== "string") {
    throw new Error("bridge eventPlan is not an object with entryEventId");
  }
  if (!Array.isArray(value.events) || !Array.isArray(value.terminalEventIds)) {
    throw new Error("bridge eventPlan is missing event arrays");
  }
  for (const event of value.events) {
    if (
      !isRecord(event) ||
      typeof event.id !== "string" ||
      typeof event.trigger !== "string" ||
      !(event.subjectId === null || typeof event.subjectId === "string") ||
      !Array.isArray(event.requires) ||
      !Array.isArray(event.effects) ||
      !Array.isArray(event.nextEventIds)
    ) {
      throw new Error("bridge emitted an invalid causal event shape");
    }
    for (const effect of event.effects) {
      if (
        !isRecord(effect) ||
        typeof effect.key !== "string" ||
        typeof effect.operation !== "string" ||
        !(typeof effect.value === "string" ||
          typeof effect.value === "number" ||
          typeof effect.value === "boolean")
      ) {
        throw new Error(`bridge emitted an invalid effect for event ${event.id}`);
      }
    }
  }
  return value as unknown as EventPlan;
}

function parseRequirements(value: unknown): SubjectRequirement[] {
  if (!Array.isArray(value)) throw new Error("bridge omitted subjectRequirements");
  return value.map((requirement) => {
    if (!isRecord(requirement) || typeof requirement.id !== "string" || typeof requirement.kind !== "string") {
      throw new Error("bridge emitted an invalid subject requirement");
    }
    return { id: requirement.id, kind: requirement.kind };
  });
}

function assertSharedVocabulary(payload: Record<string, unknown> | undefined) {
  const vocabulary = payload?.layoutVocabulary;
  if (!isRecord(vocabulary)) throw new Error("capabilities omitted layoutVocabulary");
  const checks = [
    ["biomes", BIOMES],
    ["tiles", TILES],
    ["propKinds", PROP_KINDS],
  ] as const;
  for (const [key, expected] of checks) {
    if (JSON.stringify(vocabulary[key]) !== JSON.stringify(expected)) {
      throw new Error(`native ${key} vocabulary drifted from src/shared/world.ts`);
    }
  }
}

function artifactResult(testCase: EvalCase, payload: Record<string, unknown>) {
  const intent: SceneIntent = {
    requestId: `artifact-${testCase.id}`,
    purpose: "new-room",
    brief: testCase.brief,
    language: testCase.language,
    sceneId: testCase.sceneId,
  };
  const draft: SceneDraft = {
    requestId: intent.requestId,
    providerId: "apple-local",
    purpose: intent.purpose,
    source: payload.source as string,
    ast: payload.ast as SceneAST,
    graph: null,
    worldPlan: null,
  };
  const provider: SceneProvider = {
    id: "apple-local",
    capabilities: async () =>
      ok({
        providerId: "apple-local",
        available: true,
        locality: "device",
        constraintModes: ["swift-generable"],
        contextTokens: 4_096,
        supportsStreaming: false,
        supportsReasoning: false,
      }),
    generateScene: async () => ok(draft),
  };
  const state: SceneState = {
    worldPlan: null,
    currentScene: null,
    flags: {},
    inventory: [],
    assetCatalog: [],
    capabilityProfile: { entries: [] },
  };
  return new SceneArtifactService([provider]).generateScene(intent, state, {
    signal: new AbortController().signal,
    maxRepairAttempts: 0,
  });
}

function localDiagnostics(source: unknown) {
  if (typeof source !== "string") return { source: null, issues: ["missing source"] };
  const parsed = parseScene(source);
  if (!parsed.ok) return { source, issues: parsed.error.errors };
  const report = inspectScene(parsed.value, {
    spawn: {
      x: Math.floor(parsed.value.floor.width / 2),
      z: Math.floor(parsed.value.floor.depth / 2),
    },
  });
  return { source, issues: report.issues };
}

const capability = await request("eval-capabilities", "capabilities", {});
assertSharedVocabulary(capability.payload);
const cancellationTarget = request("eval-cancel-target", "generateEvents", {
  sceneId: "eval-cancel-target",
  brief: "A tiny room with one rock and one exit.",
  language: "en-US",
  purpose: "new-room",
  origin: false,
  stateContext: '{"purpose":"new-room","currentScene":null}',
});
const cancellationControl = await request("eval-cancel-control", "cancel", {
  targetRequestId: "eval-cancel-target",
});
const cancellationTerminal = await cancellationTarget;
if (
  cancellationTerminal.type !== "cancelled" ||
  cancellationControl.type !== "result" ||
  cancellationControl.payload?.cancelled !== true
) {
  throw new Error("bridge cancellation contract failed");
}
const results: Record<string, unknown>[] = [];
for (const testCase of cases) {
  const events = await request(`events-${testCase.id}`, "generateEvents", {
    sceneId: testCase.sceneId,
    brief: testCase.brief,
    language: testCase.language,
    purpose: "new-room",
    origin: false,
    stateContext: '{"purpose":"new-room","currentScene":null}',
  });
  if (events.type !== "result" || events.payload === undefined) {
    results.push({ id: testCase.id, stage: "events", ok: false, error: events.error });
    continue;
  }
  const eventPlan = parseEventPlan(events.payload.eventPlan);
  const subjectRequirements = parseRequirements(events.payload.subjectRequirements);
  const layout = await request(`layout-${testCase.id}`, "generateLayout", {
    sceneId: testCase.sceneId,
    brief: testCase.brief,
    language: testCase.language,
    purpose: "new-room",
    origin: false,
    stateContext: '{"purpose":"new-room","currentScene":null}',
    eventPlan,
    subjectRequirements,
  });
  if (layout.type !== "result" || layout.payload === undefined) {
    results.push({
      id: testCase.id,
      stage: "layout",
      ok: false,
      eventsMetrics: events.payload.metrics,
      error: layout.error,
    });
    continue;
  }
  const artifact = await artifactResult(testCase, layout.payload);
  results.push({
    id: testCase.id,
    stage: artifact.ok ? "accepted" : "artifact",
    ok: artifact.ok,
    eventsMetrics: events.payload.metrics,
    layoutMetrics: layout.payload.metrics,
    diagnostics: artifact.ok ? undefined : localDiagnostics(layout.payload.source),
    error: artifact.ok ? undefined : artifact.error,
  });
}

helper.stdin.end();
await new Promise<void>((resolveExit, reject) => {
  helper.once("exit", (code) => (code === 0 ? resolveExit() : reject(new Error(`bridge exited ${code}`))));
});
console.log(
  JSON.stringify(
    {
      capability: capability.payload,
      cancellation: { target: cancellationTerminal.type, control: cancellationControl.payload },
      results,
    },
    null,
    2,
  ),
);
