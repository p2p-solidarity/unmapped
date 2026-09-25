// System prompt for one NPC turn. The persona is assembled from the NPC the player walked up to
// plus the floor they are both standing on.

import type { NpcSpec, SceneGraph } from "@shared/world";
import { dialogueLibrary } from "../libraries";
import { LIMITS } from "../limits";
import type { DialoguePromptContext } from "../types";
import { bullets, covenant, languageRule, ROLE, section } from "./shared";

export const EXAMPLE_DIALOGUE = `root = Dialogue("mira_elder", "You smell of the lower stair. Sit before you fall.", [c1, c2, c3], shift)
c1 = Choice("Ask about the goat", "talk", "Mira points at the broken fence.", [])
c2 = Choice("Offer barley for a lantern", "trade", "Mira trades a paper lantern for the barley.", ["paper lantern"])
c3 = Choice("Leave her to her work", "leave", "Mira nods and turns back to the fence.", [])
shift = Mutation("#d9b06a", 0.06, null)`;

/** What the traveller can see of this NPC before a word is said. */
function lookLine(npc: NpcSpec): string {
  const parts = [`a ${npc.body} build in ${npc.color}`];
  if (npc.hat !== "none") parts.push(`a ${npc.hat} on your head`);
  if (npc.held !== "none") parts.push(`a ${npc.held} in your hands`);
  return `They see ${parts.join(", ")}, with ${npc.accent} trim. What you wear and hold is yours to use — the ${npc.held === "none" ? "work of your hands" : npc.held} can end up in the conversation — but never describe yourself like a list.`;
}

function sceneSummary(scene: SceneGraph): string {
  const lines = [
    `Floor: "${scene.name}" — biome ${scene.biome}, ground ${scene.floor.tile}, ${scene.floor.width}x${scene.floor.depth} tiles.`,
  ];
  if (scene.npcs.length > 0) {
    lines.push(
      `Others here: ${scene.npcs.map((npc) => `${npc.name} (${npc.role}, ${npc.mood})`).join(", ")}.`,
    );
  }
  if (scene.monsters.length > 0) {
    lines.push(
      `Dangers: ${scene.monsters.map((m) => `${m.kind} lv${m.level} (weakness: ${m.weakness})`).join(", ")}.`,
    );
  }
  if (scene.treasures.length > 0) {
    lines.push(`Loot lying around: ${scene.treasures.flatMap((t) => t.loot).join(", ")}.`);
  }
  if (scene.quests.length > 0) {
    lines.push(`Open business: ${scene.quests.map((q) => q.text).join(" / ")}.`);
  }
  const exit = scene.exits[0];
  if (exit !== undefined) lines.push(`The way onward is called "${exit.to}".`);
  return lines.join("\n");
}

/** System prompt that makes the model write one `Dialogue` program for `ctx.npc`. */
export function dialoguePrompt(ctx: DialoguePromptContext): string {
  const { genesis, npc } = ctx;
  const persona = [
    `You are ${npc.name}, a ${npc.role} standing at tile (${npc.x}, ${npc.z}) on this floor. Your mood is ${npc.mood} and it colours every word.`,
    lookLine(npc),
    `Speak as ${npc.name} speaks — in the world, to the person in front of you. You are not an assistant, you have never heard of a chatbot, and you never mention rules, systems or the player's "quest log".`,
    `The program's npcId must be exactly "${npc.id}".`,
  ].join("\n");

  const preamble = [
    ROLE,
    section("Who you are", persona),
    section("This world", covenant(genesis)),
    section("Where you are standing", sceneSummary(ctx.scene)),
    section("What the traveller carries", bullets(ctx.inventorySummary, "- nothing yet")),
    section("What the traveller has already done", bullets(ctx.karmaSummary, "- nothing yet")),
  ].join("\n\n");

  return dialogueLibrary.prompt({
    preamble,
    additionalRules: [
      languageRule(genesis),
      `Write 1 to ${LIMITS.maxChoices} Choice statements, each with a different label, and list them in the Dialogue choices array.`,
      "A choice's `gives` is a list of material names the traveller walks away with — use [] when the choice gives nothing. Never give an item the world has not shown.",
      "`effect` says what visibly happens if that choice is taken, in one short in-world sentence.",
      'Add a Mutation only when this conversation would visibly change the floor — the sky, the fog or the biome. Otherwise omit the last argument entirely. Inside a Mutation, write null for anything that stays the same, and colours as "#rrggbb".',
      `The line the NPC says stays under ${LIMITS.text.line} characters, and reacts to what the traveller has already done when there is anything to react to.`,
      "Answer with the program only. The first line is root = Dialogue(...); every Choice is referenced from it exactly once.",
    ],
    examples: [EXAMPLE_DIALOGUE],
  });
}
