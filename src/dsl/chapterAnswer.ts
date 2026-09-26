// A story chapter answered under guided generation (Apple's on-device model, whose whole context is
// 4096 tokens). The Chapter spec, its rules and its example do not fit beside the world and a
// repair that quotes the rejected program, and the small model wrote actions ("look", "pass") and
// roles ("農夫") the dialect does not have. So the model fills one JSON object that the decoder
// holds to `chapterAnswerSchema` — roles, moods, actions, monster kinds, levels and counts are the
// shared vocabulary's (@shared/world, WITNESS_ACTIONS), not words in the prompt — and
// `writeChapterProgram` writes it back as a Chapter program that `parseChapter` then checks like
// any program a model wrote as text (Rule 7): the parser stays the source of truth.
//
// A climb or a maze is not a Chapter program but a Place (./prompts/place.ts), so this is the land
// chapter only. Only ids, statement names, references and the colour from a hue are the writer's;
// every word is the model's. An answer hands nothing over (`gives` is written []): what a chapter
// gives is in its finds. An array that may be empty (`gives`, at most one) failed Apple's guided
// generation outright (LanguageModelError -1) every time it was in the schema, 7 of 7, and failed
// the witness being written beside it too; without it the same schema answered.

import { languageName } from "@shared/language";
import { ok, type Result } from "@shared/result";
import { MONSTER_KINDS, MOODS, NPC_ROLES } from "@shared/world";
import { z } from "zod";
import { clothes, quoted, readAnswer, uniqueId } from "./answer";
import { CHAPTER_PARTS } from "./parse/chapter";
import { WITNESS_ACTIONS } from "./parse/chunk";
import type { DslError } from "./types";

/** What a guided answer may hold: inside what the parser allows, small enough to finish in 4K. */
export const CHAPTER_ANSWER_LIMITS = {
  people: CHAPTER_PARTS.npcs,
  finds: CHAPTER_PARTS.treasures,
  foes: { min: CHAPTER_PARTS.monsters.min, max: 4 },
  answers: { min: 1, max: 2 },
  loot: { min: 1, max: 2 },
  level: { min: 1, max: 8 },
} as const;

export interface ChapterAnswerContext {
  language: string;
  /** False when the game declares no combat: the answer then has no slot for a foe at all. */
  combat: boolean;
  /** Names already in use, nearest first; the first few are said where a person's name goes. */
  names?: readonly string[];
}

/** Names repeated beside the person's name in the schema (the prompt's names section has more). */
const NAMES_IN_SCHEMA = 8;

/**
 * A word the parser needs to be there (the place, the goal, a person's name and line, an answer's
 * label): an empty one would be dropped or refused on every try, so it is refused here, as a
 * repair round that says which. Others may be empty; the parser handles those.
 */
const said = (what: string) => z.string().trim().min(1).describe(what);
const plain = () => z.string().trim();

/**
 * The answer's shape. Descriptions are kept only where they carry a rule: on a 4K context every
 * word of the schema is a word the answer cannot use.
 */
function answerShape(ctx: ChapterAnswerContext) {
  const lang = languageName(ctx.language);
  const taken = (ctx.names ?? []).slice(0, NAMES_IN_SCHEMA);
  const person = z.object({
    name: said(
      `a first name or nickname${taken.length === 0 ? "" : ` of their own, not ${taken.join(", ")}`}`,
    ),
    role: z.enum(NPC_ROLES),
    mood: z.enum(MOODS),
    hue: z.int().min(0).max(359),
    line: said("what they say when the player walks up"),
    answers: z
      .array(
        z.object({
          label: said("what the player says back, in plain words"),
          action: z.enum(WITNESS_ACTIONS),
          effect: plain().describe("what they do or say then"),
        }),
      )
      .min(CHAPTER_ANSWER_LIMITS.answers.min)
      .max(CHAPTER_ANSWER_LIMITS.answers.max),
  });
  const foe = z.object({
    kind: z.enum(MONSTER_KINDS),
    level: z.int().min(CHAPTER_ANSWER_LIMITS.level.min).max(CHAPTER_ANSWER_LIMITS.level.max),
    weakness: plain().describe("what defeats it"),
  });
  return z.object({
    name: said(
      `what the locals call the place, a word or two in ${lang}; never a coordinate or id`,
    ),
    goal: said("one sentence: what the player does here"),
    people: z
      .array(person)
      .min(CHAPTER_ANSWER_LIMITS.people.min)
      .max(CHAPTER_ANSWER_LIMITS.people.max),
    finds: z
      .array(
        z.object({
          loot: z
            .array(plain())
            .min(CHAPTER_ANSWER_LIMITS.loot.min)
            .max(CHAPTER_ANSWER_LIMITS.loot.max),
        }),
      )
      .min(CHAPTER_ANSWER_LIMITS.finds.min)
      .max(CHAPTER_ANSWER_LIMITS.finds.max)
      .describe("what is found here: the thing sought, a clue, what is earned"),
    ...(ctx.combat
      ? {
          foes: z
            .array(foe)
            .min(CHAPTER_ANSWER_LIMITS.foes.min)
            .max(CHAPTER_ANSWER_LIMITS.foes.max)
            .describe("what stands in the way"),
        }
      : {}),
  });
}

type ChapterAnswer = z.infer<ReturnType<typeof answerShape>>;
type Foe = { kind: string; level: number; weakness: string };

/** The JSON Schema the decoder holds the answer to (properties in the order they are written). */
export function chapterAnswerSchema(ctx: ChapterAnswerContext): Record<string, unknown> {
  const { $schema: _, ...schema } = z.toJSONSchema(answerShape(ctx)) as Record<string, unknown>;
  return schema;
}

/** The answer as a Chapter program, or why it cannot be one (a repair round, like a parse error). */
export function writeChapterProgram(
  raw: string,
  ctx: ChapterAnswerContext,
): Result<string, DslError> {
  const parsed = readAnswer(raw, answerShape(ctx));
  return parsed.ok ? ok(writeAnswer(parsed.value, ctx)) : parsed;
}

function writeAnswer(answer: ChapterAnswer, ctx: ChapterAnswerContext): string {
  const lines: string[] = [];
  const children: string[] = [];
  const add = (name: string, text: string): void => {
    lines.push(`${name} = ${text}`);
    children.push(name);
  };
  const list = (values: readonly string[]): string => `[${values.map(quoted).join(", ")}]`;
  // One id scope for the whole program, as the parser keeps it: finds and foes first, so a person
  // whose name happens to be "find_1" gets an id of their own.
  const taken = new Set<string>();
  const findIds = answer.finds.map((_, index) => uniqueId(`find_${index + 1}`, "find", taken));
  // Only a game with combat has foes; an answer that carried some anyway was stripped by the schema.
  const foes: readonly Foe[] = ctx.combat ? ((answer as { foes?: Foe[] }).foes ?? []) : [];
  const foeIds = foes.map((_, index) => uniqueId(`foe_${index + 1}`, "foe", taken));

  let choices = 0;
  answer.people.forEach((person, index) => {
    const id = uniqueId(person.name, `person_${index + 1}`, taken);
    add(
      `npc${index + 1}`,
      `NPC(${quoted(id)}, ${quoted(person.name)}, ${quoted(person.role)}, ${quoted(person.mood)}, ${quoted(clothes(person.hue))})`,
    );
    const refs = person.answers.map((choice) => {
      choices += 1;
      const ref = `choice${choices}`;
      lines.push(
        `${ref} = Choice(${quoted(choice.label)}, ${quoted(choice.action)}, ${quoted(choice.effect)}, [])`,
      );
      return ref;
    });
    add(`talk${index + 1}`, `Talk(${quoted(id)}, ${quoted(person.line)}, [${refs.join(", ")}])`);
  });
  answer.finds.forEach((find, index) => {
    add(`find${index + 1}`, `Treasure(${quoted(findIds[index] ?? "")}, ${list(find.loot)})`);
  });
  foes.forEach((foe, index) => {
    add(
      `foe${index + 1}`,
      `Monster(${quoted(foeIds[index] ?? "")}, ${quoted(foe.kind)}, ${foe.level}, ${quoted(foe.weakness)})`,
    );
  });
  return [
    `root = Chapter(${quoted(answer.name)}, ${quoted(answer.goal)}, [${children.join(", ")}])`,
    ...lines,
  ].join("\n");
}
