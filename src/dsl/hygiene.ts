// Prose hygiene for witnessed chunks (after Zero's hygiene pass): the land must sound like people
// living somewhere, not like an assistant or a fortune cookie, and it must not re-declare what the
// world already remembers — nor call a place by a coordinate, nor give a new resident the name of
// someone who already lives nearby or in the story. Every hit is a repair-round complaint, never a silent rewrite. (A Lore
// that merely re-declares a known name is folded into the known node by the parser before this
// runs; only a place named like an existing one still reaches the check below.)

import type { OpenUIError } from "@openuidev/lang-core";
import { slipsIntoSimplified } from "@shared/language";
import type { LoreNode } from "@shared/lore";
import type { DialogueGraph, NpcSpec } from "@shared/world";
import { propError } from "./parse/program";

const ASSISTANT =
  /\b(as an ai|language model|i'?m here to help|how (can|may) i (help|assist)|feel free to|happy to help)\b|作為(一個)?(ai|人工智慧|語言模型|助手)|我(可以|能|很樂意)(為|幫)(您|你)|有什麼(可以|能|需要)(幫|為|協助)|請隨時|お手伝い(します|できます)|aiとして/i;

const VAGUE =
  /\b(mysterious (power|force|energy)|ancient secrets?|untold secrets?|fabric of (reality|fate)|beyond (words|comprehension))\b|神秘的?力量|古老的秘密|不可言說|難以言喻|命運的齒輪|神秘的氣息|未知的力量|古の秘密|神秘の力/i;

const CJK = /[぀-ヿ㐀-鿿]/;

/**
 * A place named like the prompt's own bookkeeping: "Chunk 2,0", "(2, 0)", "區塊", or an id such as
 * "old_well". The model echoed the prompt's "chunk (2, 0)" as a name before the prompt stopped
 * saying it; this keeps it from coming back.
 */
const BOOKKEEPING_NAME =
  /\bchunks?\b|區塊|区块|チャンク|-?\d+\s*[,，、]\s*-?\d+|^[a-z0-9]+(?:_[a-z0-9]+)+$/i;

export interface HygieneInput {
  name: string;
  npcs: readonly NpcSpec[];
  dialogues: readonly DialogueGraph[];
  lore: readonly LoreNode[];
}

function texts(input: HygieneInput): { where: string; text: string }[] {
  const out = [{ where: "Chunk name", text: input.name }];
  for (const npc of input.npcs) out.push({ where: `NPC ${npc.id}`, text: npc.name });
  for (const dialogue of input.dialogues) {
    out.push({ where: `Talk ${dialogue.npcId}`, text: dialogue.line });
    for (const choice of dialogue.choices) {
      out.push({ where: `Choice of ${dialogue.npcId}`, text: `${choice.label} ${choice.effect}` });
    }
  }
  for (const node of input.lore)
    out.push({ where: `Lore ${node.id}`, text: `${node.label} ${node.text}` });
  return out;
}

export function hygieneIssues(
  input: HygieneInput,
  ctx: { lore: readonly LoreNode[]; language: string; names?: readonly string[] },
): OpenUIError[] {
  const issues: OpenUIError[] = [];
  if (BOOKKEEPING_NAME.test(input.name.trim())) {
    issues.push(
      propError(
        "Chunk",
        `"${input.name}" is not a name anyone would call a place.`,
        'Name it the way the locals do: a word or two for what stands or happens there. Never a coordinate, "chunk" or an id.',
      ),
    );
  }
  const taken = new Set((ctx.names ?? []).map((name) => name.trim().toLowerCase()));
  for (const npc of input.npcs) {
    if (!taken.has(npc.name.trim().toLowerCase())) continue;
    issues.push(
      propError(
        "NPC",
        `${npc.id} is called "${npc.name}", like someone who already lives nearby or in the story.`,
        "Give every new resident a name nobody nearby has.",
      ),
    );
  }
  const simplified = texts(input).find(({ text }) => slipsIntoSimplified(ctx.language, text));
  if (simplified !== undefined) {
    issues.push(
      propError(
        "Chunk",
        `${simplified.where} is written in Simplified Chinese; this world is ${ctx.language}.`,
        "Rewrite every player-facing word with Traditional Chinese characters (們 這 說 時 個 來 …).",
      ),
    );
  }
  for (const { where, text } of texts(input)) {
    if (ASSISTANT.test(text)) {
      issues.push(
        propError(
          "Chunk",
          `${where} sounds like an assistant talking to a user.`,
          "People here are villagers, not helpers. Rewrite it as something they would actually say.",
        ),
      );
    }
    if (VAGUE.test(text)) {
      issues.push(
        propError(
          "Chunk",
          `${where} leans on vague mystery ("${text.slice(0, 40)}").`,
          "Replace it with a concrete, everyday detail of this place.",
        ),
      );
    }
  }
  const known = new Set(ctx.lore.map((node) => node.label.trim().toLowerCase()));
  for (const node of input.lore) {
    if (!known.has(node.label.trim().toLowerCase())) continue;
    issues.push(
      node.kind === "place"
        ? propError(
            "Chunk",
            `"${node.label}" is already the name of another place.`,
            "This is a different place: give it a name of its own.",
          )
        : propError(
            "Lore",
            `"${node.label}" is already the name of something the world remembers.`,
            "Link to the existing node instead of declaring it again, or give this one its own name.",
          ),
    );
  }
  if (/^(zh|ja)\b/i.test(ctx.language) && !CJK.test(input.name)) {
    issues.push(
      propError(
        "Chunk",
        `The place name "${input.name}" is not written in the player's language (${ctx.language}).`,
        "Write every player-facing word in that language.",
      ),
    );
  }
  return issues;
}
