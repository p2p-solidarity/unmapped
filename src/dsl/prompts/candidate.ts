// Scene candidates for the v2 Create flow. The Scene Base decides the *space* (biome, ground,
// extent, prop palette, where the way out is); the model decides everything that lives in it —
// who is there, what they look like, what they stand next to, what can be picked up and what the
// place is for. Nothing here invents content: with no model there is no candidate (Rule 2).

import type { OpenUIError } from "@openuidev/lang-core";
import type { GameplayKitId } from "@shared/gameplay";
import { exitTile, type SceneBase } from "@shared/scene-bases";
import type { SceneGraph } from "@shared/world";
import { scenePromptLibrary } from "../libraries";
import { clampText, LIMITS } from "../limits";
import { propError } from "../parse/program";
import { SCENE_EXAMPLES } from "./sceneExamples";
import { languageName } from "./shared";

export interface CandidateSceneContext {
  /** Game title as the author typed it. */
  gameTitle: string;
  /** The author's own sentence about the game. May be empty; never filled in for them. */
  brief: string;
  /** Selected mode ids, already human-ordered by the caller. */
  modes: readonly string[];
  /** Which scene of the plan this is, and what it is called. */
  sceneTitle: string;
  sceneRole: string;
  /** 1-based position in the scene plan, and how many scenes there are. */
  position: number;
  total: number;
  /** True when this scene ends the cartridge. */
  terminal: boolean;
  /** The space the author picked. Its extent and exit tile are binding. */
  base: SceneBase;
  /** Engine kit the scene will be played on; it decides how the space has to read. */
  kit: GameplayKitId;
  /** True when the capability profile declares combat; otherwise no Monster may appear. */
  combat: boolean;
  language: string;
}

const ROLE =
  "You are the level designer of one scene of an Unwritten Land cartridge. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.";

/** How the chosen kit wants a space to read. Short: it competes with the rest of the prompt. */
const KIT_NOTE: Record<GameplayKitId, string> = {
  "tps_exploration@1":
    "Third-person camera, the player walks and jumps. Give the space open sight lines and something worth walking towards.",
  "fps_puzzle@1":
    "First-person camera, no jumping. Build rooms and corridors out of Walls; what the player reads up close matters more than the skyline.",
  "platformer_2_5d@1":
    "Side-on camera: the player moves along x only. Use Platforms at rising heights so the route reads left to right, and keep NPCs and Treasures on reachable platforms.",
  "topdown_puzzle@1":
    "Top-down camera, no jumping. The whole floor is visible at once, so lay it out as a readable plan of paths (Patch) and blocks (Wall).",
  "vn_fixed@1":
    "Fixed camera, the player does not walk. Put every NPC within a few tiles of the centre: this scene is what is said in it.",
  "dungeon_grid@1":
    "Grid-stepped first person. Lay Walls on whole tiles so the space is a maze of corridors and junctions.",
};

function theGame(ctx: CandidateSceneContext): string {
  const brief = clampText(ctx.brief, 400);
  return [
    `Title: ${clampText(ctx.gameTitle, 60) || "(untitled)"}`,
    brief.length === 0 ? null : `What the author asked for: "${brief}"`,
    ctx.modes.length === 0 ? null : `Declared modes: ${ctx.modes.join(", ")}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function theScene(ctx: CandidateSceneContext): string {
  return [
    `Scene ${ctx.position} of ${ctx.total}: "${clampText(ctx.sceneTitle, 60)}" (role: ${ctx.sceneRole}).`,
    ctx.terminal
      ? "This is where the cartridge ends: it must feel like an arrival, and its one Exit is the ending gate."
      : "The player leaves through its one Exit into the next scene.",
    KIT_NOTE[ctx.kit],
  ].join("\n");
}

function theSpace(ctx: CandidateSceneContext): string {
  const exit = exitTile(ctx.base);
  return [
    `${ctx.base.name} — ${ctx.base.tagline}`,
    `Floor(${ctx.base.width}, ${ctx.base.depth}, "${ctx.base.tile}") and Scene biome "${ctx.base.biome}". Both are fixed; do not change them.`,
    `The way out is at x=${exit.x}, z=${exit.z}: write exactly one Exit there and leave the tiles around it walkable.`,
    `Props of this place: ${ctx.base.props.join(", ")}.`,
    `Its light: ${ctx.base.lights.map((light) => `${light.kind} ${light.color}`).join(", ")}; sky ${ctx.base.sky.color}, fog ${ctx.base.sky.fog} ${ctx.base.sky.fogDensity}.`,
  ].join("\n");
}

function rules(ctx: CandidateSceneContext): string[] {
  const { base } = ctx;
  return [
    `Write every word the player reads — the scene name, NPC names, quest text, weaknesses, labels — in ${languageName(ctx.language)}. Ids stay ascii snake_case and unique.`,
    `Exactly one Floor(${base.width}, ${base.depth}, "${base.tile}"), one Sky and one Exit.`,
    `1 to ${Math.min(4, LIMITS.maxNpcs)} NPCs who belong here: give each one a role, a mood, a colour, and where it matters a body, hat and held object so they do not look alike.`,
    `1 to ${LIMITS.maxTreasures} Treasures holding things this place would actually have, 6 to 24 Props from the list above, up to ${LIMITS.maxWalls} Walls, ${LIMITS.maxPatches} Patches, ${LIMITS.maxPlatforms} Platforms, up to ${LIMITS.maxTriggers} Triggers and ${LIMITS.maxQuests} Quests.`,
    ctx.combat
      ? `0 to ${Math.min(4, LIMITS.maxMonsters)} Monsters, each at least 3 tiles from the centre.`
      : "No Monster: this game declares no combat.",
    `1 to ${LIMITS.maxLights} Lights, at least one "ambient" or "sun" or the floor is black; only a "point" light takes x and z.`,
    `Every x is 0..${base.width - 1} and every z is 0..${base.depth - 1}. Patches, Platforms and Walls stay inside the floor.`,
    `The player arrives on the centre tile (${Math.floor(base.width / 2)}, ${Math.floor(base.depth / 2)}): leave it empty, and keep NPCs at least 2 tiles apart and off each other's tiles.`,
    "At least one Quest or Trigger says what the player is here to do, in one concrete sentence.",
    "Name the Scene after the place itself — what stands there, what it is for — never after its number in the plan.",
    `Names stay under ${LIMITS.text.name} characters; colours are quoted hex like "#8ab6ff".`,
    "The example below shows syntax only. Never reuse its words, names or places.",
    "Answer with the program only: first line root = Scene(...), every other statement referenced from it exactly once.",
  ];
}

/** System prompt for one Scene Gallery candidate. */
export function candidateScenePrompt(ctx: CandidateSceneContext): string {
  return scenePromptLibrary.prompt({
    preamble: [
      ROLE,
      `## The game\n${theGame(ctx)}`,
      `## This scene\n${theScene(ctx)}`,
      `## The space it is built in\n${theSpace(ctx)}`,
    ].join("\n\n"),
    additionalRules: rules(ctx),
    examples: [ctx.combat ? SCENE_EXAMPLES.delve : SCENE_EXAMPLES.quest],
  });
}

/**
 * What makes a candidate unfit for the space the author chose. Every entry becomes a repair-round
 * complaint, so the model is told exactly what to change rather than being asked to try again.
 */
export function candidateIssues(graph: SceneGraph, ctx: CandidateSceneContext): OpenUIError[] {
  const issues: OpenUIError[] = [];
  const { base } = ctx;
  if (graph.floor.width !== base.width || graph.floor.depth !== base.depth) {
    issues.push(
      propError(
        "Floor",
        `The floor is ${graph.floor.width}×${graph.floor.depth}.`,
        `This space is ${base.width}×${base.depth}: write Floor(${base.width}, ${base.depth}, "${base.tile}").`,
      ),
    );
  }
  if (graph.biome !== base.biome) {
    issues.push(
      propError(
        "Scene",
        `The biome is "${graph.biome}".`,
        `This space is "${base.biome}": keep it.`,
      ),
    );
  }
  if (graph.exits.length !== 1) {
    issues.push(
      propError("Exit", `The scene has ${graph.exits.length} exits.`, "Write exactly one Exit."),
    );
  }
  if (graph.npcs.length < 1) {
    issues.push(propError("NPC", "Nobody is in this scene.", "Write 1 to 4 NPCs who belong here."));
  }
  const centre = { x: Math.floor(base.width / 2), z: Math.floor(base.depth / 2) };
  const onCentre = [
    ...graph.npcs.map((npc) => ({ x: npc.x, z: npc.z, what: `NPC ${npc.id}` })),
    ...graph.monsters.map((one) => ({ x: one.x, z: one.z, what: `Monster ${one.id}` })),
    ...graph.treasures.map((one) => ({ x: one.x, z: one.z, what: `Treasure ${one.id}` })),
  ].filter((one) => one.x === centre.x && one.z === centre.z);
  if (onCentre.length > 0) {
    issues.push(
      propError(
        "Scene",
        `${onCentre[0]?.what} stands on the tile the player arrives on (${centre.x}, ${centre.z}).`,
        "Leave the centre tile empty.",
      ),
    );
  }
  if (!ctx.combat && graph.monsters.length > 0) {
    issues.push(
      propError(
        "Monster",
        `The scene has ${graph.monsters.length} monsters but this game declares no combat.`,
        "Remove every Monster.",
      ),
    );
  }
  if (!graph.lights.some((light) => light.kind === "ambient" || light.kind === "sun")) {
    issues.push(
      propError(
        "Light",
        "There is no ambient or sun light, so the scene renders black.",
        'Add Light("ambient", "#cfd8e8", 0.6) or a sun.',
      ),
    );
  }
  if (graph.props.length < 3) {
    issues.push(
      propError(
        "Prop",
        `The scene has ${graph.props.length} props.`,
        "Place at least 6 props from this space's palette.",
      ),
    );
  }
  if (graph.quests.length === 0 && graph.triggers.length === 0) {
    issues.push(
      propError(
        "Quest",
        "Nothing says what the player is here to do.",
        "Add one Quest or one Trigger naming the point of this scene.",
      ),
    );
  }
  return issues;
}
