// Witnessing (顯影, plan.md §3–§5): the one moment the model writes a chunk of open land. It gets
// the world bible verbatim, the hot lore around the chunk, what the neighbours are called and keep
// as custom, and what the ground here already is — and writes residents, a landmark, a custom and
// every resident's words, once. Parse → repair ≤ 2 rounds (Rule 7); failure leaves the chunk
// unwritten, never a fallback.

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

export interface WitnessInput extends ChunkContext {
  bible: WorldBible;
  terrain: ChunkTerrain;
  neighbours: NeighbourSummary[];
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
    { name: "witness:output", order: ORDER.OUTPUT, text: chunkOutputSection(input.coord) },
  ];
}

export function generateChunk(
  input: WitnessInput,
  io: { signal?: AbortSignal; onDelta?: (text: string) => void } = {},
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
    user: `Someone has just walked onto chunk (${coord.cx}, ${coord.cz}) for the first time. Write what they find there. Output the program only.`,
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
  });
}
