// Every model turn in the game goes through here, so the system prompt the model sees is always the
// assembled one: built-in sections, the enabled mods' sections, and — for a DSL turn — the library
// spec and the bible for exactly that turn (Rule 11). Turn sections are handed to the assembly, not
// registered on the harness: the loaded world's harness is shared, and a witnessing and a chapter
// written at the same time must neither collide on a name nor read each other's sections.
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
import { usageTag } from "@renderer/llm/usage";
import type { ChunkCoord } from "@shared/chunks";
import type { ChatMessage, ChatUsage, ProgramShape } from "@shared/llm";
import { fail, ok, type Result, toError } from "@shared/result";
import type { UsagePurpose } from "@shared/usage";

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
  /** What the call is counted as in the usage ledger. */
  task: UsagePurpose;
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
  /** The program's shape for a provider that decodes against one (Apple's on-device model). */
  program?: ProgramShape;
  /** A guided answer's JSON Schema (Apple's on-device model decodes against it). */
  schema?: Record<string, unknown>;
  /** The least answer the turn can use (a small local context refuses the call below it). */
  minTokens?: number;
  /** The route's whole context is small: the world sections are assembled compact. */
  compact?: boolean;
  signal?: AbortSignal;
  onDelta?(text: string): void;
}

export interface NarrativeTurn {
  text: string;
  toolResults: ToolExecutionResult[];
  usage: ChatUsage | null;
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
  const sections = [...(input.section ? [input.section] : []), ...(input.sections ?? [])]
    .filter((section) => section.text.length > 0)
    .map((section) => ({
      name: section.name,
      order: section.order,
      text: section.text,
      // Bible and world text are data: a "{{" in them must not break assembly.
      interpolate: false,
    }));

  const tag = usageTag(input.task);
  try {
    const result = await runTurn({
      ctx: borrowed.ctx,
      sections,
      // runTurn hands the signal on, so it aborts the completion in flight too.
      chat: (request, onDelta, options) => chat({ ...request, usage: tag }, onDelta, options),
      messages: input.messages,
      assemble: {
        purpose: input.purpose,
        language: input.language,
        signal: input.signal,
        ...(input.coord === undefined ? {} : { coord: input.coord }),
        ...(input.compact === true ? { compact: true } : {}),
      },
      useTools: input.useTools ?? false,
      maxSteps: input.maxSteps,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      grammar: input.grammar ?? null,
      ...(input.program === undefined ? {} : { program: input.program }),
      ...(input.schema === undefined ? {} : { schema: input.schema }),
      ...(input.minTokens === undefined ? {} : { minTokens: input.minTokens }),
      onDelta: input.onDelta,
    });
    if (!result.ok) return fail(result.error);
    return ok({
      text: result.value.text,
      toolResults: result.value.toolResults,
      usage: result.value.usage,
    });
  } catch (thrown) {
    // A turn never rejects: whoever waits on it (a witnessing, a chapter) must get an error value.
    return fail(toError(thrown, "turn-failed"));
  } finally {
    await borrowed.release();
  }
}
