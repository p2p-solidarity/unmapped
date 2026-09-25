// Every model turn in the game goes through here, so the system prompt the model sees is always the
// assembled one: built-in sections, the enabled mods' sections, and — for a DSL turn — the library
// spec registered for exactly that turn and disposed after it (Rule 11).
//
// Before a world exists there is no world harness to borrow (Genesis writes floor 1 for a world
// that has not been created yet), so that turn runs on a throwaway harness with the built-ins only.

import {
  createHarness,
  type Harness,
  mountBuiltins,
  type PromptPurpose,
  runTurn,
  type ToolExecutionResult,
} from "@harness";
import { getWorldHarness } from "@renderer/harness/worldHarness";
import { chat } from "@renderer/llm/client";
import type { ChunkCoord } from "@shared/chunks";
import type { ChatMessage } from "@shared/llm";
import { fail, ok, type Result } from "@shared/result";

type HarnessContext = Harness["ctx"];

/** The name the DSL library spec is registered under while a program turn runs. */
export const DSL_SECTION = "dsl-spec";

export interface TurnSection {
  name: string;
  order: number;
  text: string;
}

export interface NarrativeTurnInput {
  /** What this turn is for; prompt sections may key off it. */
  purpose: PromptPurpose;
  /** The player's language (Rule 10) — the model answers in it, we never translate. */
  language: string;
  messages: ChatMessage[];
  /** Registered before the turn and disposed after it. */
  section?: TurnSection | null;
  /** More sections for this turn only (a world bible, the ground being witnessed…). */
  sections?: readonly TurnSection[];
  /** Open-land chunk the turn is about; world context activates lore around it. */
  coord?: ChunkCoord;
  useTools?: boolean;
  maxSteps?: number;
  maxTokens?: number;
  temperature?: number;
  grammar?: string | null;
  signal?: AbortSignal;
  onDelta?(text: string): void;
}

export interface NarrativeTurn {
  text: string;
  toolResults: ToolExecutionResult[];
}

interface Borrowed {
  ctx: HarnessContext;
  release(): Promise<void>;
}

async function borrow(): Promise<Borrowed> {
  const world = getWorldHarness();
  if (world !== null) return { ctx: world.ctx, release: async () => undefined };
  const temporary = createHarness();
  mountBuiltins(temporary.ctx);
  return {
    ctx: temporary.ctx,
    release: async () => {
      await temporary.dispose();
    },
  };
}

export async function runNarrativeTurn(input: NarrativeTurnInput): Promise<Result<NarrativeTurn>> {
  const borrowed = await borrow();
  const disposers = [...(input.section ? [input.section] : []), ...(input.sections ?? [])]
    .filter((section) => section.text.length > 0)
    .map((section) =>
      borrowed.ctx.systemPrompt.section({
        name: section.name,
        order: section.order,
        text: section.text,
        // Bible and world text are data: a "{{" in them must not break assembly.
        interpolate: false,
      }),
    );

  try {
    const result = await runTurn({
      ctx: borrowed.ctx,
      chat,
      messages: input.messages,
      assemble: {
        purpose: input.purpose,
        language: input.language,
        signal: input.signal,
        ...(input.coord === undefined ? {} : { coord: input.coord }),
      },
      useTools: input.useTools ?? false,
      maxSteps: input.maxSteps,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      grammar: input.grammar ?? null,
      onDelta: input.onDelta,
    });
    if (!result.ok) return fail(result.error);
    return ok({ text: result.value.text, toolResults: result.value.toolResults });
  } finally {
    for (const dispose of disposers) dispose();
    await borrowed.release();
  }
}
