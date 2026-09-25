// The lore graph and its activation (plan.md §5, after Moving Castles' Zero).
//
// A node is a place, a person, a custom, an event or a thing somebody witnessed; it sits on the
// chunk where it was written and links to the nodes it grew out of. When a new chunk is witnessed
// only the "hot" part of the graph goes into the prompt: nodes nearby, nodes the player recently
// touched, and one step along their links. That is what keeps an unbounded map from drifting —
// neighbouring places share customs, and the further you walk the less of home comes along.
//
// Pure: no clock, no randomness, no IO.

import { type ChunkCoord, chunkDistance } from "./chunks";
import type { KarmaEntry } from "./world";

export const LORE_KINDS = ["place", "person", "custom", "event", "object"] as const;
export type LoreKind = (typeof LORE_KINDS)[number];

export interface LoreNode {
  /** `<slug>@<cx>,<cz>` — unique across the whole land. */
  id: string;
  kind: LoreKind;
  /** Short name in the player's language. */
  label: string;
  /** One or two sentences in the player's language. */
  text: string;
  coord: ChunkCoord;
  /** Ids of nodes this one grew out of. Always resolvable when stored. */
  links: string[];
  /** -1 (grief, dread) … 1 (warmth, festivity). */
  tone: number;
}

/** How many nodes a prompt carries. */
export const HOT_LIMIT = 12;
/** Recent ledger entries that count as "the player touched this". */
const RECENT_KARMA = 8;
const SPREAD = 0.5;
const KARMA_BOOST = 1;

export function loreId(slug: string, coord: ChunkCoord): string {
  return `${slug}@${coord.cx},${coord.cz}`;
}

/** Nearer is hotter: 1 on the chunk itself, halving with each ring, nothing beyond ~6 rings. */
function spatial(node: LoreNode, coord: ChunkCoord): number {
  const rings = chunkDistance(node.coord, coord);
  return rings > 6 ? 0 : 1 / 2 ** rings;
}

function touched(nodes: readonly LoreNode[], karma: readonly KarmaEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of karma.slice(-RECENT_KARMA)) {
    for (const node of nodes) {
      if (entry.npcId !== null && node.id.startsWith(`${entry.npcId}@`)) ids.add(node.id);
      if (entry.cx !== undefined && entry.cz !== undefined) {
        if (node.coord.cx === entry.cx && node.coord.cz === entry.cz) ids.add(node.id);
      }
      if (node.label.length > 0 && entry.choice.includes(node.label)) ids.add(node.id);
    }
  }
  return ids;
}

export interface Activation {
  node: LoreNode;
  heat: number;
}

/**
 * The hot part of the graph around `coord`, hottest first. Ties break on id so the same graph
 * always yields the same prompt.
 */
export function activate(
  nodes: readonly LoreNode[],
  input: { coord: ChunkCoord; karma: readonly KarmaEntry[]; limit?: number },
): Activation[] {
  const recent = touched(nodes, input.karma);
  const heat = new Map<string, number>();
  for (const node of nodes) {
    const base = spatial(node, input.coord) + (recent.has(node.id) ? KARMA_BOOST : 0);
    if (base > 0) heat.set(node.id, base);
  }
  // One step along the links, both directions: a custom pulls in the place it belongs to.
  const spread = new Map(heat);
  for (const node of nodes) {
    const own = heat.get(node.id) ?? 0;
    for (const link of node.links) {
      const other = heat.get(link) ?? 0;
      if (own > 0) spread.set(link, (spread.get(link) ?? 0) + own * SPREAD);
      if (other > 0) spread.set(node.id, (spread.get(node.id) ?? 0) + other * SPREAD);
    }
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return [...spread]
    .flatMap(([id, value]) => {
      const node = byId.get(id);
      return node === undefined ? [] : [{ node, heat: value }];
    })
    .sort((a, b) => b.heat - a.heat || (a.node.id < b.node.id ? -1 : 1))
    .slice(0, input.limit ?? HOT_LIMIT);
}

/** Heat-weighted tone of the hot nodes; 0 when the land around is still unwritten. */
export function regionalTone(hot: readonly Activation[]): number {
  let weight = 0;
  let sum = 0;
  for (const { node, heat } of hot) {
    weight += heat;
    sum += node.tone * heat;
  }
  return weight === 0 ? 0 : Math.max(-1, Math.min(1, sum / weight));
}
