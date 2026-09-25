import type { NarrativeContext } from "@shared/world";
// Harness vocabulary. Framework-agnostic: this file (and everything under src/harness) must run
// in the renderer, in the Electron main process and in vitest, so it never touches React, the
// DOM or Electron.

import type { ChunkCoord } from "@shared/chunks";
import type { ChatMessage, ChatRequest, ChatUsage, ToolCall } from "@shared/llm";
import type { LoreNode } from "@shared/lore";
import type { Result } from "@shared/result";
import type { Genesis, Inventory, KarmaEntry, SceneGraph, WorldMeta } from "@shared/world";
import type { ZodType } from "zod";

/** Anything a tool may return or a mod may template: lossless JSON. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Why the prompt is being assembled; sections and tools may render differently per purpose. */
export type PromptPurpose = "scene" | "dialogue" | "resolve" | "item" | "chunk" | "free";

/** Everything one assembly (and the turn it belongs to) knows about itself. */
export interface AssembleContext {
  purpose: PromptPurpose;
  /** BCP-47 tag from `genesis.language` — the model answers in it (Babel, Rule 10). */
  language: string;
  /** The chunk of open land this turn is about; hot lore is activated around it. */
  coord?: ChunkCoord;
  signal?: AbortSignal;
}

/** One contributed system-prompt section. */
export interface PromptSection {
  /** Unique across the harness; a duplicate registration throws. */
  readonly name: string;
  /** Ascending sort key; ties break on name. See `ORDER`. */
  readonly order: number;
  /** Static text, or a provider evaluated at every assembly. Empty text contributes nothing. */
  readonly text: string | ((assemble: AssembleContext) => string);
  /** Interpolate `{{variable}}` references (default true); false keeps the text literal. */
  readonly interpolate?: boolean;
}

/** Resolves one `{{variable}}`; returning undefined makes a section referencing it fail. */
export type VariableProvider = (assemble: AssembleContext) => string | undefined;

/** What `assemble()` produced: the prompt text plus the names that contributed to it. */
export interface AssembledPrompt {
  text: string;
  sections: string[];
}

// ── Tools ────────────────────────────────────────────────────────────────────────────────────

/** Per-call input the caller supplies; the registry adds the call's own identity. */
export interface ToolExecInput {
  purpose: PromptPurpose;
  signal?: AbortSignal;
}

/** One in-flight tool call, as seen by the pipeline events and the tool body. */
export interface ToolExec extends ToolExecInput {
  readonly callId: string;
  readonly name: string;
  /** Parsed and validated arguments. */
  readonly args: JsonValue;
}

/** `tools/pre-execute` verdict. Default (no listener) is allow. */
export type PreToolDecision = { kind: "allow" } | { kind: "deny"; reason: string };

/** The normalized outcome of one tool call; `content` is what the model reads back. */
export interface ToolExecutionResult {
  callId: string;
  name: string;
  args: JsonValue;
  /** The tool's canonical value, or null for every failure. */
  value: JsonValue | null;
  content: string;
  isError: boolean;
  durationMs: number;
}

/** A registered tool: the model-facing schema, a validator, the body and its renderer. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON Schema object handed to the model (`type: "object"`, `additionalProperties: false`). */
  readonly parameters: Record<string, unknown>;
  /** Validates the parsed `arguments` JSON before the body runs. */
  readonly schema: ZodType;
  execute(args: JsonValue, exec: ToolExec): Promise<JsonValue>;
  /** Projects the canonical value to the text the model reads. */
  render(args: JsonValue, value: JsonValue): string;
}

// ── Skills ───────────────────────────────────────────────────────────────────────────────────

export interface SkillSummary {
  name: string;
  description: string;
  /** Where the skill came from: a mod name, "builtin", a directory — shown to nobody but us. */
  source: string;
}

export interface SkillProvider {
  list(): SkillSummary[];
  load(name: string): Promise<Result<string>>;
}

// ── World ────────────────────────────────────────────────────────────────────────────────────

/** Everything a prompt section or tool may read about the world that is currently loaded. */
export interface WorldSnapshot {
  genesis: Genesis | NarrativeContext;
  meta: WorldMeta;
  scene: SceneGraph | null;
  karma: KarmaEntry[];
  inventory: Inventory;
  floor: number;
  /** The lore graph of open land; absent for a bounded scene, which keeps the karma window. */
  lore?: LoreNode[];
  /** Chunk the player stands on, when the scene is open land. */
  coord?: ChunkCoord | null;
}

// ── Turn ─────────────────────────────────────────────────────────────────────────────────────

/** The renderer's streaming chat call, narrowed to what a turn needs. */
export type ChatFn = (
  request: Omit<ChatRequest, "id">,
  onDelta?: (text: string) => void,
) => Promise<Result<{ text: string; toolCalls: ToolCall[]; usage: ChatUsage | null }>>;

export interface TurnResult {
  text: string;
  /** How many model steps ran (1 when the model answered without calling a tool). */
  steps: number;
  toolResults: ToolExecutionResult[];
  /** The full conversation the turn produced, system message first. */
  messages: ChatMessage[];
}
