// System prompt for one floor of the tower. It has to survive a 4B local model, so it is short,
// ordered (world → floor → layout recipe → limits) and carries exactly one worked example: the
// one for this world's archetype.

import { scenePromptLibrary } from "../libraries";
import { LIMITS } from "../limits";
import type { ScenePromptContext } from "../types";
import { ARCHETYPE_GUIDE, SCENE_RECIPE } from "./archetypes";
import { SCENE_EXAMPLES } from "./sceneExamples";
import { bullets, covenant, languageRule, ROLE, recent, section } from "./shared";

export { SCENE_EXAMPLES } from "./sceneExamples";

/** Where the player stands when the floor loads, and what must stay away from it. */
const SPAWN = [
  "The player wakes on the centre tile (width/2, depth/2): leave that tile empty and walkable, and keep every Monster at least 3 tiles from it.",
  "NPCs never share a tile and stand at least 3 tiles apart.",
  "Never wall the Exit in: leave the three tiles in front of it open.",
  "Patches and Platforms must fit inside the Floor.",
];

function composition(): string[] {
  return [
    "Exactly one Floor, exactly one Exit and exactly one Sky.",
    `1 to ${LIMITS.maxLights} Lights, at least one "ambient" or "sun" or the floor is black; only a "point" light takes x and z.`,
    `1 to ${LIMITS.maxNpcs} NPCs, 0 to 4 Monsters, 1 to ${LIMITS.maxTreasures} Treasures, 3 to 24 Props, up to ${LIMITS.maxPatches} Patches, ${LIMITS.maxPlatforms} Platforms, ${LIMITS.maxWalls} Walls, ${LIMITS.maxQuests} Quests.`,
    "An NPC may stop after color; body, hat, held and accent then follow the role. Write them out for whoever must not look like the others.",
  ];
}

/** Only the limits the component signatures above do not already carry. */
function numbers(): string[] {
  return [
    `Floor ${LIMITS.floor.min}..${LIMITS.floor.max} whole tiles; every x is 0..width-1 and every z is 0..depth-1 of your own Floor.`,
    `Names stay under ${LIMITS.text.name} characters; colours are quoted hex like "#8ab6ff"; ids are ascii snake_case and unique even in another language.`,
  ];
}

const arrival = (previousExit: string | null): string =>
  previousExit === null
    ? "This is the first floor of the tower: the player wakes here carrying nothing, and the centre of the floor is the first thing they see."
    : `The player climbed here through "${previousExit}": the area around the centre tile is what that name promised, one step further from the ground.`;

/** System prompt that makes the model write one `Scene` program for the next floor. */
export function scenePrompt(ctx: ScenePromptContext): string {
  const { genesis, floor, previousExit } = ctx;

  const preamble = [
    ROLE,
    section("This world", `${covenant(genesis)}\n\n${ARCHETYPE_GUIDE[genesis.archetype]}`),
    section("This floor", `Floor number: ${floor}.\n${arrival(previousExit)}`),
    section(
      "How to lay it out",
      [...SCENE_RECIPE[genesis.archetype], ...SPAWN].map((line) => `- ${line}`).join("\n"),
    ),
    section(
      "Previous choices",
      `${bullets(recent(ctx.karmaSummary, 4, 36), "- nothing yet")}\nOne of them must show in the ground itself: a mended fence, a burnt field, a shrine someone left.`,
    ),
    section(
      "What the player carries",
      bullets(recent(ctx.inventorySummary, 4, 8), "- nothing yet"),
    ),
  ].join("\n\n");

  return scenePromptLibrary.prompt({
    preamble,
    additionalRules: [
      languageRule(genesis),
      ...composition(),
      ...numbers(),
      "Answer with the program only: first line root = Scene(...), every other statement referenced from it exactly once.",
    ],
    examples: [SCENE_EXAMPLES[genesis.archetype]],
  });
}
