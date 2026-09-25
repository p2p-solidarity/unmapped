// The generate → parse → repair loop, with every dependency injected. Nothing here touches the
// DOM, the DSL or IPC, which is what makes the loop testable (and what keeps `pipeline.ts` thin).
// Rule 7: at most two repair rounds, and a program that still will not parse is an error state —
// never a hand-written fallback.

import type { ChatMessage, ChatUsage } from "@shared/llm";
import type { AppError, Result } from "@shared/result";
import { fail, ok } from "@shared/result";

export const MAX_REPAIRS = 2;

export interface ProgramChatRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  grammar: string | null;
}

export type ProgramChat = (
  request: ProgramChatRequest,
  onDelta?: (text: string) => void,
) => Promise<Result<{ text: string; usage: ChatUsage | null }>>;

export interface ProgramSpec<T, E extends AppError> {
  /** System turn — the DSL library prompt plus world context. */
  system: string;
  /** User turn — what to write right now. */
  user: string;
  parse(source: string): Result<T, E>;
  /** Strips fences/prose the model wrapped around the program. */
  normalize(raw: string): string;
  /** Builds the USER turn that asks the model to patch the failing statements. */
  repair(source: string, error: E): string;
  grammar?: string | null;
  maxTokens?: number;
  temperature?: number;
  maxRepairs?: number;
  onDelta?(text: string): void;
}

export interface Program<T> {
  /** The exact program text that parsed, ready to write to `world.oui`. */
  source: string;
  graph: T;
}

export async function runProgram<T, E extends AppError>(
  chat: ProgramChat,
  spec: ProgramSpec<T, E>,
): Promise<Result<Program<T>>> {
  const maxRepairs = spec.maxRepairs ?? MAX_REPAIRS;
  const messages: ChatMessage[] = [
    { role: "system", content: spec.system },
    { role: "user", content: spec.user },
  ];
  let last: E | null = null;

  for (let round = 0; round <= maxRepairs; round++) {
    const response = await chat(
      {
        messages: [...messages],
        maxTokens: spec.maxTokens ?? 1600,
        temperature: spec.temperature ?? 0.8,
        grammar: spec.grammar ?? null,
      },
      spec.onDelta,
    );
    // A transport failure (no model, auth, timeout) is not something a repair prompt can fix.
    if (!response.ok) return fail(response.error);

    const source = spec.normalize(response.value.text);
    const parsed = spec.parse(source);
    if (parsed.ok) return ok({ source, graph: parsed.value });

    last = parsed.error;
    if (round < maxRepairs) {
      messages.push({ role: "assistant", content: source });
      messages.push({ role: "user", content: spec.repair(source, parsed.error) });
    }
  }

  return fail(exhausted(last, maxRepairs));
}

function exhausted(last: AppError | null, rounds: number): AppError {
  if (last === null) {
    return {
      code: "program-invalid",
      message: "The model never produced a parsable program.",
      hint: "try again, or switch to a larger model in Settings",
    };
  }
  // A DSL error carries the statement-level complaints; the first one is what the player (and
  // whoever reads the log) needs to see — "1 problem" on its own says nothing.
  const first = (last as { errors?: { message?: string }[] }).errors?.[0]?.message;
  return {
    code: last.code,
    message: `${last.message}${first === undefined ? "" : ` ${first}`} (still invalid after ${rounds} repair ${
      rounds === 1 ? "round" : "rounds"
    })`,
    hint: last.hint ?? "try again, or switch to a larger model in Settings",
  };
}
