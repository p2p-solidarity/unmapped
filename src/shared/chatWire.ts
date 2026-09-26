// The chat body on the wire and the think filter (rev 6 phase 4, D2 "Shared code"): main
// (src/main/inference/client.ts) and the gateway (src/gateway/upstreamBody.ts) run this one copy.
//
// The body is OpenAI's Chat Completions shape plus the few extras a runtime takes: `grammar`
// (llama.cpp, and the gateway, which forwards it only to llama.cpp upstreams), `chat_template_kwargs`
// (llama.cpp / Ollama / vLLM) and the GPT-5 / o-series parameter names. The hosted route sends a
// neutral body — no reasoning names, no template switch — and the gateway reshapes it for the
// upstream the model lives on.
//
// Pure: no Node, no DOM.

import type { ChatMessage, ChatRequest, ProviderKind, ToolSchema } from "./llm";

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

/** A tool schema as the provider wants it: a flat schema wrapped in a function envelope. */
export interface WireTool {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

/**
 * Every runtime a body is shaped for: the app's providers, plus the gateway's `compatible` upstream
 * (an OpenAI-compatible server of unknown make, which gets only the neutral fields).
 */
export type WireKind = ProviderKind | "compatible";

/**
 * The request body actually sent. The OpenAI SDK types only the official parameters, so the
 * runtime-specific extras are declared here and the whole object is cast once, at the SDK boundary.
 * `M` is the message shape: the app's `WireMessage`, or the gateway's validated caller messages.
 */
export interface ChatBody<M = WireMessage> {
  model: string;
  messages: M[];
  stream: boolean;
  stream_options?: { include_usage: true };
  stop?: string | string[];
  /** Present only when the caller offered tools this step. */
  tools?: WireTool[];
  tool_choice?: "auto" | "none";
  /** Classic Chat Completions budget (llama.cpp / ollama / vLLM / custom / the gateway). */
  max_tokens?: number;
  /** GPT-5 family rejects `max_tokens` and requires this name instead. */
  max_completion_tokens?: number;
  /** Omitted for GPT-5 family: any value but the default returns 400 "Unsupported parameter". */
  temperature?: number;
  /** GPT-5 family only; "low" keeps DSL generation fast. */
  reasoning_effort?: "none" | "low" | "medium" | "high";
  /** GBNF that constrains the sampler to our DSL (llama.cpp; the gateway passes it on). */
  grammar?: string;
  /** llama.cpp / ollama / vLLM: stops Qwen-style chat templates opening a <think> block. */
  chat_template_kwargs?: { enable_thinking: boolean };
}

export interface WireInput<M> {
  model: string;
  messages: readonly M[];
  tools: readonly WireTool[];
  toolChoice?: "auto" | "none";
  maxTokens: number;
  /** Null: leave the runtime's default. */
  temperature: number | null;
  stop: string | readonly string[] | null;
  grammar: string | null;
  stream: boolean;
}

/** Runtimes on a machine of the player's (or the operator's): never the reasoning names. */
const LOCAL_RUNTIMES: ReadonlySet<WireKind> = new Set(["llamacpp", "ollama", "vllm", "apple-fm"]);

/**
 * Reasoning models (GPT-5 family, o-series) take `max_completion_tokens` and reject `temperature`.
 * Local runtimes never take these fields, whatever the model is called, and the hosted route sends a
 * neutral body (the gateway decides for its upstream). Gateways namespace the model
 * ("openai/gpt-5"), so the last path segment is matched. The OpenAI preset is included on purpose:
 * switching its model to gpt-4o must not send reasoning fields.
 */
export function usesReasoningParams(target: { kind: WireKind; model: string }): boolean {
  if (LOCAL_RUNTIMES.has(target.kind) || target.kind === "hosted") return false;
  const model = (target.model.split("/").pop() ?? "").toLowerCase();
  return /^gpt-5/.test(model) || /^o[1-9]/.test(model);
}

/**
 * Local runtimes whose chat templates take `chat_template_kwargs` (unknown fields are ignored by
 * all three). Apple's `fm serve` has no thinking mode and custom servers are unknown, so neither
 * gets the field; the think filter below covers any model that reasons out loud anyway.
 */
function takesThinkingSwitch(kind: WireKind): boolean {
  return kind === "llamacpp" || kind === "ollama" || kind === "vllm";
}

/** llama.cpp samples with it; the gateway takes it as an extension field for its llama.cpp upstreams. */
function takesGrammar(kind: WireKind): boolean {
  return kind === "llamacpp" || kind === "hosted";
}

export function chatBody<M>(kind: WireKind, input: WireInput<M>): ChatBody<M> {
  const body: ChatBody<M> = {
    model: input.model,
    messages: [...input.messages],
    stream: input.stream,
  };
  if (input.stream) body.stream_options = { include_usage: true };
  const stop = input.stop;
  if (typeof stop === "string") body.stop = stop;
  else if (stop !== null && stop.length > 0) body.stop = [...stop];

  const withTools = input.tools.length > 0;
  if (withTools) {
    body.tools = [...input.tools];
    body.tool_choice = input.toolChoice ?? "auto";
  }

  if (usesReasoningParams({ kind, model: input.model })) {
    body.max_completion_tokens = input.maxTokens;
    // GPT-5 Chat Completions rejects function tools when reasoning is enabled. Keep reasoning for
    // plain generation, but explicitly turn it off for tool turns instead of making the provider
    // return a 400 (the Responses API is not part of this OpenAI-compatible client contract).
    body.reasoning_effort = withTools ? "none" : "low";
  } else {
    body.max_tokens = input.maxTokens;
    if (input.temperature !== null) body.temperature = input.temperature;
  }

  // A GBNF grammar pins the sampler to the DSL, which would make emitting a tool call impossible.
  // Tools win: the caller asked for a decision, not a program.
  if (input.grammar !== null && takesGrammar(kind) && !withTools) body.grammar = input.grammar;
  if (takesThinkingSwitch(kind)) body.chat_template_kwargs = { enable_thinking: false };
  return body;
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

export function toWireTool(tool: ToolSchema): WireTool {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  };
}

/** The app's request as main sends it to `target`: always streamed, with usage. */
export function buildChatBody(
  target: { kind: ProviderKind; model: string },
  request: Pick<
    ChatRequest,
    "messages" | "tools" | "maxTokens" | "temperature" | "stop" | "grammar"
  >,
): ChatBody {
  return chatBody(target.kind, {
    model: target.model,
    messages: request.messages.map(toWireMessage),
    tools: request.tools.map(toWireTool),
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    stop: request.stop,
    grammar: request.grammar,
    stream: true,
  });
}

// ── The think filter ─────────────────────────────────────────────────────────────────────────
// Removes `<think>…</think>` (and `<thinking>`) blocks from a streamed answer, for every task and
// every provider, so no caller has to know that Qwen-style models reason out loud. Works on
// fragments: a tag split across two deltas is held back until it can be recognised. An unclosed
// block (a stream cut short while thinking) yields nothing.

const OPEN = /<think(?:ing)?\b[^>]*>/i;
const CLOSE = /<\/think(?:ing)?\s*>/i;
/** Longest tag worth holding back for; anything longer is ordinary text. */
const TAG_HOLD = 48;

export interface ThinkFilter {
  push(chunk: string): string;
  /** Whatever was held back at the end of the stream. */
  flush(): string;
}

function mayBecomeOpenTag(tail: string): boolean {
  if (tail.length > TAG_HOLD || tail.includes(">")) return false;
  const lower = tail.toLowerCase();
  return "<thinking".startsWith(lower) || /^<think(?:ing)?\b[^>]*$/.test(lower);
}

export function createThinkFilter(): ThinkFilter {
  let held = "";
  let inside = false;
  /** Right after a block closes, the blank lines it leaves are not part of the answer. */
  let trimLead = false;

  function emit(text: string): string {
    if (!trimLead) return text;
    const trimmed = text.replace(/^\s+/, "");
    if (trimmed.length > 0) trimLead = false;
    return trimmed;
  }

  return {
    push(chunk) {
      held += chunk;
      let out = "";
      for (;;) {
        if (inside) {
          const close = CLOSE.exec(held);
          if (close === null) {
            const lt = held.lastIndexOf("<");
            held = lt >= 0 && held.length - lt <= TAG_HOLD ? held.slice(lt) : "";
            return out;
          }
          held = held.slice(close.index + close[0].length);
          inside = false;
          trimLead = true;
          continue;
        }
        const open = OPEN.exec(held);
        if (open !== null) {
          out += emit(held.slice(0, open.index));
          held = held.slice(open.index + open[0].length);
          inside = true;
          continue;
        }
        // A bare closing tag (thinking switched off mid-template) is dropped on its own.
        const stray = CLOSE.exec(held);
        if (stray !== null) {
          out += emit(held.slice(0, stray.index));
          held = held.slice(stray.index + stray[0].length);
          trimLead = true;
          continue;
        }
        const lt = held.lastIndexOf("<");
        if (lt >= 0 && mayBecomeOpenTag(held.slice(lt))) {
          out += emit(held.slice(0, lt));
          held = held.slice(lt);
        } else {
          out += emit(held);
          held = "";
        }
        return out;
      }
    },
    flush() {
      const rest = inside ? "" : emit(held);
      held = "";
      return rest;
    },
  };
}

const BLOCKS = /<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?\s*>/gi;
const CLOSES = /<\/think(?:ing)?\s*>/gi;

/**
 * The final answer. Unlike the live filter it can look back: when a template opened the block in
 * the prompt, the answer starts mid-thought, so everything before the last bare closing tag goes.
 */
export function stripThinking(text: string): string {
  let out = text.replace(BLOCKS, "");
  const closes = [...out.matchAll(CLOSES)];
  const last = closes.at(-1);
  if (last?.index !== undefined) out = out.slice(last.index + last[0].length);
  const open = out.search(OPEN);
  if (open >= 0) out = out.slice(0, open);
  return out.replace(/^\s+/, "");
}
