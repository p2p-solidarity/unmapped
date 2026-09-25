// Small text helpers shared by the three prompt builders. Everything a prompt interpolates is
// bounded here: a 4B local model has to read the whole system prompt on every generation, so the
// covenant, the karma trail and the inventory can never grow it without limit.

import { languageName } from "@shared/language";
import type { Genesis, NarrativeContext } from "@shared/world";
import { clampText, truncate } from "../limits";

export { languageName };

export const ROLE =
  "You are the world-generator of the Babel tower in UNMAPPED. Write ONLY an OpenUI Lang program using the components below: no prose, no markdown, no code fences, no comments. The first line is the root statement.";

/** One "- item" per line, or `empty` when there is nothing to list. */
export function bullets(lines: readonly string[], empty: string): string {
  const clean = lines.map((line) => line.trim()).filter((line) => line !== "");
  return clean.length === 0 ? empty : clean.map((line) => `- ${line}`).join("\n");
}

/** The newest `max` lines, each cut to `width` characters — the prompt budget is finite. */
export function recent(lines: readonly string[], max: number, width: number): string[] {
  const clean = lines.map((line) => clampText(line, width)).filter((line) => line !== "");
  return truncate(clean.slice(-max), max);
}

export function languageRule(genesis: Genesis | NarrativeContext): string {
  return `Write every word the player reads — floor and NPC names, quest text, weaknesses, lines, labels — in ${languageName(genesis.language)}. Ids, event names, archetype words and mesh part names stay ascii snake_case.`;
}

export function covenant(genesis: Genesis | NarrativeContext): string {
  if (!("archetype" in genesis))
    return `Language: ${languageName(genesis.language)}.\nGame premise: ${clampText(genesis.intent, 600)}`;
  return [
    `Archetype: ${genesis.archetype}. Physics: ${genesis.physics}. Language: ${languageName(genesis.language)}. Seed: ${genesis.seed}.`,
    `The covenant the player swore: "${clampText(genesis.intent, 180)}"`,
  ].join("\n");
}

export const section = (title: string, body: string): string => `## ${title}\n${body}`;
