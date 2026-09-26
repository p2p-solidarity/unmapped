// The witnessing prompt for a route whose whole context is small (Apple's on-device model holds
// 4096 tokens, prompt and answer together; the full prompt alone needed 4110). Big models keep
// ./chunk.ts. Here the Chunk spec gives way to the answer's schema (../chunkAnswer.ts), which
// carries the kinds, roles, tiles and counts the spec says in words, and the world is told in its
// short lines: fewer lore lines (the harness's compact assembly), the bible's one-line parts and
// its first rules, and clamped neighbours, names and legend.
//
// The bible's "Never" list is left out. On Apple's model a prompt that lists forbidden things
// (monsters, swords, the end of the world …) beside our own "no heroes" line was refused by its
// input guardrail as unsafe, 4 of 4 times, and 0 of 4 without either. What the list forbids has no
// slot to be written into: the schema offers no monster, weapon or spell, and every word still
// goes through the hygiene checks and the parser.

import type { WorldBible } from "@shared/cartridge";
import type { PropKind } from "@shared/world";
import { clampText } from "../limits";
import { landmarkKinds, PLACE_NAME_RULE } from "./chunk";
import { languageName } from "./shared";

/** One-line parts of the bible kept in a compact prompt, each cut to this many characters. */
const SHORT_LINES: Readonly<Record<string, number>> = {
  Premise: 240,
  Tone: 120,
  Naming: 160,
  Voice: 160,
  Look: 200,
};
const RULES_KEPT = 3;
const RULE_CHARS = 120;

/**
 * The bible's short lines: Premise, Tone, the first rules, Naming, Voice and Look. A bible not
 * written in `Key: value` lines is cut as a whole instead.
 */
export function compactBibleSection(bible: WorldBible): string {
  const kept: string[] = [];
  let list: string | null = null;
  let rules = 0;
  for (const raw of `${bible.core}\n${bible.style}`.split("\n")) {
    const line = raw.trim();
    const item = /^[-*]\s+(.+)$/.exec(line);
    if (item !== null) {
      if (list === "Rules" && rules < RULES_KEPT) {
        rules += 1;
        kept.push(`- ${clampText(item[1] ?? "", RULE_CHARS)}`);
      }
      continue;
    }
    const pair = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (pair === null) continue;
    const [, key = "", value = ""] = pair;
    list = value === "" ? key : null;
    const chars = SHORT_LINES[key];
    if (list === "Rules") kept.push("Rules:");
    else if (chars !== undefined && value !== "") kept.push(`${key}: ${clampText(value, chars)}`);
  }
  const body =
    kept.length > 0
      ? kept.join("\n")
      : `${clampText(bible.core, 480)}\n${clampText(bible.style, 240)}`;
  return `## World bible (fixed; never contradict it)\n${body}`;
}

export interface CompactWitnessContext {
  language: string;
  props: readonly PropKind[];
}

/** The rules of a witness answered under the chunk schema: what the schema cannot say itself. */
export function compactWitnessRules(ctx: CompactWitnessContext): string {
  return [
    "## Witnessing",
    "This place is being seen for the first time. Answer with what stands here, who lives here and what they say, the small custom they keep, and one small errand.",
    `- Every word the player reads, names too, is in ${languageName(ctx.language)}.`,
    `- ${PLACE_NAME_RULE}`,
    "- Everything stands in one part of the place, north-west to south-east. Spread people and things over the parts, on dry land.",
    `- The first prop is the landmark, seen from far away: ${landmarkKinds(ctx.props)}.`,
    "- The custom is a small rule people here keep. When a neighbour keeps one, this one varies it or disputes it: keep one part, change another, never copy it.",
    "- Talk like neighbours: everyday, concrete, quiet details. People may misremember and disagree.",
  ].join("\n");
}
