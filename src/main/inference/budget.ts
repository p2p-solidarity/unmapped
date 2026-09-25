// Output budgets on a small local context. Every task's `maxTokens` was tuned for a cloud model
// with room to spare; a 4K on-device model cannot hold a long prompt plus that much answer. Before
// a request leaves main, its prompt is estimated and the answer is lowered to what still fits — or,
// when not even the task's minimum useful answer fits, the request is refused with a hint instead
// of being sent to fail halfway through a program.

import type { ChatRequest, ContextWindow } from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";

/** Room for the chat template's own wrapping and for the estimate running low. */
const TEMPLATE_RESERVE = 96;
const PER_MESSAGE = 6;
/** A task that states no minimum can still use two fifths of what it asked for. */
const DEFAULT_MIN_SHARE = 0.4;
const SMALLEST_ANSWER = 256;

/**
 * Tokens in a piece of text, on the high side: about 3.5 ASCII characters per token, and a little
 * over one token per CJK or other wide character (they rarely merge in small-model vocabularies).
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let wide = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 128) ascii += 1;
    else if (code < 0xdc00 || code > 0xdfff) wide += 1; // a surrogate pair counts once
  }
  return Math.ceil(ascii / 3.5 + wide * 1.1);
}

export function promptTokens(request: Pick<ChatRequest, "messages" | "tools">): number {
  let total = TEMPLATE_RESERVE;
  for (const message of request.messages) {
    total += PER_MESSAGE + estimateTokens(message.content);
    if (message.role === "assistant") {
      for (const call of message.toolCalls ?? []) {
        total += PER_MESSAGE + estimateTokens(call.name + call.arguments);
      }
    }
  }
  if (request.tools.length > 0) total += estimateTokens(JSON.stringify(request.tools));
  return total;
}

export function minUsefulTokens(request: Pick<ChatRequest, "maxTokens" | "minTokens">): number {
  const wanted = request.minTokens ?? Math.ceil(request.maxTokens * DEFAULT_MIN_SHARE);
  return Math.min(
    request.maxTokens,
    Math.max(Math.min(SMALLEST_ANSWER, request.maxTokens), wanted),
  );
}

export interface Budget {
  maxTokens: number;
  promptTokens: number | null;
}

/** `window` null = a cloud API: the request goes out as the task asked. */
export function fitOutput(
  request: Pick<ChatRequest, "messages" | "tools" | "maxTokens" | "minTokens">,
  window: ContextWindow | null,
  modelLabel: string,
): Result<Budget> {
  if (window === null) return ok({ maxTokens: request.maxTokens, promptTokens: null });
  const prompt = promptTokens(request);
  const room = window.tokens - prompt;
  const need = minUsefulTokens(request);
  if (room < need) {
    return fail({
      code: "model-context-too-small",
      message: `This task needs about ${prompt} tokens of prompt and at least ${need} of answer, but ${modelLabel} holds ${window.tokens} in all.`,
      hint: "Switch to Cloud API in Settings → Model, or give the local model a larger context.",
    });
  }
  return ok({ maxTokens: Math.min(request.maxTokens, room), promptTokens: prompt });
}
