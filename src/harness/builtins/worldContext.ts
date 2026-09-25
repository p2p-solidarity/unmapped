// The runtime context: what the model is allowed to know about the world right now.
//
// Every section reads `ctx.world.get()` at assembly time and renders "" when no world is loaded,
// so an empty harness assembles a persona and nothing else — never a plausible placeholder world
// (Rule 2).

import type { Context } from "@deepseek-ai/cordis";
import { type HarnessPlugin, unwind } from "../events";
import { ORDER } from "../order";
import type { WorldSnapshot } from "../types";

/** How much of the log the model sees: enough for continuity, not enough to drown the context. */
const KARMA_WINDOW = 12;

function block(tag: string, lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return `<${tag}>\n${lines.join("\n")}\n</${tag}>`;
}

function floorText(world: WorldSnapshot): string {
  const parts = [`floor ${world.floor}`, `archetype ${world.genesis.archetype}`];
  if (world.scene !== null) {
    parts.push(`biome ${world.scene.biome}`, `scene "${world.scene.name}"`);
  }
  return block("world", [parts.join(" · "), `intent: ${world.genesis.intent}`]);
}

function npcText(world: WorldSnapshot): string {
  const npcs = world.scene?.npcs ?? [];
  return block(
    "npcs",
    npcs.map(
      (npc) =>
        `- ${npc.id} — ${npc.name}, ${npc.role}, ${npc.mood} (${npc.body} build, ${npc.hat} hat, holding ${npc.held})`,
    ),
  );
}

function monsterText(world: WorldSnapshot): string {
  const monsters = world.scene?.monsters ?? [];
  return block(
    "monsters",
    monsters.map(
      (monster) =>
        `- ${monster.id} — ${monster.kind}, level ${monster.level}, weakness: ${monster.weakness || "unknown"}`,
    ),
  );
}

function questText(world: WorldSnapshot): string {
  const quests = world.scene?.quests ?? [];
  return block(
    "quests",
    quests.map((quest) => `- ${quest.id}: ${quest.text}`),
  );
}

function flagText(world: WorldSnapshot): string {
  const entries = Object.entries(world.meta.flags ?? {});
  return block(
    "flags",
    entries
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, value]) => `- ${key} = ${String(value)}`),
  );
}

function karmaText(world: WorldSnapshot): string {
  const recent = world.karma.slice(-KARMA_WINDOW);
  return block(
    "karma",
    recent.map(
      (entry) =>
        `- floor ${entry.floor} · ${entry.action}${entry.npcId === null ? "" : ` · ${entry.npcId}`} · "${entry.choice}" → ${entry.effect}`,
    ),
  );
}

function inventoryText(world: WorldSnapshot): string {
  const { items, materials } = world.inventory;
  const lines: string[] = [];
  for (const item of items) {
    lines.push(`- ${item.name} (${item.kind}, power ${item.power}) — ${item.perk}`);
  }
  if (materials.length > 0) lines.push(`- materials: ${materials.join(", ")}`);
  return block("inventory", lines);
}

/** Each section renders from the snapshot, or contributes nothing at all. */
const SECTIONS: readonly { name: string; offset: number; render: (w: WorldSnapshot) => string }[] =
  [
    { name: "world:floor", offset: 0, render: floorText },
    { name: "world:npcs", offset: 1, render: npcText },
    { name: "world:monsters", offset: 2, render: monsterText },
    { name: "world:quests", offset: 3, render: questText },
    { name: "world:flags", offset: 4, render: flagText },
    { name: "world:karma", offset: 5, render: karmaText },
    { name: "world:inventory", offset: 6, render: inventoryText },
  ];

export const worldContext: HarnessPlugin = {
  name: "builtin:world-context",
  inject: ["systemPrompt", "world"],
  apply(ctx: Context): () => void {
    return unwind(
      SECTIONS.map((section) =>
        ctx.systemPrompt.section({
          name: section.name,
          order: ORDER.CONTEXT + section.offset,
          text: () => {
            const world = ctx.world.get();
            return world === null ? "" : section.render(world);
          },
          // World text is data, not a template: an NPC named "{{" must not break assembly.
          interpolate: false,
        }),
      ),
    );
  },
};
