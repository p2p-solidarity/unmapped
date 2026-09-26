// OpenAI-SDK client for any OpenAI-compatible endpoint. Lives in main only: the caller resolves
// the route and its key in main (`routeFor`) and the key never crosses the bridge (Rule 6). Every
// failure is mapped to an AppError with a hint the player can act on (Rule 5). The body itself is
// built by @shared/chatWire, the one copy main and the gateway share.

import { buildChatBody, createThinkFilter, stripThinking } from "@shared/chatWire";
import type { ChatRequest, ChatUsage, ContextWindow, InferenceConfig, ToolCall } from "@shared/llm";
import { PURPOSE_HEADER, REQUEST_ID, REQUEST_ID_HEADER } from "@shared/quota";
import { err, fail, ok, type Result } from "@shared/result";
import OpenAI, { APIConnectionError, APIError, APIUserAbortError } from "openai";
import type { ChatCompletionCreateParamsStreaming } from "openai/resources/chat/completions";
import { fitOutput } from "./budget";
import { parseConfig } from "./config";
import { hostedError, signedOutError } from "./hostedErrors";
import { createToolCallAccumulator, type ToolCallDelta } from "./toolCalls";

export {
  buildChatBody,
  type ChatBody,
  toWireMessage,
  usesReasoningParams,
  type WireMessage,
  type WireTool,
  type WireToolCall,
} from "@shared/chatWire";

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

/** The presets that cannot answer without a key; custom and local servers may be keyless. */
function needsKey(config: InferenceConfig): boolean {
  return config.kind === "openai" || config.kind === "openui-gateway" || config.kind === "hosted";
}

export function createClient(
  config: InferenceConfig,
  apiKey: string | null = null,
): Result<OpenAI> {
  const trusted = parseConfig(config);
  if (!trusted.ok) return fail(trusted.error);
  const safeConfig = trusted.value;
  if (safeConfig.kind === "hosted" && apiKey === null) return fail(signedOutError());
  if (needsKey(safeConfig) && apiKey === null) {
    return fail({
      code: "no-api-key",
      message: `The ${safeConfig.kind} provider needs an API key and none is set.`,
      hint: `Enter a key in Settings → Model (Cloud API), or add ${safeConfig.apiKeyEnv ?? "the key"} to .env.`,
    });
  }
  return ok(
    new OpenAI({
      baseURL: safeConfig.baseUrl,
      apiKey: apiKey ?? "local",
      // A metered call is never retried behind the player's back: the gateway de-duplicates by
      // X-Request-Id, so a silent retry would only come back `request-in-flight` or `-settled`,
      // hiding what really happened. A new attempt is a new call with a new id.
      ...(safeConfig.kind === "hosted" ? { maxRetries: 0 } : {}),
    }),
  );
}

/** X-Request-Id (the chat id, 8–128 safe characters) and X-Unmapped-Purpose; never a world scope. */
export function hostedHeaders(request: ChatRequest): Result<Record<string, string>> {
  if (!REQUEST_ID.test(request.id)) {
    return err(
      "gateway-request-id",
      "A hosted call needs a request id of 8–128 letters, digits and . _ : -",
      "This is a bug in the calling code, not something the player can fix.",
    );
  }
  return ok({ [REQUEST_ID_HEADER]: request.id, [PURPOSE_HEADER]: request.usage.purpose });
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
  const headers = config.kind === "hosted" ? hostedHeaders(request) : ok(undefined);
  if (!headers.ok) return headers;
  const budget = fitOutput(request, options.context, `${config.kind} · ${config.model}`);
  if (!budget.ok) return budget;

  const fitted = { ...request, maxTokens: budget.value.maxTokens };
  const body = buildChatBody(config, fitted) as unknown as ChatCompletionCreateParamsStreaming;
  const calls = createToolCallAccumulator();
  const think = createThinkFilter();
  let raw = "";
  let usage: ChatUsage | null = null;
  try {
    const stream = await client.value.chat.completions.create(body, {
      signal,
      headers: headers.value,
    });
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
          : config.kind === "hosted"
            ? "check UNMAPPED_GATEWAY_URL in .env and that the gateway is running, or use your own key or a local model in Settings → Model"
            : `check the endpoint (${config.baseUrl}) in Settings → Model and that the server is running`,
    });
  }
  // The gateway answers in its own codes, before the stream or as a `data: {"error":…}` event in it.
  if (e instanceof APIError && config.kind === "hosted") return fail(hostedError(e));
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
