// The runtime context: what the model is allowed to know about the world right now.
//
// Every section reads `ctx.world.get()` at assembly time and renders "" when no world is loaded,
// so an empty harness assembles a persona and nothing else — never a plausible placeholder world
// (Rule 2).
//
// A world on its history (rev 6 phase 3) adds three things: the season of its last beat for every
// prompt (`world:season`, D13); old tales beside the hot lore — the lore of legends, variants and
// fogged places, whose ids start with `#` and which nothing links to (D4); and no gifted items in
// the inventory, since their names and perks are another player's words (D5). A rumor batch sees
// only the season: its facts are the whole world it may name (D14).

import type { Context } from "@deepseek-ai/cordis";
import { SEASON_NAMES } from "@dsl/prompts/rumor";
import { activate, type LoreNode, regionalTone } from "@shared/lore";
import { type HarnessPlugin, unwind } from "../events";
import { ORDER } from "../order";
import type { AssembleContext, WorldSnapshot } from "../types";

/**
 * A bounded scene's continuity: the last few ledger lines. Open land does not use this — its
 * continuity is the lore graph, activated around the chunk the turn is about (plan.md §5).
 */
const KARMA_WINDOW = 12;

/** Old tales shown beside the hot lore, at most (they never crowd out what stands now). */
const OLD_TALES = 4;

/** A compact assembly (a 4K route): this many hot lore lines and old tales, each cut this short. */
const COMPACT_LORE = { hot: 4, old: 1, chars: 140 } as const;

/** D5: a taken gift enters the inventory as `gift-<8 of its event id>`. */
export const GIFT_ITEM_PREFIX = "gift-";

/** Whether an inventory item is another player's gift (named and made by them, never shown). */
export function isGiftItem(item: { id: string }): boolean {
  return item.id.startsWith(GIFT_ITEM_PREFIX);
}

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

/** A node of a place that is no longer what stands there (D4): shown, never linked to. */
function oldTaleLine(node: LoreNode): string {
  return `- ${node.id} [old tale · ${node.kind}] ${node.label} — ${node.text} (chunk ${node.coord.cx},${node.coord.cz}; told of a place that has faded or was written otherwise; never link to it)`;
}

function loreText(
  world: WorldSnapshot,
  lore: NonNullable<WorldSnapshot["lore"]>,
  a: AssembleContext,
): string {
  const coord = a.coord ?? world.coord;
  if (coord === null || coord === undefined) return "";
  const compact = a.compact === true;
  const all = activate(lore, { coord, karma: world.karma });
  // The air is what stands now: old tales are told, but they do not set the regional tone.
  const tone = regionalTone(all);
  const hot = compact ? all.slice(0, COMPACT_LORE.hot) : all;
  const said = (text: string): string =>
    compact && text.length > COMPACT_LORE.chars
      ? `${text.slice(0, COMPACT_LORE.chars - 1)}…`
      : text;
  const lines = hot.map(
    ({ node }) =>
      `- ${node.id} [${node.kind}] ${node.label} — ${said(node.text)} (chunk ${node.coord.cx},${node.coord.cz}; tone ${node.tone.toFixed(1)})`,
  );
  const old = activate(world.legends ?? [], {
    coord,
    karma: [],
    limit: compact ? COMPACT_LORE.old : OLD_TALES,
  });
  return block("lore", [
    `hot lore around chunk ${coord.cx},${coord.cz}, hottest first; regional tone ${tone.toFixed(2)}`,
    ...(lines.length === 0 ? ["- nothing witnessed nearby yet"] : lines),
    ...(old.length === 0
      ? []
      : ["old tales nearby (ids start with #):", ...old.map(({ node }) => oldTaleLine(node))]),
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
    if (isGiftItem(item)) continue;
    lines.push(`- ${item.name} (${item.kind}, power ${item.power}) — ${item.perk}`);
  }
  if (materials.length > 0) lines.push(`- materials: ${materials.join(", ")}`);
  return block("inventory", lines);
}

/** D13: the season of the last beat, for every prompt of a world on its history. */
function seasonText(world: WorldSnapshot): string {
  if (world.season === undefined) return "";
  return block("season", [
    `It is ${SEASON_NAMES[world.season]} in this world; the seasons turn once a week of the world's own time. Let the air, the light and what people do fit it.`,
  ]);
}

type Render = (world: WorldSnapshot, assemble: AssembleContext) => string;

/**
 * The authored scene's cast is not the cast of a chunk being witnessed somewhere else, and a
 * rumor batch may name only its facts' names (D14): no other cast, lore or inventory reaches it.
 */
const sceneBound =
  (render: (world: WorldSnapshot) => string): Render =>
  (world, a) =>
    a.purpose === "chunk" || a.purpose === "rumor" ? "" : render(world);

const notForRumors =
  (render: Render): Render =>
  (world, a) =>
    a.purpose === "rumor" ? "" : render(world, a);

/**
 * A compact assembly (a 4K route: a guided witness or chapter) has no room for what those turns
 * never use: the authored scene's details (a chapter lists who lives there among its names in
 * use), flags, the inventory. What stands around the turn's chunk (the lore) and the season stay.
 */
const notCompact =
  (render: Render): Render =>
  (world, a) =>
    a.compact === true ? "" : render(world, a);

/** Each section renders from the snapshot, or contributes nothing at all. */
const SECTIONS: readonly { name: string; offset: number; render: Render }[] = [
  { name: "world:floor", offset: 0, render: notCompact(sceneBound(floorText)) },
  { name: "world:npcs", offset: 1, render: notCompact(sceneBound(npcText)) },
  { name: "world:monsters", offset: 2, render: notCompact(sceneBound(monsterText)) },
  { name: "world:quests", offset: 3, render: notCompact(sceneBound(questText)) },
  { name: "world:flags", offset: 4, render: notCompact(notForRumors(flagText)) },
  { name: "world:karma", offset: 5, render: notForRumors(karmaText) },
  { name: "world:inventory", offset: 6, render: notCompact(notForRumors(inventoryText)) },
  { name: "world:season", offset: 7, render: seasonText },
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
