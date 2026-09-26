// Witnessing (顯影, plan.md §3–§5): the one moment the model writes a chunk of open land. It gets
// the world bible verbatim, the hot lore around the chunk, what the neighbours are called and keep
// as custom, what the ground here already is and the names already in use — and writes residents,
// a landmark, a custom and every resident's words, once. Parse → repair ≤ 2 rounds (Rule 7), a
// refusal of the witness by the world's history about what the program says counting as one (D5);
// failure leaves the chunk unwritten, never a fallback. A chunk that faded back into fog is
// witnessed anew: the model is told the old tale (`witness:legend`, rev 6 phase 3 D13) and writes a
// new place that may answer it.
//
// On a route whose whole context is small and that decodes against a schema (Apple's on-device
// model, 4096 tokens; ./route.ts) the witness is guided: a compact prompt (the bible's short lines,
// fewer lore lines, no Chunk spec) and an answer held to the chunk schema, written back as a Chunk
// program that `parseChunk` checks like any other (@dsl chunkAnswer). Every other route keeps the
// full prompt.
//
// The names a new resident may not take are read again at every check (`io.namesNow`): a chapter
// written while this was (chapter 1 beside the origin at New game) brings people this prompt never
// listed, and a resident who takes one of their names is sent back like any other clash.

import {
  authoredSection,
  bibleSections,
  type ChunkContext,
  chunkAnswerSchema,
  chunkOutputSection,
  chunkSpec,
  compactBibleSection,
  compactWitnessRules,
  type NeighbourSummary,
  namesSection,
  neighbourSection,
  parseChunk,
  partOf,
  repairNote,
  terrainSection,
  type WitnessedDraft,
  writeChunkProgram,
} from "@dsl";
import { ORDER } from "@harness";
import { bibleLook, clampLine, worldPropKinds } from "@shared/bible";
import type { WorldBible } from "@shared/cartridge";
import { type ChunkTerrain, chunkDistance } from "@shared/chunks";
import type { Result } from "@shared/result";
import type { NpcSpec } from "@shared/world";
import { generateProgram, type Program } from "./pipeline";
import { answerRoute, NAMES_SHOWN, namesChecked } from "./route";
import type { TurnSection } from "./turn";

export const WITNESS_MAX_TOKENS = 3200;
export const WITNESS_TEMPERATURE = 0.9;
/**
 * A guided answer (≤ 3 residents, ≤ 8 props) measured 513–813 tokens on Apple's model; this much
 * lets the longest one finish, the prompt (≈ 2,200 with its schema) leaves room for it, and an
 * answer that loops stops here instead of spending the whole context.
 */
export const GUIDED_MAX_TOKENS = 1500;
export const GUIDED_MIN_TOKENS = 1100;

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
export function legendSection(legend: WitnessLegend, compact = false): string {
  const cap = compact ? { residents: 6, tales: 3 } : { residents: 12, tales: 8 };
  const lines = [
    "## An old tale of this place",
    `This place was written once before, as "${legend.name}". Nobody came for a long time and it faded back into fog; only a legend of it is left.`,
    "Write what stands here now: a new place with new residents. It may remember, echo or answer the old tale, but it is not the same place and must not copy it.",
  ];
  if (legend.residents.length > 0) {
    lines.push(`Who lived there then: ${legend.residents.slice(0, cap.residents).join(", ")}.`);
  }
  if (legend.tales.length > 0) {
    const tales = legend.tales.slice(0, cap.tales);
    lines.push(
      "What was told of it:",
      ...tales.map((tale) => `- ${compact ? clampLine(tale, 140) : tale}`),
    );
  }
  return lines.join("\n");
}

/** The places within two chunks, by name: this place is another one and takes none of them. */
function placesNearby(input: WitnessInput): string[] {
  const named = input.lore
    .filter((node) => node.kind === "place")
    .map((node) => ({ label: node.label, away: chunkDistance(node.coord, input.coord) }))
    .filter((place) => place.away > 0 && place.away <= 2)
    .sort((a, b) => a.away - b.away)
    .map((place) => place.label);
  return [...new Set([...input.neighbours.map((one) => one.name), ...named])].slice(0, 8);
}

/** Origin chunk, guided: the authored residents, whose words go under the answer's `village`. */
function villageSection(npcs: readonly NpcSpec[]): string {
  if (npcs.length === 0) return "";
  const lines = npcs.map((npc) => `- ${npc.id}: ${npc.name}, ${npc.role}, ${npc.mood}`);
  return `## Residents of the authored village\nThey already live here; "village" holds what each of them says.\n${lines.join("\n")}`;
}

function legendOf(input: WitnessInput, compact: boolean): TurnSection[] {
  if (input.legend === undefined || input.legend === null) return [];
  const text = legendSection(input.legend, compact);
  return [{ name: "witness:legend", order: ORDER.CONTEXT + 13, text }];
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
    ...legendOf(input, false),
    {
      name: "witness:names",
      order: ORDER.CONTEXT + 14,
      text: namesSection(input.names ?? [], placesNearby(input)),
    },
    { name: "witness:output", order: ORDER.OUTPUT, text: chunkOutputSection() },
  ];
}

/** The compact sections of a guided witness: every one of them bounded for a 4K context. */
export function guidedSections(input: WitnessInput): TurnSection[] {
  return [
    { name: "witness:bible", order: ORDER.WORLD_RULES, text: compactBibleSection(input.bible) },
    {
      name: "witness:neighbours",
      order: ORDER.CONTEXT + 10,
      text: neighbourSection(input.coord, input.neighbours.slice(0, 4), 90),
    },
    {
      name: "witness:terrain",
      order: ORDER.CONTEXT + 11,
      text: terrainSection(input.terrain, (x, z) => `the ${partOf(x, z, input.hole)} part`, false),
    },
    {
      name: "witness:authored",
      order: ORDER.CONTEXT + 12,
      text: villageSection(input.authored ?? []),
    },
    ...legendOf(input, true),
    {
      name: "witness:names",
      order: ORDER.CONTEXT + 14,
      text: namesSection(input.names ?? [], placesNearby(input)),
    },
  ];
}

export function generateChunk(
  input: WitnessInput,
  io: {
    signal?: AbortSignal;
    onDelta?: (text: string) => void;
    /** Appends the witness a parsed program becomes; a content refusal is repaired (D5). */
    accept?: (program: { source: string; graph: WitnessedDraft }) => Promise<Result<unknown>>;
    /** The names in use as they stand at each check, nearest first (see the header). */
    namesNow?: () => readonly string[];
  } = {},
): Promise<Result<Program<WitnessedDraft>>> {
  const { coord } = input;
  const route = answerRoute();
  // The world's own style decides what its land is built from (rev 6), not one house style.
  const props = worldPropKinds(input.bible);
  // The neighbours' residents and the story's people, nearest first (ChunkContext.names).
  const names = (input.names ?? []).slice(0, NAMES_SHOWN[route]);
  const context = { ...input, props, names };
  const faded = input.legend !== undefined && input.legend !== null;
  const common = {
    purpose: "chunk",
    task: "witness",
    language: input.language,
    parse: (source: string) =>
      parseChunk(source, { ...context, names: namesChecked(names, io.namesNow, route) }),
    coord,
    temperature: WITNESS_TEMPERATURE,
    ...(io.signal === undefined ? {} : { signal: io.signal }),
    ...(io.accept === undefined ? {} : { accept: io.accept }),
  } as const;

  if (route === "guided") {
    const answer = {
      language: input.language,
      props,
      hole: input.hole,
      authored: input.authored ?? [],
      customs: input.lore
        .filter((node) => node.kind === "custom" && chunkDistance(node.coord, coord) === 1)
        .map((node) => node.id),
      places: placesNearby(input),
      names,
    };
    const { onDelta } = io;
    return generateProgram<WitnessedDraft>({
      ...common,
      system: compactWitnessRules({ language: input.language, props }),
      user: faded
        ? "Someone has just walked onto this place, long faded into fog. Answer with what they find there now."
        : "Someone has just walked onto this place for the first time. Answer with what they find there.",
      sections: guidedSections(context),
      schema: chunkAnswerSchema(answer),
      // The answer streams as JSON that is not a program yet: what viewers are shown is the
      // program each round writes, once it is written.
      write: (raw) => {
        const written = writeChunkProgram(raw, answer);
        if (written.ok) onDelta?.(written.value);
        return written;
      },
      brief: repairNote,
      compact: true,
      maxTokens: GUIDED_MAX_TOKENS,
      minTokens: GUIDED_MIN_TOKENS,
    });
  }

  return generateProgram<WitnessedDraft>({
    ...common,
    system: chunkSpec({
      language: input.language,
      coord,
      hole: input.hole,
      props,
      look: bibleLook(input.bible),
    }),
    user: faded
      ? "Someone has just walked onto this place, long faded into fog. Write what they find there now. Output the program only."
      : "Someone has just walked onto this place for the first time. Write what they find there. Output the program only.",
    sections: witnessSections(context),
    maxTokens: WITNESS_MAX_TOKENS,
    ...(io.onDelta === undefined ? {} : { onDelta: io.onDelta }),
  });
}
