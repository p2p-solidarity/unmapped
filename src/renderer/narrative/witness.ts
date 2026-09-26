// Witnessing (顯影, plan.md §3–§5): the one moment the model writes a chunk of open land. It gets
// the world bible verbatim, the hot lore around the chunk, what the neighbours are called and keep
// as custom, and what the ground here already is — and writes residents, a landmark, a custom and
// every resident's words, once. Parse → repair ≤ 2 rounds (Rule 7), a refusal of the witness by the
// world's history about what the program says counting as one (D5); failure leaves the chunk
// unwritten, never a fallback. A chunk that faded back into fog is witnessed anew: the model is told
// the old tale (`witness:legend`, rev 6 phase 3 D13) and writes a new place that may answer it.

import {
  authoredSection,
  bibleSections,
  type ChunkContext,
  chunkOutputSection,
  chunkSpec,
  type NeighbourSummary,
  neighbourSection,
  parseChunk,
  terrainSection,
  type WitnessedDraft,
} from "@dsl";
import { ORDER } from "@harness";
import { bibleLook, worldPropKinds } from "@shared/bible";
import type { WorldBible } from "@shared/cartridge";
import type { ChunkTerrain } from "@shared/chunks";
import type { Result } from "@shared/result";
import { generateProgram, type Program } from "./pipeline";
import type { TurnSection } from "./turn";

export const WITNESS_MAX_TOKENS = 3200;
export const WITNESS_TEMPERATURE = 0.9;

/** What a fogged chunk was, before it faded: the new witness grows out of this legend (傳說). */
export interface WitnessLegend {
  /** What the locals called it. */
  name: string;
  /** Its residents' names. */
  residents: string[];
  /** Its lore, as "label: text" lines. */
  tales: string[];
}

export interface WitnessInput extends ChunkContext {
  bible: WorldBible;
  terrain: ChunkTerrain;
  neighbours: NeighbourSummary[];
  /** Set when the chunk is witnessed again after fading into fog. */
  legend?: WitnessLegend | null;
}

/** The old tale of a chunk witnessed anew (never the old program itself). */
export function legendSection(legend: WitnessLegend): string {
  const lines = [
    "## An old tale of this place",
    `This chunk was written once before, as "${legend.name}". Nobody came for a long time and it faded back into fog; only a legend of it is left.`,
    "Write what stands here now: a new place with new residents. It may remember, echo or answer the old tale, but it is not the same place and must not copy it.",
  ];
  if (legend.residents.length > 0) {
    lines.push(`Who lived there then: ${legend.residents.slice(0, 12).join(", ")}.`);
  }
  if (legend.tales.length > 0) {
    lines.push("What was told of it:", ...legend.tales.slice(0, 8).map((tale) => `- ${tale}`));
  }
  return lines.join("\n");
}

export function witnessSections(input: WitnessInput): TurnSection[] {
  const bible = bibleSections(input.bible);
  return [
    { name: "witness:bible-core", order: ORDER.WORLD_RULES, text: bible.core },
    { name: "witness:bible-style", order: ORDER.WORLD_RULES + 1, text: bible.style },
    {
      name: "witness:neighbours",
      order: ORDER.CONTEXT + 10,
      text: neighbourSection(input.coord, input.neighbours),
    },
    { name: "witness:terrain", order: ORDER.CONTEXT + 11, text: terrainSection(input.terrain) },
    {
      name: "witness:authored",
      order: ORDER.CONTEXT + 12,
      text: authoredSection(input.authored ?? []),
    },
    ...(input.legend === undefined || input.legend === null
      ? []
      : [{ name: "witness:legend", order: ORDER.CONTEXT + 13, text: legendSection(input.legend) }]),
    { name: "witness:output", order: ORDER.OUTPUT, text: chunkOutputSection(input.coord) },
  ];
}

export function generateChunk(
  input: WitnessInput,
  io: {
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
    /** Appends the witness a parsed program becomes; a content refusal is repaired (D5). */
    accept?: (program: { source: string; graph: WitnessedDraft }) => Promise<Result<unknown>>;
  } = {},
): Promise<Result<Program<WitnessedDraft>>> {
  const { coord } = input;
  // The world's own style decides what its land is built from (rev 6), not one house style.
  const props = worldPropKinds(input.bible);
  return generateProgram<WitnessedDraft>({
    system: chunkSpec({
      language: input.language,
      coord,
      hole: input.hole,
      props,
      look: bibleLook(input.bible),
    }),
    user:
      input.legend === undefined || input.legend === null
        ? `Someone has just walked onto chunk (${coord.cx}, ${coord.cz}) for the first time. Write what they find there. Output the program only.`
        : `Someone has just walked onto chunk (${coord.cx}, ${coord.cz}), long faded into fog. Write what they find there now. Output the program only.`,
    purpose: "chunk",
    task: "witness",
    language: input.language,
    parse: (source) => parseChunk(source, { ...input, props }),
    sections: witnessSections(input),
    coord,
    maxTokens: WITNESS_MAX_TOKENS,
    temperature: WITNESS_TEMPERATURE,
    ...(io.onDelta === undefined ? {} : { onDelta: io.onDelta }),
    ...(io.signal === undefined ? {} : { signal: io.signal }),
    ...(io.accept === undefined ? {} : { accept: io.accept }),
  });
}
