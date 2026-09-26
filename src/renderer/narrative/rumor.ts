// Writing one beat's rumors (rev 6 phase 3, D14): the beat chose what is retold and who tells it;
// the model only writes how, as one Rumors program for the whole batch, in the world's language
// (Rule 10). The prompt lists only the open slots whose fact and teller still stand
// (`rumorFacts`), and the parse context lists exactly those, so a rumor for any other slot goes
// back to the model. `parseRumors` puts every rumor to the history's own validator
// (`validateRumor`: the cited name, no other known name, one line), so a refusal is a repair round
// and counts toward Rule 7's two. Still invalid after that is an error value — never a stand-in
// line, never a partial batch the host filled in. Each rumor that passes becomes its own event
// body; writing them is the caller's (app/land/rumors.ts).

import { type DslError, parseRumors, type RumorDraft, rumorFacts, rumorPrompt } from "@dsl";
import type { WorldBible } from "@shared/cartridge";
import { chunkKey } from "@shared/chunks";
import { chunkStands } from "@shared/history/decay";
import { openRumorSlots } from "@shared/history/rumor";
import type { RumorBody, RumorSlot, WorldNow } from "@shared/history/types";
import type { ChatUsage } from "@shared/llm";
import { ok, type Result } from "@shared/result";
import { generateProgram } from "./pipeline";

/** Six one-line rumors, repairs quoting them back: a small budget, even in CJK. */
export const RUMOR_MAX_TOKENS = 1200;
export const RUMOR_TEMPERATURE = 0.8;

export interface RumorBatchInput {
  /** The fold the batch is written against (this device's, outbox on top), read when it began. */
  now: WorldNow;
  /** The beat's event id. */
  beat: string;
  /** The world's bible: the voice its residents talk in; null for a world without one. */
  bible: WorldBible | null;
  /** This device's author key. */
  author: string;
}

/** What one batch asks the model, and how its answer is read. */
export interface RumorBatchSpec {
  system: string;
  user: string;
  /** The slots the prompt lists, in slot order: the only ones a rumor may be written for. */
  slots: number[];
  parse(source: string): Result<RumorDraft[], DslError>;
}

export interface RumorBatch {
  beat: string;
  /** One body per rumor that passed, in slot order: each becomes its own `rumor` event. */
  bodies: RumorBody[];
  usage: ChatUsage | null;
}

/**
 * The beat's slots nobody has written a live rumor for yet (`openRumorSlots`), in slot order, whose
 * teller still stands where the beat found them: not faded, not hidden, and not a newer place
 * witnessed over theirs (someone else would be telling it).
 */
export function openSlotsOf(now: WorldNow, beat: string): RumorSlot[] {
  const upTo = now.beats.find((one) => one.id === beat)?.body.upTo ?? -1;
  return openRumorSlots(now)
    .filter((open) => open.beat === beat)
    .map((open) => open.slot)
    .filter((slot) => {
      const home = now.chunks[chunkKey(slot.listener)];
      return home !== undefined && chunkStands(now, home) && home.live.n <= upTo;
    })
    .sort((a, b) => a.slot - b.slot);
}

/**
 * The batch for `input.beat`, or null when nothing in it can be told: every slot is written, or
 * its fact or teller no longer stands (silence, D14 — no call is made for it).
 */
export function rumorBatchSpec(input: RumorBatchInput): RumorBatchSpec | null {
  const { now, beat } = input;
  const facts = rumorFacts(now, openSlotsOf(now, beat));
  if (facts.length === 0) return null;
  const listed = new Set(facts.map((fact) => fact.slot));
  const slots = openSlotsOf(now, beat).filter((slot) => listed.has(slot.slot));
  const numbers = slots.map((slot) => slot.slot);
  return {
    system: rumorPrompt({ now, slots, bible: input.bible }),
    user: `Write what people are saying now: at most one Rumor for each of slots ${numbers.join(", ")}. Output the program only.`,
    slots: numbers,
    parse: (source) => parseRumors(source, { slots: numbers, now, beat, author: input.author }),
  };
}

/** The bodies of a parsed batch, in slot order. */
export function rumorBodies(beat: string, drafts: readonly RumorDraft[]): RumorBody[] {
  return [...drafts]
    .sort((a, b) => a.slot - b.slot)
    .map((draft) => ({ beat, slot: draft.slot, text: draft.text }));
}

/**
 * One model call (and at most two repairs) for the beat's open slots, usage purpose `rumor`.
 * `ok(null)`: nothing to tell, no call was made.
 */
export async function generateRumors(
  input: RumorBatchInput & {
    /** `genesis.language`: the persona's language; the prompt names it too. */
    language: string;
  },
  io: { signal?: AbortSignal; onDelta?: (text: string) => void } = {},
): Promise<Result<RumorBatch | null>> {
  const spec = rumorBatchSpec(input);
  if (spec === null) return ok(null);
  const program = await generateProgram<RumorDraft[]>({
    system: spec.system,
    user: spec.user,
    purpose: "rumor",
    task: "rumor",
    language: input.language,
    parse: spec.parse,
    maxTokens: RUMOR_MAX_TOKENS,
    temperature: RUMOR_TEMPERATURE,
    ...(io.onDelta === undefined ? {} : { onDelta: io.onDelta }),
    ...(io.signal === undefined ? {} : { signal: io.signal }),
  });
  if (!program.ok) return program;
  return ok({
    beat: input.beat,
    bodies: rumorBodies(input.beat, program.value.graph),
    usage: program.value.usage,
  });
}
