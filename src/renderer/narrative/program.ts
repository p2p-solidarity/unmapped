// The generate → parse → repair loop, with every dependency injected. Nothing here touches the
// DOM, the DSL or IPC, which is what makes the loop testable (and what keeps `pipeline.ts` thin).
// Rule 7: at most two repair rounds, and a program that still will not parse is an error state —
// never a hand-written fallback.
//
// A program that parses may still have to pass one more check before it counts (`accept`: main's
// append of the event it becomes, rev 6 phase 3 D5). A refusal about the program itself goes back
// as a repair round from the same budget — two in all, whatever mix of parse errors and refusals
// spends them; any other refusal ends the loop at once and is never shown to the model.

import { addUsage } from "@harness";
import { isContentRefusal } from "@shared/history/repairable";
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

/** What the check after a parse made of a program. */
export type Accepted<E extends AppError> =
  | { ok: true }
  /** About the program (its size, its words, its links): a repair round, like a parse error. */
  | { ok: false; repair: true; error: E }
  /** Not the model's to fix (the door, a quota, a race, the save changed): shown at once. */
  | { ok: false; repair: false; error: AppError };

/**
 * Main's answer to a parsed program as the loop reads it: a content refusal
 * (`isContentRefusal`) is repaired, as `asError` makes it; any other ends the loop.
 */
export function acceptedOf<E extends AppError>(
  result: Result<unknown>,
  asError: (error: AppError) => E,
): Accepted<E> {
  if (result.ok) return { ok: true };
  return isContentRefusal(result.error)
    ? { ok: false, repair: true, error: asError(result.error) }
    : { ok: false, repair: false, error: result.error };
}

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
  /** Checked between repair rounds; the in-flight call is aborted by the chat it was given to. */
  signal?: AbortSignal;
  /**
   * Runs once a program parses (never after `signal` aborted): the program is returned only once
   * this accepts it. See the header for how a refusal spends the repair budget.
   */
  accept?(program: { source: string; graph: T }): Promise<Accepted<E>>;
}

export interface Program<T> {
  /** The exact program text that parsed, ready to write to `world.oui`. */
  source: string;
  graph: T;
  /** Tokens over every round, repairs included; null when the provider reported none. */
  usage: ChatUsage | null;
}

export async function runProgram<T, E extends AppError>(
  chat: ProgramChat,
  spec: ProgramSpec<T, E>,
): Promise<Result<Program<T>>> {
  const maxRepairs = spec.maxRepairs ?? MAX_REPAIRS;
  const opening: ChatMessage[] = [
    { role: "system", content: spec.system },
    { role: "user", content: spec.user },
  ];
  let messages = opening;
  let last: E | null = null;
  let usage: ChatUsage | null = null;

  for (let round = 0; round <= maxRepairs; round++) {
    if (spec.signal?.aborted === true) {
      return fail({ code: "request-aborted", message: "The request was cancelled." });
    }
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
    usage = addUsage(usage, response.value.usage);

    const source = spec.normalize(response.value.text);
    const parsed = spec.parse(source);
    let failure: E;
    if (parsed.ok) {
      if (spec.accept === undefined) return ok({ source, graph: parsed.value, usage });
      // A stop that came while the model wrote wins over the program it sent: nothing is kept.
      if (aborted(spec.signal)) {
        return fail({ code: "request-aborted", message: "The request was cancelled." });
      }
      const accepted = await spec.accept({ source, graph: parsed.value });
      if (accepted.ok) return ok({ source, graph: parsed.value, usage });
      if (!accepted.repair) return fail(accepted.error);
      failure = accepted.error;
    } else {
      failure = parsed.error;
    }

    last = failure;
    if (round < maxRepairs) {
      // Why a repair round was spent, so a run can be read back from the log (never the text itself).
      const first = (failure as { errors?: { message?: string }[] }).errors?.[0]?.message;
      console.warn(
        `[repair] ${round + 1}/${maxRepairs} · ${failure.code} · ${failure.message.slice(0, 200)}${first === undefined ? "" : ` · ${first.slice(0, 200)}`}`,
      );
    }
    // Only the latest attempt goes back (the repair prompt quotes it again): earlier rounds would
    // fill a small local context with programs that were already rejected.
    if (round < maxRepairs) {
      messages = [
        ...opening,
        { role: "assistant", content: source },
        { role: "user", content: spec.repair(source, failure) },
      ];
    }
  }

  return fail(exhausted(last, maxRepairs));
}

/** Read afresh (the loop's own check before the call would otherwise narrow it to false). */
function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function exhausted(last: AppError | null, rounds: number): AppError {
  if (last === null) {
    return {
      code: "program-invalid",
      message: "The model never produced a parsable program.",
      hint: "try again, or switch to a larger model in Settings → Model",
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
    hint: last.hint ?? "try again, or switch to a larger model in Settings → Model",
  };
}
