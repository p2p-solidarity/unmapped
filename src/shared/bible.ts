// The world bible as the player reviews it in Create a game: six parts (premise, tone, rules,
// taboos, naming, voice), each edited or rewritten on its own. A cartridge still stores two text
// files (bible/core.md, bible/style.md): `flattenBible` renders them from the parts at publish,
// deterministically, so the cartridge format and its content-hash rules stay as they were.
//
// One part is rewritten by the model in a tiny line format — `@@<part>`, the text (or one `- item`
// per line for rules and taboos), `@@end` — read and bounded here like the story's @@ protocol.

import { z } from "zod";
import type { WorldBible } from "./cartridge";
import { languageName } from "./language";
import type { ChatMessage } from "./llm";
import { err, ok, type Result } from "./result";

export const BIBLE_PARTS = ["premise", "tone", "rules", "taboos", "naming", "voice"] as const;
export type BiblePart = (typeof BIBLE_PARTS)[number];
export type BibleListPart = "rules" | "taboos";
export type BibleTextPart = Exclude<BiblePart, BibleListPart>;

export interface BibleFields {
  premise: string;
  tone: string;
  rules: string[];
  taboos: string[];
  naming: string;
  voice: string;
}

export const BIBLE_LIMITS = {
  premise: 600,
  tone: 200,
  naming: 300,
  voice: 300,
  /** Characters per rule or taboo. */
  line: 160,
  rules: { min: 3, max: 6 },
  taboos: { min: 2, max: 5 },
} as const;

export function isListPart(part: BiblePart): part is BibleListPart {
  return part === "rules" || part === "taboos";
}

/** Whitespace folded to single spaces, then cut to `max` characters. */
export function clampLine(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : flat.slice(0, max).trimEnd();
}

/** The items of a list part as they will be published: bounded, blanks dropped, at most `max`. */
export function cleanItems(part: BibleListPart, items: readonly string[]): string[] {
  return items
    .map((item) => clampLine(item, BIBLE_LIMITS.line))
    .filter((item) => item !== "")
    .slice(0, BIBLE_LIMITS[part].max);
}

const listSchema = (part: BibleListPart) =>
  z.array(z.string().max(BIBLE_LIMITS.line)).max(BIBLE_LIMITS[part].max);

/** The parts as a draft may hold them: bounded, but possibly half-edited (blank or short). */
export const bibleFieldsSchema = z
  .object({
    premise: z.string().max(BIBLE_LIMITS.premise),
    tone: z.string().max(BIBLE_LIMITS.tone),
    rules: listSchema("rules"),
    taboos: listSchema("taboos"),
    naming: z.string().max(BIBLE_LIMITS.naming),
    voice: z.string().max(BIBLE_LIMITS.voice),
  })
  .strict();

export type BibleProblem = { part: BiblePart; kind: "empty" | "few" };

/** What keeps the parts from being published, in card order; empty when they can be. */
export function bibleProblems(fields: BibleFields): BibleProblem[] {
  return BIBLE_PARTS.flatMap((part): BibleProblem[] => {
    if (isListPart(part)) {
      const count = cleanItems(part, fields[part]).length;
      if (count === 0) return [{ part, kind: "empty" }];
      return count < BIBLE_LIMITS[part].min ? [{ part, kind: "few" }] : [];
    }
    return clampLine(fields[part], BIBLE_LIMITS[part]) === "" ? [{ part, kind: "empty" }] : [];
  });
}

/** The two anchor files, exactly as the Bible program always rendered them. */
export function flattenBible(fields: BibleFields): WorldBible {
  return {
    core: [
      `Premise: ${clampLine(fields.premise, BIBLE_LIMITS.premise)}`,
      `Tone: ${clampLine(fields.tone, BIBLE_LIMITS.tone)}`,
      "Rules:",
      ...cleanItems("rules", fields.rules).map((rule) => `- ${rule}`),
      "Never:",
      ...cleanItems("taboos", fields.taboos).map((taboo) => `- ${taboo}`),
    ].join("\n"),
    style: [
      `Naming: ${clampLine(fields.naming, BIBLE_LIMITS.naming)}`,
      `Voice: ${clampLine(fields.voice, BIBLE_LIMITS.voice)}`,
    ].join("\n"),
  };
}

const PART_ASK: Record<BiblePart, string> = {
  premise: "the PREMISE: two or three sentences on what this land is and why the maps stopped",
  tone: "the TONE: one sentence on how the world feels",
  rules: `the RULES: ${BIBLE_LIMITS.rules.min} to ${BIBLE_LIMITS.rules.max} concrete everyday facts of how this world works`,
  taboos: `the TABOOS: ${BIBLE_LIMITS.taboos.min} to ${BIBLE_LIMITS.taboos.max} things that never appear here`,
  naming: "the NAMING: how places and people are named here, with two examples",
  voice: "the VOICE: how people speak — sentence length, register, habits",
};

export interface BibleCardInput {
  name: string;
  intent: string;
  language: string;
  fights: "none" | "gun" | "blade";
  fields: BibleFields;
  part: BiblePart;
  /** The player's one-line note; empty asks for a fresh take. */
  note: string;
}

function fightingLine(fights: BibleCardInput["fights"]): string {
  return fights === "none"
    ? "Nobody fights in this world."
    : "This world has fights: monsters roam the land and the player is armed. Never make monsters, weapons or fighting a taboo.";
}

/** Asks for exactly one part, with the rest of the bible as the context it must agree with. */
export function bibleCardMessages(input: BibleCardInput): ChatMessage[] {
  const f = input.fields;
  const list = (items: readonly string[]) => items.map((item) => `- ${item}`).join("\n");
  const body = isListPart(input.part)
    ? `- <one ${input.part === "rules" ? "rule" : "taboo"} per line>`
    : "<the text>";
  return [
    {
      role: "system",
      content: `You edit ONE part of the bible of a game world called "${input.name.slice(0, 60)}": ${input.intent.slice(0, 400)}
${fightingLine(input.fights)}
The bible as it stands:
PREMISE: ${f.premise}
TONE: ${f.tone}
RULES:
${list(f.rules)}
TABOOS:
${list(f.taboos)}
NAMING: ${f.naming}
VOICE: ${f.voice}

Rewrite only ${PART_ASK[input.part]}. Follow the player's note, and keep it consistent with every other part. Write it in ${languageName(input.language)}.
Reply ONLY in this format:
@@${input.part}
${body}
@@end`,
    },
    {
      role: "user",
      content:
        input.note.trim() === ""
          ? "No note: write a fresh version."
          : `Player's note: ${input.note.slice(0, 300)}`,
    },
  ];
}

const BULLET = /^(?:[-*•・]|\d{1,2}[.)、．])\s*/;

/**
 * Reads a `@@<part>` reply into a patch of that one part. A missing header, an empty text or too
 * few items is an error the caller sends back; long text is cut, extra items are dropped.
 */
export function parseBibleCard(part: BiblePart, reply: string): Result<Partial<BibleFields>> {
  const lines = reply
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^```/.test(line));
  const header = new RegExp(`^@@\\s*${part}\\b`, "i");
  const start = lines.findIndex((line) => header.test(line));
  const format = `Answer with @@${part}, then ${isListPart(part) ? "one - item per line" : "the text"}, then @@end.`;
  if (start < 0) return err("bible-card-invalid", `The reply has no @@${part} line.`, format);
  const end = lines.findIndex((line, at) => at > start && /^@@/.test(line));
  const body = lines.slice(start + 1, end < 0 ? undefined : end).filter((line) => line !== "");
  if (isListPart(part)) {
    const items = cleanItems(
      part,
      body.map((line) => line.replace(BULLET, "")),
    );
    const { min, max } = BIBLE_LIMITS[part];
    if (items.length < min) {
      return err(
        "bible-card-invalid",
        `Only ${items.length} ${part} were written.`,
        `Write ${min} to ${max}. ${format}`,
      );
    }
    return ok({ [part]: items });
  }
  const text = clampLine(body.join(" "), BIBLE_LIMITS[part]);
  if (text === "") return err("bible-card-invalid", `The ${part} is empty.`, format);
  return ok({ [part]: text });
}
