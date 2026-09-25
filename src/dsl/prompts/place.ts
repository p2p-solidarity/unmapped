// A place on the land (地點): the model writes what lives in a side-scrolling course or a grid
// dungeon — its name, light, residents, loot, monsters and what the player is there to do — and the
// host builds the ground (`@shared/places`). Coordinates are placed by the host, so the prompt asks
// for none of the layout, only for the life in it.

import type { OpenUIError } from "@openuidev/lang-core";
import type { PlaceKind } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { scenePromptLibrary } from "../libraries";
import { clampText, LIMITS } from "../limits";
import { propError } from "../parse/program";
import { SCENE_EXAMPLES } from "./sceneExamples";
import { languageName } from "./shared";

export interface PlacePromptContext {
  kind: PlaceKind;
  /** What the player asked for, in their own words (may be empty). */
  wish: string;
  /** True when the cartridge's rules declare combat; otherwise no Monster may appear. */
  combat: boolean;
  language: string;
}

const KIND_NOTE: Record<PlaceKind, string> = {
  side: "A side-scrolling course: the player runs and jumps left to right along one row. The host lays the platforms and the way out; you decide what waits along the way.",
  dungeon:
    "A grid dungeon seen in first person, a maze of corridors. The host carves the maze and the way out; you decide who and what is down there.",
};

function rules(ctx: PlacePromptContext): string[] {
  return [
    `Write every word the player reads — the Scene name, NPC names, quest text, loot, weaknesses — in ${languageName(ctx.language)}. Ids stay ascii snake_case and unique.`,
    'One Floor(20, 20, "<tile>") — only its tile matters, the host sets the size — one Sky, and 1 to 3 Lights with at least one "ambient".',
    `1 to ${Math.min(3, LIMITS.maxTreasures)} Treasures holding things this place would really have.`,
    "0 to 2 NPCs who belong here, each with a role, a mood and a colour.",
    ctx.combat
      ? `2 to ${Math.min(5, LIMITS.maxMonsters)} Monsters that fit the place, levels 1 to 5.`
      : "No Monster: this game declares no combat.",
    ctx.kind === "dungeon"
      ? "3 to 8 Props that fit a corridor (torches, crates, pillars…)."
      : "No Props.",
    "Exactly one Quest: one concrete sentence saying what the player is here to do.",
    "No Exit, Wall, Platform, Patch or Trigger: the host builds the ground and the ways out.",
    "Coordinates are placed by the host: give every x and z as 1.",
    "Name the Scene after the place itself, never after a number.",
    `Names stay under ${LIMITS.text.name} characters; colours are quoted hex like "#8ab6ff".`,
    "The example below shows syntax only. Never reuse its words, names or places.",
    "Answer with the program only: first line root = Scene(...), every other statement referenced from it exactly once.",
  ];
}

export function placePrompt(ctx: PlacePromptContext): string {
  const wish = clampText(ctx.wish, 300);
  return scenePromptLibrary.prompt({
    preamble: [
      "You write one place of an Unwritten Land world. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.",
      `## The place\n${KIND_NOTE[ctx.kind]}`,
      wish.length === 0 ? null : `## What the player asked for\n"${wish}"`,
    ]
      .filter((part) => part !== null)
      .join("\n\n"),
    additionalRules: rules(ctx),
    examples: [ctx.combat ? SCENE_EXAMPLES.delve : SCENE_EXAMPLES.quest],
  });
}

/** What makes the written life of a place unusable; each entry becomes a repair complaint. */
export function placeIssues(graph: SceneGraph, ctx: PlacePromptContext): OpenUIError[] {
  const issues: OpenUIError[] = [];
  if (graph.name.trim().length === 0) {
    issues.push(propError("Scene", "The place has no name.", "Name the Scene after the place."));
  }
  if (graph.quests.length === 0) {
    issues.push(
      propError("Quest", "No Quest says what the player is here to do.", "Add exactly one Quest."),
    );
  }
  if (graph.treasures.length === 0) {
    issues.push(propError("Treasure", "There is nothing to find.", "Add 1 to 3 Treasures."));
  }
  if (!ctx.combat && graph.monsters.length > 0) {
    issues.push(
      propError("Monster", "This game declares no combat.", "Remove every Monster statement."),
    );
  }
  if (ctx.combat && graph.monsters.length === 0) {
    issues.push(propError("Monster", "A fight was expected here.", "Add 2 to 5 Monsters."));
  }
  if (!graph.lights.some((light) => light.kind === "ambient" || light.kind === "sun")) {
    issues.push(
      propError(
        "Light",
        "Without an ambient or sun light the place is black.",
        'Add Light("ambient", …).',
      ),
    );
  }
  return issues;
}
