// The runtime context: what the model is allowed to know about the world right now.
//
// Every section reads `ctx.world.get()` at assembly time and renders "" when no world is loaded,
// so an empty harness assembles a persona and nothing else — never a plausible placeholder world
// (Rule 2).

import type { Context } from "@deepseek-ai/cordis";
import { activate, regionalTone } from "@shared/lore";
import { type HarnessPlugin, unwind } from "../events";
import { ORDER } from "../order";
import type { AssembleContext, WorldSnapshot } from "../types";

/**
 * A bounded scene's continuity: the last few ledger lines. Open land does not use this — its
 * continuity is the lore graph, activated around the chunk the turn is about (plan.md §5).
 */
const KARMA_WINDOW = 12;

function block(tag: string, lines: readonly string[]): string {
  if (lines.length === 0) return "";
  return `<${tag}>\n${lines.join("\n")}\n</${tag}>`;
}

function floorText(world: WorldSnapshot): string {
  const parts = [`scene progress ${world.floor}`];
  if ("archetype" in world.genesis) parts.push(`archetype ${world.genesis.archetype}`);
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

function loreText(
  world: WorldSnapshot,
  lore: NonNullable<WorldSnapshot["lore"]>,
  a: AssembleContext,
): string {
  const coord = a.coord ?? world.coord;
  if (coord === null || coord === undefined) return "";
  const hot = activate(lore, { coord, karma: world.karma });
  const tone = regionalTone(hot);
  const lines = hot.map(
    ({ node }) =>
      `- ${node.id} [${node.kind}] ${node.label} — ${node.text} (chunk ${node.coord.cx},${node.coord.cz}; tone ${node.tone.toFixed(1)})`,
  );
  return block("lore", [
    `hot lore around chunk ${coord.cx},${coord.cz}, hottest first; regional tone ${tone.toFixed(2)}`,
    ...(lines.length === 0 ? ["- nothing witnessed nearby yet"] : lines),
  ]);
}

function karmaText(world: WorldSnapshot, a: AssembleContext): string {
  if (world.lore !== undefined) return loreText(world, world.lore, a);
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

type Render = (world: WorldSnapshot, assemble: AssembleContext) => string;

/** The authored scene's cast is not the cast of a chunk being witnessed somewhere else. */
const sceneBound =
  (render: (world: WorldSnapshot) => string): Render =>
  (world, a) =>
    a.purpose === "chunk" ? "" : render(world);

/** Each section renders from the snapshot, or contributes nothing at all. */
const SECTIONS: readonly { name: string; offset: number; render: Render }[] = [
  { name: "world:floor", offset: 0, render: sceneBound(floorText) },
  { name: "world:npcs", offset: 1, render: sceneBound(npcText) },
  { name: "world:monsters", offset: 2, render: sceneBound(monsterText) },
  { name: "world:quests", offset: 3, render: sceneBound(questText) },
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
          text: (assemble: AssembleContext) => {
            const world = ctx.world.get();
            return world === null ? "" : section.render(world, assemble);
          },
          // World text is data, not a template: an NPC named "{{" must not break assembly.
          interpolate: false,
        }),
      ),
    );
  },
};
