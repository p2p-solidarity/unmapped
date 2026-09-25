// The witnessing prompt (plan.md §5). The pipeline registers these pieces as harness sections in
// this order: bible core → bible style → Chunk spec → hot lore (world context) → neighbours → this
// chunk's ground → output contract. Everything here is bounded: a small model reads all of it on
// every witnessing.

import type { WorldBible } from "@shared/cartridge";
import { CHUNK_SIZE, type ChunkCoord, type ChunkHole, type ChunkTerrain } from "@shared/chunks";
import { type NpcSpec, PROP_KINDS, type PropKind } from "@shared/world";
import { chunkLibrary } from "../libraries";
import { clampText } from "../limits";
import { CHUNK_LIMITS, WITNESS_ACTIONS } from "../parse/chunk";
import { languageName } from "./shared";

/** Syntax demonstration only (Rule 2): parsed by the DSL tests, never rendered or saved. */
export const CHUNK_EXAMPLE = `root = Chunk("Kasumi Crossing", [sign, well1, house1, tree1, rin, old_tomo, talk_rin, talk_tomo, crossing, rule, rin_node, lost_key, key_charm])
sign = Prop("signpost", 14, 9)
well1 = Prop("well", 16, 10)
house1 = Prop("house", 12, 12)
tree1 = Prop("tree", 22, 5, 1.4)
rin = NPC("rin", "Rin", 15, 12, "child", "joyful", "#e2a35b")
old_tomo = NPC("tomo", "Tomo", 11, 13, "elder", "calm", "#8c8a7a", "elder", "straw", "basket")
talk_rin = Talk("rin", "The bus only stops if somebody waves. Nobody has waved since spring.", [c1, c2])
c1 = Choice("Wave for her", "talk", "Rin laughs and waves back at the empty road.", [])
c2 = Choice("Walk on", "leave", "Rin goes back to counting cars.", [])
talk_tomo = Talk("tomo", "Leave a coin on the well for whoever comes after you. That is how it works here.", [c3])
c3 = Choice("Leave a coin", "trade", "Tomo nods and hands you a paper crane.", ["paper crane"])
crossing = Lore("kasumi_crossing", "place", "Kasumi Crossing", "A signpost and a well where two farm roads meet.", [], 0.2)
rule = Lore("coin_for_the_next", "custom", "A coin for the next one", "Travellers leave one coin on the well's rim for whoever comes after.", ["kasumi_crossing"], 0.5)
rin_node = Lore("rin", "person", "Rin", "Counts the cars that pass; says nobody has waved since spring.", ["kasumi_crossing"], 0.3)
lost_key = Find("lost_key", "tomo", "I dropped the shed key somewhere by the old tree.", 22, 6, "key_charm", "That's the one. Keep the bell on it; it was my wife's.")
key_charm = Item("key_charm", "Rusty bell", "charm", 1, "rings when the wind turns", null, ["charm_bell"], ["memory"], "A small brass bell tied with faded string.")`;

export interface ChunkPromptContext {
  language: string;
  coord: ChunkCoord;
  hole: ChunkHole | null;
  /** The prop kinds this world is built from (`worldPropKinds` of its bible). */
  props: readonly PropKind[];
  /** The bible's own art direction; null for a bible written before the look existed. */
  look: string | null;
}

/** Kinds that read as a landmark from far away, when the world has them. */
const TALL: readonly PropKind[] = [
  "chimney",
  "steel_tower",
  "windmill",
  "utility_pole",
  "house",
  "pillar",
  "statue",
  "crane",
  "pipe_stack",
];

/** The DSL section: the Chunk components, the rules a repair round enforces, one example. */
export function chunkSpec(ctx: ChunkPromptContext): string {
  const hole =
    ctx.hole === null
      ? []
      : [
          `The authored village already stands on tiles x < ${ctx.hole.width} and z < ${ctx.hole.depth}: place nothing there.`,
        ];
  return chunkLibrary.prompt({
    preamble:
      "You are the land of this world being seen for the first time. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.",
    additionalRules: [
      `Write every word the player reads — place and resident names, lines, answers, lore — in ${languageName(ctx.language)}. Ids and statement names (left of =) stay ascii snake_case.`,
      `Coordinates are this chunk's own tiles: every x and z is 0..${CHUNK_SIZE - 1}.`,
      ...hole,
      `${CHUNK_LIMITS.minNpcs} to ${CHUNK_LIMITS.maxNpcs} NPCs, each with exactly one Talk. 3 to ${CHUNK_LIMITS.maxProps} Props, at most ${CHUNK_LIMITS.maxWalls} Walls.`,
      `At least one Prop is tall enough to be seen from far away (${[...TALL.filter((kind) => ctx.props.includes(kind)), "a big tree"].join(", ")}) — it is this place's landmark.`,
      `Props this world is built from: ${ctx.props.join(", ")}.${ctx.look === null || ctx.props.length < PROP_KINDS.length ? "" : " Use only the ones that fit the bible's look."}`,
      `A Choice action is one of ${WITNESS_ACTIONS.join(", ")}. gives is [] or one small keepsake.`,
      `Lore: exactly one "place" node named like the Chunk, at least one "custom" — a small rule people here keep — and up to ${CHUNK_LIMITS.maxLore - 2} more (person, event, object).`,
      "Link every new Lore to what it grew out of. When a neighbouring place has a custom, this place's custom is a variation of it or a disagreement with it — keep one element, change another, never copy it — and it links to that custom's id.",
      "The example below shows syntax only. Never reuse its place, people, lines or custom.",
      "Residents may misremember, disagree with each other and with older lore. That is how memory works; do not reconcile them.",
      'Exactly one resident has one small errand: Find (a thing lost on a tile of this chunk), Deliver (take something to a known "place" Lore on another chunk) or Guide (go to such a place for them). Deliver and Guide name that place\'s Lore id; with no other place known, write Find. Its reward is an Item here — an everyday keepsake, kind charm, tool or consumable, power 0..10, meshDna from charm_bell, charm_feather, vial_round, lantern_paper, shaft_bamboo, shell_round.',
      "Everyday, concrete, quiet details. No heroes, no quests for a chosen one, no assistant voice, no vague mystery words.",
      "Answer with the program only: first line root = Chunk(...), every other statement referenced from it exactly once.",
    ],
    examples: [CHUNK_EXAMPLE],
  });
}

export function bibleSections(bible: WorldBible): { core: string; style: string } {
  return {
    core: `## World bible — core (fixed; never contradict it)\n${bible.core.trim()}`,
    style: `## World bible — style (fixed; write like this)\n${bible.style.trim()}`,
  };
}

const DIRECTIONS: Record<string, string> = {
  "0,-1": "north",
  "1,-1": "north-east",
  "1,0": "east",
  "1,1": "south-east",
  "0,1": "south",
  "-1,1": "south-west",
  "-1,0": "west",
  "-1,-1": "north-west",
};

export interface NeighbourSummary {
  coord: ChunkCoord;
  name: string;
  /** `<lore id> "label": text` per custom kept there. */
  customs: string[];
}

export function neighbourSection(
  here: ChunkCoord,
  neighbours: readonly NeighbourSummary[],
): string {
  if (neighbours.length === 0) {
    return "## Neighbouring places\n- none witnessed yet: nobody nearby remembers anything about this place";
  }
  const lines = neighbours.map((one) => {
    const direction = DIRECTIONS[`${one.coord.cx - here.cx},${one.coord.cz - here.cz}`] ?? "nearby";
    const customs =
      one.customs.length === 0
        ? ""
        : ` — customs: ${one.customs.map((c) => clampText(c, 120)).join("; ")}`;
    return `- ${direction}: ${clampText(one.name, 40)}${customs}`;
  });
  return `## Neighbouring places\n${lines.join("\n")}`;
}

/** What the ground of this chunk already is, in words, so the residents fit where they stand. */
export function terrainSection(terrain: ChunkTerrain): string {
  const tiles = CHUNK_SIZE * CHUNK_SIZE;
  const covered = (tile: string): number =>
    terrain.patches
      .filter((patch) => patch.tile === tile)
      .reduce((sum, p) => sum + p.width * p.depth, 0);
  const share = (tile: string): string => `${Math.round((covered(tile) / tiles) * 100)}%`;
  const trees = terrain.props.filter((prop) => prop.kind === "tree");
  const giant = trees.some((tree) => tree.scale >= 3);
  const lines = [
    `- chunk (${terrain.coord.cx}, ${terrain.coord.cz}); base ground ${terrain.floor.tile}`,
    `- water ${share("water")}, shore sand ${share("sand")}, bare stone ${share("stone")}`,
    `- ${trees.length} trees${giant ? ", one of them a giant tree that towers over the land" : ""}, ${terrain.props.filter((p) => p.kind === "rock").length} rocks`,
  ];
  const water = terrain.patches.filter((patch) => patch.tile === "water");
  if (water.length > 0) {
    const xs = water.map((patch) => patch.x + patch.width / 2);
    const zs = water.map((patch) => patch.z);
    const cx = Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    const cz = Math.round(zs.reduce((a, b) => a + b, 0) / zs.length);
    lines.push(
      `- the water lies around tile (${cx}, ${cz}); keep people and buildings on dry ground`,
    );
  }
  if (terrain.hole !== null) {
    lines.push(`- the authored village fills x < ${terrain.hole.width}, z < ${terrain.hole.depth}`);
  }
  return `## This chunk's ground\n${lines.join("\n")}`;
}

/** Origin chunk: the authored residents who still need their words written down. */
export function authoredSection(npcs: readonly NpcSpec[]): string {
  if (npcs.length === 0) return "";
  const lines = npcs.map(
    (npc) =>
      `- ${npc.id} — ${npc.name}, ${npc.role}, ${npc.mood}, standing at (${npc.x}, ${npc.z})`,
  );
  return `## Residents of the authored village
They already exist: do not declare them as NPC again. Write exactly one Talk for each.
${lines.join("\n")}`;
}

export function chunkOutputSection(coord: ChunkCoord): string {
  return `## Output\nWrite the Chunk program for chunk (${coord.cx}, ${coord.cz}) now. The program only.`;
}
