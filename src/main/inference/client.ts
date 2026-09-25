// OpenAI-SDK client for any OpenAI-compatible endpoint. Lives in main only: the caller resolves
// the API key in main (`keyStore.resolveApiKey`) and it never crosses the bridge (Rule 6). Every
// failure is mapped to an AppError with a hint the player can act on (Rule 5).

import type {
  ChatMessage,
  ChatRequest,
  ChatUsage,
  ContextWindow,
  InferenceConfig,
  ToolCall,
} from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";
import OpenAI, { APIConnectionError, APIError, APIUserAbortError } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { fitOutput } from "./budget";
import { parseConfig } from "./config";
import { createThinkFilter, stripThinking } from "./think";
import { createToolCallAccumulator, type ToolCallDelta } from "./toolCalls";

export interface ChatCompletionResult {
  text: string;
  toolCalls: ToolCall[];
  usage: ChatUsage | null;
  /** The answer budget actually sent (lower than asked when a local context is small). */
  maxTokens: number;
}

export interface StreamOptions {
  /** Resolved in main; null for keyless local servers. */
  apiKey: string | null;
  /** The local model's window; null = a cloud API, sent as asked. */
  context: ContextWindow | null;
}

/** OpenAI's wire shape for a tool call the assistant emitted. */
export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Our `ChatMessage` union on the wire. The assistant carries `tool_calls`, and a tool result is
 * addressed by `tool_call_id` — the two halves the model needs to match a call to its answer.
 */
export type WireMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; tool_calls?: WireToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

/** A tool schema as the provider wants it: our flat `ToolSchema` wrapped in a function envelope. */
export interface WireTool {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/**
 * The request body we actually send. The OpenAI SDK types only the official parameters, so the
 * provider-specific extras (`grammar`, `chat_template_kwargs`) are declared here and the whole
 * object is cast once, at the `create()` boundary — nothing downstream sees an untyped body.
 */
export interface ChatBody {
  model: string;
  messages: WireMessage[];
  stream: true;
  stream_options: { include_usage: true };
  stop?: string[];
  /** Present only when the caller offered tools this step. */
  tools?: WireTool[];
  tool_choice?: "auto";
  /** Classic Chat Completions budget (llama.cpp / ollama / vLLM / custom). */
  max_tokens?: number;
  /** GPT-5 family rejects `max_tokens` and requires this name instead. */
  max_completion_tokens?: number;
  /** Omitted for GPT-5 family: any value but the default returns 400 "Unsupported parameter". */
  temperature?: number;
  /** GPT-5 family only; "low" keeps DSL generation fast. */
  reasoning_effort?: "none" | "low" | "medium" | "high";
  /** llama.cpp only: GBNF grammar that constrains the sampler to our DSL. */
  grammar?: string;
  /** llama.cpp / ollama / vLLM: stops Qwen-style chat templates opening a <think> block. */
  chat_template_kwargs?: { enable_thinking: boolean };
}

/** Reasoning models (GPT-5 family, o-series) take `max_completion_tokens` and reject `temperature`. */
export function usesReasoningParams(config: InferenceConfig): boolean {
  // Local runtimes never take these fields, whatever the model is called.
  if (
    config.kind === "llamacpp" ||
    config.kind === "ollama" ||
    config.kind === "vllm" ||
    config.kind === "apple-fm"
  )
    return false;
  // Gateways namespace the model ("openai/gpt-5"), so match the last path segment. The OpenAI
  // preset is included on purpose: switching its model to gpt-4o must not send reasoning fields.
  const model = (config.model.split("/").pop() ?? "").toLowerCase();
  return /^gpt-5/.test(model) || /^o[1-9]/.test(model);
}

/**
 * Local runtimes whose chat templates take `chat_template_kwargs` (unknown fields are ignored by
 * all three). Apple's `fm serve` has no thinking mode and custom servers are unknown, so neither
 * gets the field; the think filter below covers any model that reasons out loud anyway.
 */
function takesThinkingSwitch(config: InferenceConfig): boolean {
  return config.kind === "llamacpp" || config.kind === "ollama" || config.kind === "vllm";
}

/** Maps one of our messages onto the provider's shape. Ollama and llama.cpp speak the same one. */
export function toWireMessage(message: ChatMessage): WireMessage {
  switch (message.role) {
    case "system":
    case "user":
      return { role: message.role, content: message.content };
    case "assistant": {
      const calls = message.toolCalls ?? [];
      if (calls.length === 0) return { role: "assistant", content: message.content };
      return {
        role: "assistant",
        content: message.content,
        tool_calls: calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    case "tool":
      return { role: "tool", content: message.content, tool_call_id: message.toolCallId };
  }
}

export function buildChatBody(config: InferenceConfig, request: ChatRequest): ChatBody {
  const body: ChatBody = {
    model: config.model,
    messages: request.messages.map(toWireMessage),
    stream: true,
    stream_options: { include_usage: true },
  };
  if (request.stop.length > 0) body.stop = request.stop;

  const withTools = request.tools.length > 0;
  if (withTools) {
    body.tools = request.tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  if (usesReasoningParams(config)) {
    body.max_completion_tokens = request.maxTokens;
    // GPT-5 Chat Completions rejects function tools when reasoning is enabled. Keep reasoning for
    // plain generation, but explicitly turn it off for tool turns instead of making the provider
    // return a 400 (the Responses API is not part of this OpenAI-compatible client contract).
    body.reasoning_effort = withTools ? "none" : "low";
  } else {
    body.max_tokens = request.maxTokens;
    body.temperature = request.temperature;
  }

  // A GBNF grammar pins the sampler to the DSL, which would make emitting a tool call impossible.
  // Tools win: the caller asked for a decision, not a program.
  if (request.grammar !== null && config.kind === "llamacpp" && !withTools) {
    body.grammar = request.grammar;
  }
  if (takesThinkingSwitch(config)) body.chat_template_kwargs = { enable_thinking: false };
  return body;
}

/** The presets that cannot answer without a key; custom and local servers may be keyless. */
function needsKey(config: InferenceConfig): boolean {
  return config.kind === "openai" || config.kind === "openui-gateway";
}

export function createClient(
  config: InferenceConfig,
  apiKey: string | null = null,
): Result<OpenAI> {
  const trusted = parseConfig(config);
  if (!trusted.ok) return fail(trusted.error);
  const safeConfig = trusted.value;
  if (needsKey(safeConfig) && apiKey === null) {
    return fail({
      code: "no-api-key",
      message: `The ${safeConfig.kind} provider needs an API key and none is set.`,
      hint: `Enter a key in Settings → Model (Cloud API), or add ${safeConfig.apiKeyEnv ?? "the key"} to .env.`,
    });
  }
  return ok(new OpenAI({ baseURL: safeConfig.baseUrl, apiKey: apiKey ?? "local" }));
}

export async function streamChat(
  config: InferenceConfig,
  request: ChatRequest,
  onDelta: (text: string) => void,
  signal: AbortSignal,
  options: StreamOptions = { apiKey: null, context: null },
): Promise<Result<ChatCompletionResult>> {
  const client = createClient(config, options.apiKey);
  if (!client.ok) return client;
  const budget = fitOutput(request, options.context, `${config.kind} · ${config.model}`);
  if (!budget.ok) return budget;

  const fitted = { ...request, maxTokens: budget.value.maxTokens };
  const body = buildChatBody(config, fitted) as unknown as ChatCompletionCreateParamsStreaming;
  const calls = createToolCallAccumulator();
  const think = createThinkFilter();
  let raw = "";
  let usage: ChatUsage | null = null;
  try {
    const stream = await client.value.chat.completions.create(body, { signal });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content;
      if (typeof content === "string" && content.length > 0) {
        raw += content;
        const visible = think.push(content);
        if (visible.length > 0) onDelta(visible);
      }
      calls.push(delta?.tool_calls as ToolCallDelta[] | undefined);
      if (chunk.usage) {
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens;
        usage = {
          prompt: chunk.usage.prompt_tokens,
          completion: chunk.usage.completion_tokens,
          cached: typeof cached === "number" ? cached : null,
        };
      }
    }
    // An aborted stream can end quietly instead of throwing: it is still a cancelled request.
    if (signal.aborted) return fail({ code: "aborted", message: "The request was cancelled." });
    const tail = think.flush();
    if (tail.length > 0) onDelta(tail);
    return ok({
      text: stripThinking(raw),
      toolCalls: calls.toolCalls(),
      usage,
      maxTokens: fitted.maxTokens,
    });
  } catch (e) {
    return mapProviderError(e, config, signal);
  }
}

export function mapProviderError(
  e: unknown,
  config: InferenceConfig,
  signal?: AbortSignal,
): Result<never> {
  if (e instanceof APIUserAbortError || signal?.aborted === true || isAbortName(e)) {
    return fail({ code: "aborted", message: "The request was cancelled." });
  }
  if (e instanceof APIConnectionError) {
    return fail({
      code: "connection-refused",
      message: `Could not reach ${config.baseUrl}.`,
      hint:
        config.kind === "llamacpp"
          ? "start llama-server (llama-server -m <model>.gguf --port 8080 --jinja) or fix baseUrl"
          : config.kind === "apple-fm"
            ? "select Apple on-device in Settings → Model (it starts fm serve); run `sudo fm license` once first"
            : `check the endpoint (${config.baseUrl}) in Settings → Model and that the server is running`,
    });
  }
  if (e instanceof APIError) {
    if (e.status === 401 || e.status === 403) {
      return fail({
        code: "auth",
        message: `The provider rejected the credentials: ${e.message}`,
        hint: "enter a valid key in Settings → Model (Cloud API)",
      });
    }
    if (e.status === 404) {
      return fail({
        code: "model-not-found",
        message: `${config.baseUrl} does not serve model "${config.model}".`,
        hint: "pick one of the models the server lists in Settings → Model",
      });
    }
    return fail({
      code: "provider",
      message: e.message,
      hint: `${config.kind} returned ${String(e.status ?? "an error")}`,
    });
  }
  return fail({
    code: "provider",
    message: e instanceof Error ? e.message : String(e),
    hint: `${config.kind} at ${config.baseUrl} failed before any token arrived`,
  });
}

function isAbortName(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "APIUserAbortError");
}
