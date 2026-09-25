// Provider-neutral scene generation contracts. Providers produce drafts; only a later local
// validation/canonicalization step may turn one into a persisted SceneArtifact.

import type { AssetRef } from "./assets";
import type { CapabilityProfile } from "./capabilities";
import type { AppError, Result } from "./result";
import type { ItemSpec, SceneGraph } from "./world";

export const PROVIDER_IDS = ["apple-local", "apple-pcc", "llamacpp", "openai-compatible"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderLocality = "device" | "private-cloud" | "remote";
export type ConstraintMode = "swift-generable" | "gbnf" | "json-schema" | "none";
export type SceneGenerationPurpose = "world-plan" | "new-room" | "repair-room" | "expand-room";

export interface ProviderCapabilities {
  providerId: ProviderId;
  available: boolean;
  locality: ProviderLocality;
  constraintModes: readonly ConstraintMode[];
  contextTokens: number | null;
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  /** Omit when a provider can accept every purpose. PCC should advertise world-plan explicitly. */
  supportedPurposes?: readonly SceneGenerationPurpose[];
  unavailableReason?: string;
}

export interface RoomNode {
  roomId: string;
  title: string;
  summary: string;
  requiredCapabilities: readonly string[];
  exits: readonly string[];
}

export interface WorldPlan {
  worldId: string;
  premise: string;
  rooms: readonly RoomNode[];
  entryRoomId: string;
  terminalRoomIds: readonly string[];
}

export interface SceneIntent {
  requestId: string;
  purpose: SceneGenerationPurpose;
  brief: string;
  language: string;
  sceneId: string;
  topology?: RoomNode;
}

export interface SceneState {
  worldPlan: WorldPlan | null;
  currentScene: SceneGraph | null;
  flags: Readonly<Record<string, string | number | boolean>>;
  inventory: readonly ItemSpec[];
  assetCatalog: readonly AssetRef[];
  capabilityProfile: CapabilityProfile;
}

/** Renderer-safe form of SceneState. Main reparses source instead of trusting a cloned graph. */
export interface SceneGenerationRequestState extends Omit<SceneState, "currentScene"> {
  currentSceneSource: string | null;
}

export interface SceneGenerationRequest {
  intent: SceneIntent;
  state: SceneGenerationRequestState;
  maxRepairAttempts: number;
}

export interface GenerationOptions {
  signal: AbortSignal;
  maxRepairAttempts: number;
  onEvent?(event: GenerationEvent): void;
}

export interface Predicate {
  key: string;
  operator: "equals" | "not-equals" | "exists" | "greater-than" | "less-than";
  value?: string | number | boolean;
}

export interface Effect {
  key: string;
  operation: "set" | "add" | "remove";
  value: string | number | boolean;
}

export type EventTrigger = "enter" | "interact" | "collect" | "defeat" | "exit";

export interface CausalEvent {
  id: string;
  trigger: EventTrigger;
  subjectId: string | null;
  requires: readonly Predicate[];
  effects: readonly Effect[];
  /** Directed edges in the event chain; terminal events have no successors. */
  nextEventIds: readonly string[];
}

export interface EventPlan {
  entryEventId: string;
  events: readonly CausalEvent[];
  terminalEventIds: readonly string[];
}

export interface FloorNode {
  width: number;
  depth: number;
  tile: string;
}

export interface SpatialNode {
  id: string;
  kind: string;
  x: number;
  z: number;
  assetId?: string;
}

export interface ExitNode {
  id: string;
  x: number;
  z: number;
  targetSceneId: string | null;
}

export interface LightNode {
  id: string;
  kind: string;
  color: string;
  intensity: number;
  x?: number;
  z?: number;
}

export interface SceneAST {
  sceneId: string;
  eventPlan: EventPlan;
  floor: FloorNode;
  objects: readonly SpatialNode[];
  exits: readonly ExitNode[];
  lights: readonly LightNode[];
}

export interface SceneDraft {
  requestId: string;
  providerId: ProviderId;
  purpose: SceneGenerationPurpose;
  /** Null for a typed world plan that has not yet been compiled to OpenUI Lang. */
  source: string | null;
  ast: SceneAST | null;
  graph: SceneGraph | null;
  worldPlan: WorldPlan | null;
}

export type ValidationStage =
  | "schema"
  | "semantic"
  | "asset"
  | "geometry"
  | "navigation"
  | "simulation";

export interface ValidationIssue {
  stage: ValidationStage;
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
  repairHint?: string;
}

export interface ValidationMetrics {
  reachableRequiredTargets: number;
  requiredTargetCount: number;
  overlappingAabbs: number;
  simulationTicks: number;
}

export interface ValidationReport {
  valid: boolean;
  issues: readonly ValidationIssue[];
  metrics: ValidationMetrics;
}

export interface GenerationReceipt {
  requestId: string;
  providerId: ProviderId;
  purpose: SceneGenerationPurpose;
  schemaVersion: string;
  requestHash: string;
  contentHash: string | null;
  stateRevision: string | null;
  createdAt: string;
  degraded: boolean;
}

export type ValidationReceipt = GenerationReceipt & { validation: ValidationReport };

export interface SceneArtifact {
  requestId: string;
  providerId: ProviderId;
  purpose: SceneGenerationPurpose;
  ast: SceneAST;
  source: string;
  graph: SceneGraph;
  validation: ValidationReport;
  receipt: ValidationReceipt;
}

export type GenerationEvent =
  | { type: "started"; requestId: string; providerId: ProviderId }
  | { type: "provider-selected"; requestId: string; providerId: ProviderId }
  | { type: "progress"; requestId: string; providerId: ProviderId; phase: string; message?: string }
  | { type: "partial"; requestId: string; providerId: ProviderId; draft: SceneDraft }
  | {
      type: "provider-fallback";
      requestId: string;
      from: ProviderId;
      to: ProviderId;
      reason: string;
    }
  | { type: "completed"; requestId: string; providerId: ProviderId }
  | { type: "error"; requestId: string; error: AppError }
  | { type: "cancelled"; requestId: string };

export interface SceneProvider {
  readonly id: ProviderId;
  capabilities(): Promise<Result<ProviderCapabilities>>;
  generateScene(
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneDraft>>;
}

/** App-facing boundary reserved for the post-provider validation/canonicalization pipeline. */
export interface SceneGenerationService {
  generateScene(
    intent: SceneIntent,
    state: SceneState,
    options: GenerationOptions,
  ): Promise<Result<SceneArtifact>>;
}
