// `runTurn` — one model turn, tools included.
//
//   assemble the system prompt → chat → tool calls? execute them, append results, chat again
//                                     → no tool calls? that text is the answer
//
// Rule 5: this returns a Result. A prompt that fails to assemble, a chat that fails, a runaway
// tool loop and an abort are all values, never exceptions.

import type { Context } from "@deepseek-ai/cordis";
import type { ChatMessage, ChatUsage, ProgramShape } from "@shared/llm";
import { err, fail, ok, type Result, toError } from "@shared/result";
import "./events";
import type {
  AssembleContext,
  ChatFn,
  PromptSection,
  ToolExecutionResult,
  TurnResult,
} from "./types";

/** Defaults chosen for a 4B local model on a 16 GB machine: short answers, warm temperature. */
export const TURN_DEFAULTS = { maxSteps: 4, maxTokens: 2048, temperature: 0.8 } as const;

export interface TurnInput {
  ctx: Context;
  chat: ChatFn;
  /** The conversation so far. Any system message is dropped: the harness owns that slot. */
  messages: ChatMessage[];
  assemble: AssembleContext;
  /** Sections for this turn only, assembled in but never registered (see `assemble`). */
  sections?: readonly PromptSection[];
  /** Offer the registered tools to the model (default true). */
  useTools?: boolean;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  /** GBNF grammar; only sent when no tools are offered, since the two cannot be combined. */
  grammar?: string | null;
  /** The answer's program shape (Apple's on-device model decodes against it); never with tools. */
  program?: ProgramShape;
  /** The answer's JSON Schema (Apple's on-device model decodes against it); never with tools. */
  schema?: Record<string, unknown>;
  /** The least answer the turn can use; a small local context refuses the call below it. */
  minTokens?: number;
  onDelta?(text: string): void;
}

/** Sums two steps' tokens; a step the provider did not report adds nothing it did not say. */
export function addUsage(a: ChatUsage | null, b: ChatUsage | null): ChatUsage | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    prompt: a.prompt + b.prompt,
    completion: a.completion + b.completion,
    cached: a.cached === null && b.cached === null ? null : (a.cached ?? 0) + (b.cached ?? 0),
  };
}

export async function runTurn(input: TurnInput): Promise<Result<TurnResult>> {
  const { assemble, ctx } = input;
  const maxSteps = input.maxSteps ?? TURN_DEFAULTS.maxSteps;
  // A function call, so control-flow analysis re-reads the signal at every step instead of
  // keeping the narrowing from the first check.
  const aborted = (): boolean => assemble.signal?.aborted === true;

  let system: string;
  try {
    system = ctx.systemPrompt.assemble(assemble, input.sections ?? []).text;
  } catch (thrown) {
    return fail({
      ...toError(thrown, "prompt-assemble"),
      hint: "a prompt section referenced a variable no plugin registered, or reused a registered name",
    });
  }

  const schemas = (input.useTools ?? true) ? ctx.tools.schemas() : [];
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    ...input.messages.filter((message) => message.role !== "system"),
  ];
  const toolResults: ToolExecutionResult[] = [];
  let usage: ChatUsage | null = null;

  for (let step = 1; step <= maxSteps; step += 1) {
    if (aborted()) return err("aborted", "the turn was aborted");

    const response = await input.chat(
      {
        messages: [...messages],
        maxTokens: input.maxTokens ?? TURN_DEFAULTS.maxTokens,
        temperature: input.temperature ?? TURN_DEFAULTS.temperature,
        // llama.cpp refuses a grammar together with tools, and a tool turn needs tools.
        grammar: schemas.length === 0 ? (input.grammar ?? null) : null,
        ...(schemas.length === 0 && input.program !== undefined ? { program: input.program } : {}),
        ...(schemas.length === 0 && input.schema !== undefined ? { schema: input.schema } : {}),
        ...(input.minTokens === undefined ? {} : { minTokens: input.minTokens }),
        stop: [],
        tools: schemas,
      },
      input.onDelta,
      // The signal reaches the completion in flight, so a cancel stops the provider stream too.
      assemble.signal === undefined ? undefined : { signal: assemble.signal },
    );
    if (!response.ok) return fail(response.error);
    usage = addUsage(usage, response.value.usage);

    const { text, toolCalls } = response.value;
    if (toolCalls.length === 0) {
      messages.push({ role: "assistant", content: text });
      return ok({ text, steps: step, usage, toolResults, messages });
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
