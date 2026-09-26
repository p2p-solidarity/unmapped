// Wires the pure program loop (`program.ts`) to the harness and the real DSL. Everything
// narrative-shaped goes through `generateProgram`, so there is exactly one place where prompts meet
// the model.
//
// The DSL library spec is not sent as a system message any more: it is registered as a prompt
// section at `ORDER.DSL_SPEC` for the duration of the turn, so a mod's sections sit around it in
// the assembled prompt and are unwound with it (Rule 11). A program turn never offers tools — the
// program *is* the output, and a grammar and a tool call cannot both constrain one completion.

import type { DslError } from "@dsl";
import { normalizeOutput, repairPrompt } from "@dsl";
import { ORDER, type PromptPurpose } from "@harness";
import { useInferenceStore } from "@renderer/state/inferenceStore";
import type { ChunkCoord } from "@shared/chunks";
import type { ChatMessage } from "@shared/llm";
import { type AppError, fail, ok, type Result } from "@shared/result";
import type { UsagePurpose } from "@shared/usage";
import { acceptedOf, type Program, type ProgramChat, runProgram } from "./program";
import { DSL_SECTION, runNarrativeTurn, type TurnSection } from "./turn";

/**
 * GBNF is a llama.cpp sampler feature. Sending it anywhere else is at best ignored and at worst a
 * 400, so the grammar is dropped unless the active provider is llama.cpp.
 */
export function grammarForProvider(grammar: string): string | null {
  return useInferenceStore.getState().config?.kind === "llamacpp" ? grammar : null;
}

function isSystem(message: ChatMessage): boolean {
  return message.role === "system";
}

/**
 * Lifts the loop's system turn out of `messages` and into the harness as a temporary section. The
 * repair rounds re-register the same text, which is what "for that turn" means when a turn takes
 * more than one completion.
 */
function harnessChat(
  purpose: PromptPurpose,
  task: UsagePurpose,
  language: string,
  extra: { sections?: readonly TurnSection[]; coord?: ChunkCoord; signal?: AbortSignal } = {},
): ProgramChat {
  return async (request, onDelta) => {
    const spec = request.messages
      .filter(isSystem)
      .map((message) => message.content)
      .join("\n\n");
    const turn = await runNarrativeTurn({
      purpose,
      task,
      language,
      messages: request.messages.filter((message) => !isSystem(message)),
      section: { name: DSL_SECTION, order: ORDER.DSL_SPEC, text: spec },
      ...extra,
      useTools: false,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      grammar: request.grammar,
      onDelta,
    });
    if (!turn.ok) return fail(turn.error);
    return ok({ text: turn.value.text, usage: turn.value.usage });
  };
}

export interface GenerateProgramInput<T> {
  system: string;
  user: string;
  /** What the turn is for: "scene" | "dialogue" | "item". */
  purpose: PromptPurpose;
  /** What the calls are counted as in the usage ledger (witness, chapter, place…). */
  task: UsagePurpose;
  /** `genesis.language` — the model writes in the player's language (Rule 10). */
  language: string;
  parse(source: string): Result<T, DslError>;
  /** Extra prompt sections for this program's turns only. */
  sections?: readonly TurnSection[];
  coord?: ChunkCoord;
  grammar?: string | null;
  maxTokens?: number;
  temperature?: number;
  onDelta?(text: string): void;
  /** Aborts the model call in flight (`chat(..., { signal })`) and stops between repair rounds. */
  signal?: AbortSignal;
  /**
   * Commits a program that parsed — usually the append of the event it becomes (D5). A refusal
   * about the program (`isContentRefusal`: its size, words, lore links) goes back to the model as
   * a repair round with its code, message and hint, from the same two; any other is returned at
   * once. Never called once `signal` aborted.
   */
  accept?(program: { source: string; graph: T }): Promise<Result<unknown>>;
}

/** A refusal from main in the shape `repairPrompt` quotes: its code, message and hint. */
export function refusalAsDslError(error: AppError): DslError {
  return {
    code: error.code,
    message: error.message,
    ...(error.hint === undefined ? {} : { hint: error.hint }),
    errors: [],
    unresolved: [],
    orphaned: [],
  };
}

export function generateProgram<T>(input: GenerateProgramInput<T>): Promise<Result<Program<T>>> {
  const extra = {
    ...(input.sections === undefined ? {} : { sections: input.sections }),
    ...(input.coord === undefined ? {} : { coord: input.coord }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  };
  const { accept, ...spec } = input;
  return runProgram<T, DslError>(harnessChat(input.purpose, input.task, input.language, extra), {
    ...spec,
    normalize: normalizeOutput,
    repair: repairPrompt,
    ...(accept === undefined
      ? {}
      : {
          accept: async (program) => acceptedOf(await accept(program), refusalAsDslError),
        }),
  });
}

export type { Program } from "./program";
