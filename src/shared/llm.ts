// Inference contract. The main process owns the provider client and the API key; the renderer
// only sees streamed ChatEvents over IPC.

import type { AppError } from "./result";

export const PROVIDER_KINDS = [
  "openai",
  "llamacpp",
  "ollama",
  "vllm",
  "openui-gateway",
  "custom",
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export interface SidecarConfig {
  /** Absolute path to `llama-server` (brew: /opt/homebrew/bin or /usr/local/bin). */
  binaryPath: string;
  /** Absolute path to a .gguf file. */
  modelPath: string;
  port: number;
  ctxSize: number;
}

export interface InferenceConfig {
  kind: ProviderKind;
  /** OpenAI-compatible base URL ending in /v1 (or the gateway's /v1/embed). */
  baseUrl: string;
  model: string;
  /** Name of the env var holding the key, read in main. null = no auth (local servers). */
  apiKeyEnv: string | null;
  sidecar: SidecarConfig | null;
}

export const PROVIDER_PRESETS: Record<ProviderKind, Omit<InferenceConfig, "sidecar">> = {
  openai: {
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.4-mini",
    apiKeyEnv: "OPENAI_API_KEY",
  },
  llamacpp: {
    kind: "llamacpp",
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "local",
    apiKeyEnv: null,
  },
  ollama: {
    kind: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen3.5:4b",
    apiKeyEnv: null,
  },
  vllm: { kind: "vllm", baseUrl: "http://127.0.0.1:8000/v1", model: "OUI-1", apiKeyEnv: null },
  "openui-gateway": {
    kind: "openui-gateway",
    baseUrl: "https://api.thesys.dev/v1/embed",
    model: "openai/gpt-5",
    apiKeyEnv: "THESYS_API_KEY",
  },
  custom: { kind: "custom", baseUrl: "http://127.0.0.1:8080/v1", model: "", apiKeyEnv: null },
};

export type SidecarState = "stopped" | "starting" | "ready" | "error";
export interface SidecarStatus {
  state: SidecarState;
  pid: number | null;
  port: number | null;
  message: string | null;
}

export interface ProbeResult {
  reachable: boolean;
  models: string[];
  latencyMs: number;
  /** e.g. "llama.cpp", "ollama", "vllm", "openai" when the server identifies itself. */
  serverName: string | null;
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

/** One tool call the model emitted (OpenAI wire shape, arguments still a JSON string). */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text; the harness parses and validates it against the tool schema. */
  arguments: string;
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; content: string; toolCallId: string; name: string };

/** Model-facing tool schema (OpenAI function-calling shape). */
export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema object for the arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  /** Client-generated id used to correlate ChatEvents and aborts. */
  id: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  /** GBNF grammar (llama.cpp only). Ignored by providers that do not support it and when tools are present. */
  grammar: string | null;
  stop: string[];
  /** Tools the model may call this step; empty = plain completion. */
  tools: ToolSchema[];
}

export interface ChatUsage {
  prompt: number;
  completion: number;
}

export type ChatEvent =
  | { id: string; type: "delta"; text: string }
  | { id: string; type: "done"; text: string; toolCalls: ToolCall[]; usage: ChatUsage | null }
  | { id: string; type: "error"; error: AppError };
