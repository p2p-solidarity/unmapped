// `runTurn` — one model turn, tools included.
//
//   assemble the system prompt → chat → tool calls? execute them, append results, chat again
//                                     → no tool calls? that text is the answer
//
// Rule 5: this returns a Result. A prompt that fails to assemble, a chat that fails, a runaway
// tool loop and an abort are all values, never exceptions.

import type { Context } from "@deepseek-ai/cordis";
import type { ChatMessage } from "@shared/llm";
import { err, fail, ok, type Result, toError } from "@shared/result";
import "./events";
import type { AssembleContext, ChatFn, ToolExecutionResult, TurnResult } from "./types";

/** Defaults chosen for a 4B local model on a 16 GB machine: short answers, warm temperature. */
export const TURN_DEFAULTS = { maxSteps: 4, maxTokens: 2048, temperature: 0.8 } as const;

export interface TurnInput {
  ctx: Context;
  chat: ChatFn;
  /** The conversation so far. Any system message is dropped: the harness owns that slot. */
  messages: ChatMessage[];
  assemble: AssembleContext;
  /** Offer the registered tools to the model (default true). */
  useTools?: boolean;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  /** GBNF grammar; only sent when no tools are offered, since the two cannot be combined. */
  grammar?: string | null;
  onDelta?(text: string): void;
}

export async function runTurn(input: TurnInput): Promise<Result<TurnResult>> {
  const { assemble, ctx } = input;
  const maxSteps = input.maxSteps ?? TURN_DEFAULTS.maxSteps;
  // A function call, so control-flow analysis re-reads the signal at every step instead of
  // keeping the narrowing from the first check.
  const aborted = (): boolean => assemble.signal?.aborted === true;

  let system: string;
  try {
    system = ctx.systemPrompt.assemble(assemble).text;
  } catch (thrown) {
    return fail({
      ...toError(thrown, "prompt-assemble"),
      hint: "a prompt section referenced a variable no plugin registered",
    });
  }

  const schemas = (input.useTools ?? true) ? ctx.tools.schemas() : [];
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.filter((message) => message.role !== "system"),
  ];
  const toolResults: ToolExecutionResult[] = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    if (aborted()) return err("aborted", "the turn was aborted");

    const response = await input.chat(
      {
        messages: [...messages],
        maxTokens: input.maxTokens ?? TURN_DEFAULTS.maxTokens,
        temperature: input.temperature ?? TURN_DEFAULTS.temperature,
        // llama.cpp refuses a grammar together with tools, and a tool turn needs tools.
        grammar: schemas.length === 0 ? (input.grammar ?? null) : null,
        stop: [],
        tools: schemas,
      },
      input.onDelta,
    );
    if (!response.ok) return fail(response.error);

    const { text, toolCalls } = response.value;
    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: text });
      return ok({ text, steps: step, toolResults, messages });
    }

    messages.push({ role: "assistant", content: text, toolCalls });
    for (const call of toolCalls) {
      const result = await ctx.tools.execute(call, {
        purpose: assemble.purpose,
        signal: assemble.signal,
      });
      toolResults.push(result);
      messages.push({
        role: "tool",
        content: result.content,
        toolCallId: result.callId,
        name: result.name,
      });
    }
    if (aborted()) return err("aborted", "the turn was aborted");
  }

  return err(
    "turn-max-steps",
    `the model called tools for ${maxSteps} steps without answering`,
    "raise maxSteps, or narrow the tool descriptions so the model stops looping",
  );
}
