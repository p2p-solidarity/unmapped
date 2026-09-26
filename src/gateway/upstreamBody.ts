// The chat body the gateway accepts and the one it forwards (rev 6 phase 4, D2 "The gateway speaks
// OpenAI"). The app sends a neutral body (`usesReasoningParams` is false for `hosted`); the gateway
// re-shapes it for the upstream the model lives on, from a whitelist of fields, so a caller can
// never add `n: 50` or an upstream-only parameter to a metered call. The shaping rules are main's
// own (`chatBody` in @shared/chatWire), so the two never drift.

import { chatBody } from "@shared/chatWire";
import { estimateTokens } from "@shared/pricing";
import { z } from "zod";
import type { UpstreamKind } from "./upstreams";

const text = z.string().max(2_000_000);
const textParts = z.array(z.strictObject({ type: z.literal("text"), text })).max(100);

const toolCall = z.strictObject({
  id: z.string().min(1).max(200),
  type: z.literal("function"),
  function: z.strictObject({
    name: z.string().min(1).max(200),
    arguments: z.string().max(200_000),
  }),
});

const message = z.discriminatedUnion("role", [
  z.strictObject({ role: z.literal("system"), content: z.union([text, textParts]) }),
  z.strictObject({ role: z.literal("user"), content: z.union([text, textParts]) }),
  z.strictObject({
    role: z.literal("assistant"),
    content: z.union([text, textParts]).nullable(),
    tool_calls: z.array(toolCall).max(64).optional(),
  }),
  z.strictObject({
    role: z.literal("tool"),
    content: text,
    tool_call_id: z.string().min(1).max(200),
  }),
]);

const tool = z.strictObject({
  type: z.literal("function"),
  function: z.strictObject({
    name: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

/** What a caller may send. Unknown fields are dropped, never forwarded. */
export const chatRequestSchema = z.object({
  model: z.string().min(1).max(200),
  messages: z.array(message).min(1).max(1000),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  max_tokens: z.number().int().positive().max(1_000_000).optional(),
  max_completion_tokens: z.number().int().positive().max(1_000_000).optional(),
  temperature: z.number().min(0).max(2).optional(),
  stop: z.union([z.string().max(200), z.array(z.string().max(200)).max(4)]).optional(),
  tools: z.array(tool).max(64).optional(),
  tool_choice: z.enum(["auto", "none"]).optional(),
  /** GBNF, forwarded only to llama.cpp upstreams. */
  grammar: z.string().max(100_000).optional(),
});

export type ChatRequest = z.output<typeof chatRequestSchema>;

/** The answer budget a call asks for (the classic or the GPT-5 name), or null. */
export function askedMaxTokens(request: ChatRequest): number | null {
  return request.max_completion_tokens ?? request.max_tokens ?? null;
}

function contentText(content: string | { text: string }[] | null): string {
  if (content === null) return "";
  return typeof content === "string" ? content : content.map((part) => part.text).join("\n");
}

/** Tokens per message the chat format adds around its content (role markers). */
const MESSAGE_OVERHEAD = 4;

/** A pre-call estimate of the prompt, for the hold only; the settle uses the provider's count. */
export function estimatePrompt(request: ChatRequest): number {
  let total = 0;
  for (const item of request.messages) {
    total += MESSAGE_OVERHEAD + estimateTokens(contentText(item.content));
    if (item.role === "assistant") {
      for (const call of item.tool_calls ?? []) {
        total += estimateTokens(call.function.name) + estimateTokens(call.function.arguments);
      }
    }
  }
  if (request.tools !== undefined) total += estimateTokens(JSON.stringify(request.tools));
  return total;
}

/**
 * The body sent upstream: always streamed with usage when `stream`, answer budget always set. The
 * grammar reaches only llama.cpp upstreams, reasoning names only openai / compatible ones.
 */
export function upstreamChatBody(
  kind: UpstreamKind,
  upstreamModel: string,
  request: ChatRequest,
  maxTokens: number,
  stream: boolean,
): Record<string, unknown> {
  return {
    ...chatBody(kind, {
      model: upstreamModel,
      messages: request.messages,
      tools: request.tools ?? [],
      toolChoice: request.tool_choice,
      maxTokens,
      temperature: request.temperature ?? null,
      stop: request.stop ?? null,
      grammar: request.grammar ?? null,
      stream,
    }),
  };
}
