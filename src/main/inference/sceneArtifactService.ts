// The only boundary that can turn a provider draft into a usable scene. It re-enters the existing
// OpenUI parser instead of trusting a model-shaped object, then applies causal, asset, geometry,
// and deterministic navigation gates before returning an artifact.

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parseScene, serializeScene } from "@dsl";
import { SceneProviderRouter } from "@main/inference/sceneProvider";
import { builtinAssetRef, validateAssetRef } from "@shared/assets";
import { type AppError, fail, ok, type Result } from "@shared/result";
import type {
  GenerationOptions,
  SceneArtifact,
  SceneAST,
  SceneDraft,
  SceneGenerationService as SceneGenerationServiceContract,
  SceneIntent,
  SceneProvider,
  SceneState,
  ValidationIssue,
  ValidationReport,
} from "@shared/scene-generation";
import { validateScene } from "@shared/scene-validation";
import type { SceneGraph } from "@shared/world";

type ArtifactErrorCode =
  | "scene-draft-mismatch"
  | "scene-draft-not-canonical"
  | "causal-plan-invalid"
  | "scene-source-invalid"
  | "scene-asset-not-allowed";

interface ArtifactError extends AppError {
  code: ArtifactErrorCode;
}

function error(
  code: ArtifactErrorCode,
  message: string,
  hint: string,
): Result<never, ArtifactError> {
  return { ok: false, error: { code, message, hint } };
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sourceAndGraph(
  draft: SceneDraft,
): Result<{ source: string; graph: SceneGraph }, ArtifactError> {
  if (draft.source === null && draft.graph === null) {
    return error(
      "scene-draft-not-canonical",
      "The provider draft has neither OpenUI source nor a scene graph.",
      "Return a complete OpenUI scene program or a graph that the canonical serializer can encode.",
    );
  }

  if (draft.source !== null) {
    const parsed = parseScene(draft.source);
    if (!parsed.ok) {
      return error(
        "scene-source-invalid",
        `The provider emitted an invalid OpenUI scene: ${parsed.error.message}`,
        "Repair the complete program using the parser diagnostics, then regenerate it.",
      );
    }
    const canonicalSource = serializeScene(parsed.value);
    if (draft.graph !== null && serializeScene(draft.graph) !== canonicalSource) {
      return error(
        "scene-draft-mismatch",
        "The provider's OpenUI source and graph describe different scenes.",
        "Return one canonical representation per draft, or regenerate both from the same scene.",
      );
    }
    return ok({ source: canonicalSource, graph: parsed.value });
  }

  const graph = draft.graph;
  if (graph === null) {
    return error(
      "scene-draft-not-canonical",
      "The provider did not return a usable scene graph.",
      "Return a complete OpenUI scene program or a graph that the canonical serializer can encode.",
    );
  }
  try {
    const serialized = serializeScene(graph);
    const reparsed = parseScene(serialized);
    if (!reparsed.ok) {
      return error(
        "scene-source-invalid",
        `The provider graph cannot round-trip through OpenUI: ${reparsed.error.message}`,
        "Return a graph that serializes to a complete, valid OpenUI scene program.",
      );
    }
    return ok({ source: serializeScene(reparsed.value), graph: reparsed.value });
  } catch (cause) {
    return error(
      "scene-source-invalid",
      `The provider graph could not be serialized: ${cause instanceof Error ? cause.message : String(cause)}`,
      "Return a graph that serializes to a complete, valid OpenUI scene program.",
    );
  }
}

function astMatchesGraph(ast: SceneAST, graph: SceneGraph): boolean {
  const spatial = {
    floor: graph.floor,
    objects: graph.props.map((prop, index) => ({
      id: `prop${index + 1}`,
      kind: prop.kind,
      x: prop.x,
      z: prop.z,
      ...(prop.assetId === undefined ? {} : { assetId: prop.assetId }),
    })),
    exits: graph.exits.map((exit, index) => ({
      id: `exit${index + 1}`,
      x: exit.x,
      z: exit.z,
      targetSceneId: exit.targetSceneId,
    })),
    lights: graph.lights.map((light, index) => ({
      id: `light${index + 1}`,
      kind: light.kind,
      color: light.color,
      intensity: light.intensity,
      ...(light.x === null ? {} : { x: light.x }),
      ...(light.z === null ? {} : { z: light.z }),
    })),
  };
  return isDeepStrictEqual(
    { floor: ast.floor, objects: ast.objects, exits: ast.exits, lights: ast.lights },
    spatial,
  );
}

function causalIssues(ast: SceneAST, intent: SceneIntent): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (ast.sceneId !== intent.sceneId) {
    issues.push({
      stage: "semantic",
      severity: "error",
      code: "causal-scene-id",
      path: "ast.sceneId",
      message: `The causal plan targets ${ast.sceneId}, not requested scene ${intent.sceneId}.`,
    });
  }
  const events = new Set<string>();
  const successors = new Map<string, readonly string[]>();
  for (const event of ast.eventPlan.events) {
    if (event.id.trim().length === 0 || events.has(event.id)) {
      issues.push({
        stage: "semantic",
        severity: "error",
        code: "causal-event-id",
        path: "ast.eventPlan.events",
        message: "Causal event IDs must be non-empty and unique.",
      });
    }
    events.add(event.id);
    successors.set(event.id, event.nextEventIds);
  }
  if (!events.has(ast.eventPlan.entryEventId)) {
    issues.push({
      stage: "semantic",
      severity: "error",
      code: "causal-entry-event",
      path: "ast.eventPlan.entryEventId",
      message: "The causal plan's entry event is not declared.",
    });
  }
  for (const terminal of ast.eventPlan.terminalEventIds) {
    if (!events.has(terminal)) {
      issues.push({
        stage: "semantic",
        severity: "error",
        code: "causal-terminal-event",
        path: "ast.eventPlan.terminalEventIds",
        message: `Terminal event ${terminal} is not declared.`,
      });
    }
  }
  for (const event of ast.eventPlan.events) {
    for (const next of event.nextEventIds) {
      if (!events.has(next)) {
        issues.push({
          stage: "semantic",
          severity: "error",
          code: "causal-transition",
          path: `ast.eventPlan.events.${event.id}.nextEventIds`,
          message: `Event ${event.id} transitions to undeclared event ${next}.`,
        });
      }
    }
  }
  if (events.has(ast.eventPlan.entryEventId)) {
    const reachable = new Set<string>([ast.eventPlan.entryEventId]);
    const queue = [ast.eventPlan.entryEventId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      for (const next of successors.get(current) ?? []) {
        if (!events.has(next) || reachable.has(next)) continue;
        reachable.add(next);
        queue.push(next);
      }
    }
    for (const terminal of ast.eventPlan.terminalEventIds) {
      if (!reachable.has(terminal)) {
        issues.push({
          stage: "semantic",
          severity: "error",
          code: "causal-terminal-unreachable",
          path: "ast.eventPlan.terminalEventIds",
          message: `Terminal event ${terminal} is not reachable from the entry event.`,
        });
      }
    }
  }
  return issues;
}

function assetIssues(graph: SceneGraph, state: SceneState): ValidationIssue[] {
  const allowed = new Set(state.assetCatalog.map((asset) => asset.assetId));
  const issues: ValidationIssue[] = [];
  for (const [index, prop] of graph.props.entries()) {
    const reference = {
      ...builtinAssetRef(prop.kind),
      ...(prop.assetId === undefined ? {} : { assetId: prop.assetId }),
    };
    const integrity = validateAssetRef(reference);
    if (!integrity.ok) {
      issues.push({
        stage: "asset",
        severity: "error",
        code: integrity.error.code,
        path: `props[${index}].assetId`,
        message: integrity.error.message,
      });
      continue;
    }
    if (
      prop.assetId !== undefined &&
      !prop.assetId.startsWith("builtin:") &&
      !allowed.has(prop.assetId)
    ) {
      issues.push({
        stage: "asset",
        severity: "error",
        code: "asset-not-allowed",
        path: `props[${index}].assetId`,
        message: `Asset ${prop.assetId} is not in the request's asset whitelist.`,
      });
    }
  }
  return issues;
}

function localReport(graph: SceneGraph, state: SceneState): ValidationReport {
  const spawn = {
    x: Math.floor(graph.floor.width / 2),
    z: Math.floor(graph.floor.depth / 2),
  };
  const local = validateScene(graph, { spawn });
  const issues: ValidationIssue[] = local.ok
    ? []
    : local.error.issues.map((issue) => ({
        stage:
          issue.code === "navigation-unreachable" ||
          issue.code === "navigation-coordinate-invalid" ||
          issue.code === "navigation-spawn-blocked"
            ? "navigation"
            : "geometry",
        severity: "error",
        code: issue.code,
        path: issue.path,
        message: issue.message,
      }));
  issues.push(...assetIssues(graph, state));
  const report = local.ok ? local.value : local.error.report;
  return {
    valid: issues.length === 0,
    issues,
    metrics: {
      reachableRequiredTargets: report.metrics.reachableRequiredTargets,
      requiredTargetCount: report.metrics.requiredTargetCount,
      overlappingAabbs: report.metrics.overlappingAabbs,
      // The current engine has a tile grid, not a NavMesh runtime. Zero records that no dynamic
      // simulation has been substituted for the deterministic BFS gate.
      simulationTicks: 0,
    },
  };
}

/** Composes provider selection with all local, deterministic acceptance gates. */
export class SceneArtifactService implements SceneGenerationServiceContract {
  private readonly router: SceneProviderRouter;

  constructor(providers: readonly SceneProvider[]) {
    this.router = new SceneProviderRouter(providers);
  }

  async generateScene(
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneArtifact>> {
    const generated = await this.router.generateScene(intent, state, options);
    if (!generated.ok) return generated;
    const draft = generated.value;
    if (draft.requestId !== intent.requestId || draft.purpose !== intent.purpose) {
      return error(
        "scene-draft-mismatch",
        "The provider draft does not match the request it was given.",
        "Use the original request ID and generation purpose in the provider adapter.",
      );
    }
    if (draft.ast === null) {
      return error(
        "scene-draft-not-canonical",
        "The provider draft has no causal SceneAST.",
        "Generate the causal event plan before emitting visual layout source.",
      );
    }
    const causal = causalIssues(draft.ast, intent);
    if (causal.length > 0) {
      return error(
        "causal-plan-invalid",
        causal.map((issue) => issue.message).join(" "),
        "Regenerate the causal event plan with stable event IDs before generating layout.",
      );
    }
    const canonical = sourceAndGraph(draft);
    if (!canonical.ok) return canonical;
    if (
      draft.source !== null &&
      draft.graph === null &&
      !astMatchesGraph(draft.ast, canonical.value.graph)
    ) {
      return error(
        "scene-draft-mismatch",
        "The provider's SceneAST spatial data and OpenUI source describe different scenes.",
        "Serialize both representations from the same validated layout before returning the draft.",
      );
    }
    const validation = localReport(canonical.value.graph, state);
    if (!validation.valid) {
      return fail({
        code: "scene-validation-failed",
        message: `Scene validation failed with ${validation.issues.length} issue(s).`,
        hint: "Repair the causal plan or layout using the validation diagnostics, then regenerate.",
      });
    }
    const now = new Date().toISOString();
    const requestHash = digest({ intent, state });
    const contentHash = digest({ ast: draft.ast, source: canonical.value.source });
    return ok({
      requestId: intent.requestId,
      providerId: draft.providerId,
      purpose: draft.purpose,
      ast: draft.ast,
      source: canonical.value.source,
      graph: canonical.value.graph,
      validation,
      receipt: {
        requestId: intent.requestId,
        providerId: draft.providerId,
        purpose: draft.purpose,
        schemaVersion: "scene-artifact@1",
        requestHash,
        contentHash,
        stateRevision: null,
        createdAt: now,
        degraded: draft.providerId !== "apple-local",
        validation,
      },
      ...(draft.usage === undefined ? {} : { usage: draft.usage }),
    });
  }
}

export function createSceneArtifactService(
  providers: readonly SceneProvider[],
): SceneArtifactService {
  return new SceneArtifactService(providers);
}
