// A witness answered under guided generation (Apple's on-device model, whose whole context is
// 4096 tokens). The Chunk spec, its rules and its example do not fit beside the world, so the
// model fills one JSON object that the decoder holds to `chunkAnswerSchema` — kinds, roles, moods,
// actions, tiles and counts are the schema's, not words in the prompt — and `writeChunkProgram`
// writes it back as a Chunk program. That program is then parsed and checked by `parseChunk` like
// any program a model wrote as text (Rule 7): the parser stays the source of truth.
//
// Only ids, statement names, references and links are the writer's; every word is the model's.
// The answer is untrusted: it is checked with the same zod schema the JSON Schema is made from,
// and one that does not fit is a repairable DslError, never a guess.

import type { ChunkHole } from "@shared/chunks";
import { languageName } from "@shared/language";
import { ok, type Result } from "@shared/result";
import { MOODS, NPC_ROLES, type NpcSpec, type PropKind } from "@shared/world";
import { z } from "zod";
import { clothes, readAnswer, quoted as str, uniqueId } from "./answer";
import { CHUNK_LIMITS, WITNESS_ACTIONS } from "./parse/chunk";
import { slugId } from "./parse/ids";
import type { DslError } from "./types";

/** What a guided answer may hold: smaller than the parser allows, so the answer always finishes. */
export const CHUNK_ANSWER_LIMITS = {
  props: { min: 3, max: 8 },
  residents: { min: CHUNK_LIMITS.minNpcs, max: 3 },
  answers: { min: 1, max: 2 },
} as const;

/** The keepsake's look: the charm-like parts of the mesh vocabulary (as the full prompt lists). */
const KEEPSAKE_LOOKS = [
  "charm_bell",
  "charm_feather",
  "vial_round",
  "lantern_paper",
  "shaft_bamboo",
  "shell_round",
] as const;
const KEEPSAKE_KINDS = ["charm", "tool", "consumable"] as const;
const LAST_TILE = 31;

export interface ChunkAnswerContext {
  language: string;
  /** The prop kinds this world is built from. */
  props: readonly PropKind[];
  hole: ChunkHole | null;
  /** Origin chunk only: the authored village's residents, who get words but no new NPC. */
  authored: readonly NpcSpec[];
  /** Lore ids of customs kept on the neighbouring chunks; this place's custom grows from one. */
  customs: readonly string[];
  /** Names of the places nearby, which this one may not take (said where the name is written). */
  places?: readonly string[];
  /**
   * Names already in use nearby and in the story, nearest first; the first few are said where a
   * resident's name is written. Listed only in the prompt, Apple's model copied them: chapter 1's
   * 建國 came back at (1,0) in two rounds, and a neighbour's 立國 in two at (2,0).
   */
  names?: readonly string[];
}

type TileRange = { min: number; max: number };

/**
 * The tiles things may stand on. Next to the authored village everything stands east of it (or
 * south, when it is wider than deep), so nothing the answer can say lands inside it.
 */
export function answerTiles(hole: ChunkHole | null): { x: TileRange; z: TileRange } {
  const from = (min: number): TileRange => ({ min: Math.min(min, LAST_TILE), max: LAST_TILE });
  if (hole === null) return { x: from(0), z: from(0) };
  return hole.width <= hole.depth
    ? { x: from(hole.width), z: from(0) }
    : { x: from(0), z: from(hole.depth) };
}

/**
 * Where a thing stands, as the part of the place it is in. Asked for tiles, the on-device model put
 * every resident on tiles 0–1 of a 32-tile place; asked for a part, it spreads them, and the writer
 * turns each part into a tile of it.
 */
export const PLACE_PARTS = [
  "north-west",
  "north",
  "north-east",
  "west",
  "middle",
  "east",
  "south-west",
  "south",
  "south-east",
] as const;
type PlacePart = (typeof PLACE_PARTS)[number];

/** The part of the place a tile lies in, as the answer names parts (for the ground's words). */
export function partOf(x: number, z: number, hole: ChunkHole | null): PlacePart {
  const range = answerTiles(hole);
  const third = (value: number, r: TileRange) =>
    Math.min(2, Math.max(0, Math.floor(((value - r.min) * 3) / (r.max - r.min + 1))));
  return PLACE_PARTS[third(z, range.z) * 3 + third(x, range.x)] ?? "middle";
}

/** Steps from a part's centre for the 1st, 2nd … thing in it, so no two share a tile. */
const AROUND: readonly (readonly [number, number])[] = [
  [0, 0],
  [2, 1],
  [-2, -1],
  [1, -2],
  [-1, 2],
  [3, -1],
  [-3, 1],
  [2, 3],
  [-2, -3],
  [4, 2],
  [-4, -2],
  [0, 4],
  [0, -4],
];

/** The tile the `n`th thing in `part` stands on: deterministic, inside `range`. */
function partTile(part: PlacePart, n: number, range: { x: TileRange; z: TileRange }) {
  const column = part.endsWith("west") ? 0 : part.endsWith("east") ? 2 : 1;
  const row = part.startsWith("north") ? 0 : part.startsWith("south") ? 2 : 1;
  const centre = (r: TileRange, third: number) =>
    Math.round(r.min + ((r.max - r.min) * (2 * third + 1)) / 6);
  const [dx, dz] = AROUND[n % AROUND.length] ?? [0, 0];
  const inside = (value: number, r: TileRange) => Math.min(r.max, Math.max(r.min, value));
  return {
    x: inside(centre(range.x, column) + dx, range.x),
    z: inside(centre(range.z, row) + dz, range.z),
  };
}

// Words are not held to a length here: an empty one is the parser's to refuse, where it matters
// (a place with no name, an answer with no label), as it would be in a program written as text.
const words = (what: string) => z.string().trim().describe(what);
const plain = () => z.string().trim();

/**
 * The answer's shape. Descriptions are kept only where they carry a rule: on a 4K context every
 * word of the schema is a word the answer cannot use.
 */
function answerShape(ctx: ChunkAnswerContext) {
  const at = z.enum(PLACE_PARTS);
  const lang = languageName(ctx.language);
  const talk = {
    line: plain(),
    answers: z
      .array(
        z.object({
          label: words("what the player says back, in plain words"),
          action: z.enum(WITNESS_ACTIONS),
          effect: words("what they do or say then"),
        }),
      )
      .min(CHUNK_ANSWER_LIMITS.answers.min)
      .max(CHUNK_ANSWER_LIMITS.answers.max),
  };
  const village = Object.fromEntries(
    ctx.authored.map((npc) => [npc.id, z.object(talk).describe(`what ${npc.name} says`)]),
  );
  const custom = { label: words("its short name, in plain words"), text: plain() };
  const nearby = (ctx.places ?? []).slice(0, 6);
  const taken = nearby.length === 0 ? "" : `a new name, not ${nearby.join(" or ")}; `;
  const people = (ctx.names ?? []).slice(0, 8);
  return z.object({
    name: words(
      `what the locals call this place: a real name of a word or two, in ${lang}; ${taken}never a coordinate, "chunk" or an id`,
    ),
    place: words("one sentence on what is here"),
    tone: z.number().min(-1).max(1),
    props: z
      .array(z.object({ kind: z.enum(ctx.props as [PropKind, ...PropKind[]]), part: at }))
      .min(CHUNK_ANSWER_LIMITS.props.min)
      .max(CHUNK_ANSWER_LIMITS.props.max)
      .describe("the first is the landmark, tall enough to see from far away"),
    residents: z
      .array(
        z.object({
          name: words(
            `a first name or nickname nobody nearby has${people.length === 0 ? "" : `, not ${people.join(", ")}`}`,
          ),
          role: z.enum(NPC_ROLES),
          mood: z.enum(MOODS),
          hue: z.int().min(0).max(359),
          part: at,
          ...talk,
        }),
      )
      .min(CHUNK_ANSWER_LIMITS.residents.min)
      .max(CHUNK_ANSWER_LIMITS.residents.max),
    ...(ctx.authored.length === 0 ? {} : { village: z.object(village) }),
    custom: z.object(
      ctx.customs.length === 0
        ? custom
        : {
            ...custom,
            grows_from: z
              .enum(ctx.customs as [string, ...string[]])
              .describe("the neighbouring custom it varies or disputes"),
          },
    ),
    errand: z.object({
      ask: words("the first resident asks the player to find something they lost here"),
      part: at.describe("where it was lost"),
      thanks: plain(),
      keepsake: words("the everyday thing they give in thanks, in plain words"),
      kind: z.enum(KEEPSAKE_KINDS),
      power: z.int().min(0).max(10),
      perk: words("what it is good for"),
      look: z.enum(KEEPSAKE_LOOKS),
      flavor: plain(),
    }),
  });
}

type ChunkAnswer = z.infer<ReturnType<typeof answerShape>>;
type Words = Pick<ChunkAnswer["residents"][number], "line" | "answers">;

/** The JSON Schema the decoder holds the answer to (properties in the order they are written). */
export function chunkAnswerSchema(ctx: ChunkAnswerContext): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(answerShape(ctx)) as Record<string, unknown>;
  return schema;
}

/** The answer as a Chunk program, or why it cannot be one (a repair round, like a parse error). */
export function writeChunkProgram(raw: string, ctx: ChunkAnswerContext): Result<string, DslError> {
  const parsed = readAnswer(raw, answerShape(ctx));
  return parsed.ok ? ok(writeAnswer(parsed.value, ctx)) : parsed;
}

function writeAnswer(answer: ChunkAnswer, ctx: ChunkAnswerContext): string {
  const lines: string[] = [];
  const children: string[] = [];
  const add = (name: string, text: string): void => {
    lines.push(`${name} = ${text}`);
    children.push(name);
  };
  let choices = 0;
  const talk = (name: string, npcId: string, words: Words): void => {
    const refs = words.answers.map((choice) => {
      choices += 1;
      const ref = `choice${choices}`;
      lines.push(
        `${ref} = Choice(${str(choice.label)}, ${str(choice.action)}, ${str(choice.effect)}, [])`,
      );
      return ref;
    });
    add(name, `Talk(${str(npcId)}, ${str(words.line)}, [${refs.join(", ")}])`);
  };

  const range = answerTiles(ctx.hole);
  const placed = new Map<PlacePart, number>();
  const tile = (part: PlacePart): string => {
    const n = placed.get(part) ?? 0;
    placed.set(part, n + 1);
    const at = partTile(part, n, range);
    return `${at.x}, ${at.z}`;
  };
  answer.props.forEach((prop, index) => {
    add(`prop${index + 1}`, `Prop(${str(prop.kind)}, ${tile(prop.part)})`);
  });
  const ids = new Set(ctx.authored.map((npc) => npc.id));
  const residents = answer.residents.map((resident, index) => ({
    ...resident,
    id: uniqueId(resident.name, `resident_${index + 1}`, ids),
  }));
  residents.forEach((resident, index) => {
    add(
      `npc${index + 1}`,
      `NPC(${str(resident.id)}, ${str(resident.name)}, ${tile(resident.part)}, ${str(resident.role)}, ${str(resident.mood)}, ${str(clothes(resident.hue))})`,
    );
    talk(`talk${index + 1}`, resident.id, resident);
  });
  const village = (answer as { village?: Record<string, Words> }).village ?? {};
  ctx.authored.forEach((npc, index) => {
    const words = village[npc.id];
    if (words !== undefined) talk(`village${index + 1}`, npc.id, words);
  });

  const tone = answer.tone.toFixed(2);
  const placeId = slugId(answer.name, "place");
  const customSlug = slugId(answer.custom.label, "custom");
  const customId = customSlug === placeId ? `${customSlug}_custom` : customSlug;
  const grows = "grows_from" in answer.custom ? [answer.custom.grows_from] : [];
  const links = [placeId, ...grows].map(str).join(", ");
  add(
    "place",
    `Lore(${str(placeId)}, "place", ${str(answer.name)}, ${str(answer.place)}, [], ${tone})`,
  );
  add(
    "custom",
    `Lore(${str(customId)}, "custom", ${str(answer.custom.label)}, ${str(answer.custom.text)}, [${links}], ${tone})`,
  );

  const errand = answer.errand;
  const giver = residents[0]?.id ?? ctx.authored[0]?.id ?? "";
  add(
    "errand",
    `Find("lost_thing", ${str(giver)}, ${str(errand.ask)}, ${tile(errand.part)}, "keepsake", ${str(errand.thanks)})`,
  );
  add(
    "keepsake",
    `Item("keepsake", ${str(errand.keepsake)}, ${str(errand.kind)}, ${errand.power}, ${str(errand.perk)}, null, [${str(errand.look)}], [], ${str(errand.flavor)})`,
  );

  return [`root = Chunk(${str(answer.name)}, [${children.join(", ")}])`, ...lines].join("\n");
}
