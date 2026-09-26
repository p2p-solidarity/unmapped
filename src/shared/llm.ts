// Inference contract. The main process owns the provider client and the API key; the renderer
// only sees streamed ChatEvents over IPC.

import type { AppError } from "./result";
import type { UsageTag } from "./usage";

export const PROVIDER_KINDS = [
  "openai",
  "apple-fm",
  "llamacpp",
  "ollama",
  "vllm",
  "openui-gateway",
  "custom",
  // The UNMAPPED generation gateway (rev 6 phase 4, D2): metered against the account's allowance.
  // Its address is main's alone (UNMAPPED_GATEWAY_URL); a renderer never supplies it.
  "hosted",
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
  // Apple Foundation Models, on device: `fm serve` speaks Chat Completions; "system" is its only model.
  "apple-fm": {
    kind: "apple-fm",
    baseUrl: "http://127.0.0.1:11535/v1",
    model: "system",
    apiKeyEnv: null,
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
  // Main replaces baseUrl and apiKeyEnv with the configured gateway's (`parseConfig`), so this
  // placeholder (a reserved .invalid name) is never contacted. An empty model = the gateway's default.
  hosted: {
    kind: "hosted",
    baseUrl: "https://gateway.invalid/v1",
    model: "",
    apiKeyEnv: "UNMAPPED_GATEWAY_KEY",
  },
};

/** macOS ships the Apple Foundation Models CLI here; `fm serve` is its Chat Completions server. */
export const APPLE_FM_BINARY = "/usr/bin/fm";

export const APPLE_FM_SIDECAR: SidecarConfig = {
  binaryPath: APPLE_FM_BINARY,
  modelPath: "",
  port: 11535,
  ctxSize: 4096,
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
  /** How much a local model holds (prompt + answer); null for cloud APIs, which are not clamped. */
  context: ContextWindow | null;
}

/**
 * A local model's context window. `sidecar`: the ctxSize the app started llama-server with;
 * `server`: what the running server reported; `model`: fixed by the model (Apple's is 4096);
 * `assumed`: the server did not say, so its documented default is used.
 */
export interface ContextWindow {
  tokens: number;
  source: "sidecar" | "server" | "model" | "assumed";
}

// ── Keys typed on screen (Settings → Model) ────────────────────────────────────────────────────
// The renderer may hand main a key but never reads one back: it only ever sees a KeyStatus.

/**
 * Providers a player can give a key to; everything else runs on this machine without one.
 * `qwen-image` is the self-hosted Qwen-Image server (rev 6 phase 4, D4): an image provider, never a
 * chat `ProviderKind`; its endpoint is main's QWEN_IMAGE_BASE_URL (`qwenImageEndpoint`).
 */
export const KEY_PROVIDERS = [
  "openai",
  "openui-gateway",
  "custom",
  "qwen-image",
  // The gateway's account token: written only by main's sign-in (main/account), never typed.
  "hosted",
] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/** The providers a player types a key for in Settings → Model (never the account token). */
export const TYPED_KEY_PROVIDERS = ["openai", "openui-gateway", "custom", "qwen-image"] as const;
export type TypedKeyProvider = (typeof TYPED_KEY_PROVIDERS)[number];

export interface KeyStatus {
  set: boolean;
  /**
   * `saved`: encrypted in this computer's app data; `env`: from the .env file; `unreadable`: a
   * saved key exists but cannot be decrypted or read here (it is never silently ignored).
   */
  source: "saved" | "env" | "unreadable" | null;
  /** The only base URL this key is ever sent to. */
  boundTo: string | null;
}
export type KeyStatusMap = Record<KeyProvider, KeyStatus>;

export interface SetApiKeyInput {
  provider: TypedKeyProvider;
  key: string;
  /** Required for `custom` (https or loopback only); the presets always use their own endpoint. */
  baseUrl?: string;
}

// ── Where the next call goes (rev 6 phase 4, D2) ─────────────────────────────────────────────
// Main decides with `routeFor` (src/main/inference/route.ts); the renderer only ever sees this.

/** `local`: a server on this computer; `direct`: the provider with the player's own key (or a
 * keyless custom endpoint); `hosted`: the gateway, metered against the account's allowance. */
export type ChatRoute = "local" | "direct" | "hosted";

export interface RouteView {
  /** What the player selected in Settings → Model. */
  selected: { kind: ProviderKind; model: string };
  /** The configured gateway's base URL (not a secret), or null when this build has none. */
  gateway: string | null;
  /** Where the next chat goes, with what actually runs there; null when it cannot go anywhere. */
  next: {
    route: ChatRoute;
    kind: ProviderKind;
    model: string;
    /** Hosted only: the player chose it, or there was no own key. */
    via: "selected" | "no-own-key" | null;
    /** Where the key or token comes from; null for keyless servers. */
    keySource: "saved" | "env" | null;
  } | null;
  /** Why `next` is null (no key anywhere, signed out, the gateway unreachable). */
  error: AppError | null;
}

// ── What runs on this computer ───────────────────────────────────────────────────────────────

/** Where Homebrew puts llama-server; main only ever spawns one of these. */
export const LLAMA_SERVER_PATHS = [
  "/opt/homebrew/bin/llama-server",
  "/usr/local/bin/llama-server",
] as const;

export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";

export interface LocalDetection {
  apple: {
    /** The app's Foundation Models bridge (writes structured scenes). */
    bridge: boolean;
    bridgeReason: string | null;
    contextTokens: number | null;
    /** `/usr/bin/fm`, whose `fm serve` answers every other chat. */
    fmCli: boolean;
  };
  ollama: { reachable: boolean; models: string[]; latencyMs: number };
  /** The first allowed llama-server that exists, or null when llama.cpp is not installed. */
  llamacpp: { binaryPath: string | null };
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
  /**
   * The least output this task can use. On a small local context main lowers `maxTokens` to what
   * fits and refuses (`model-context-too-small`) when even this much does not.
   */
  minTokens?: number;
  /** What the call is for and which world it belongs to; main writes it to the usage ledger. */
  usage: UsageTag;
}

export interface ChatUsage {
  prompt: number;
  completion: number;
  /** Input tokens the provider served from its prompt cache; null when it did not say. */
  cached: number | null;
}

export type ChatEvent =
  | { id: string; type: "delta"; text: string }
  | { id: string; type: "done"; text: string; toolCalls: ToolCall[]; usage: ChatUsage | null }
  | { id: string; type: "error"; error: AppError };
