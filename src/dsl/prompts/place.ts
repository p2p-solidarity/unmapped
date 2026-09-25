// A place on the land (地點): the model writes what lives in a side-scrolling course or a grid
// dungeon — its name, light, residents and their words, loot, monsters and what the player is there
// to do — and the host builds the ground (`@shared/places`). Coordinates are placed by the host, so
// the prompt asks for none of the layout, only for the life in it. Every resident's words are
// written now, with the place: talking inside it never asks the model (plan.md §1.4).

import type { OpenUIError } from "@openuidev/lang-core";
import type { PlaceKind } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { placeLibrary } from "../libraries";
import { clampText, LIMITS } from "../limits";
import { WITNESS_ACTIONS } from "../parse/chunk";
import { propError } from "../parse/program";
import { languageName } from "./shared";

export interface PlacePromptContext {
  kind: PlaceKind;
  /** What the player asked for, in their own words (may be empty). */
  wish: string;
  /** True when the cartridge's rules declare combat; otherwise no Monster may appear. */
  combat: boolean;
  language: string;
}

/** Syntax demonstration only (Rule 2): parsed by the DSL tests, never rendered or saved. */
export const PLACE_EXAMPLE = `root = Place("Lantern Cellar", "abyss", [ground, sky1, glow, lamp1, crate1, nell, talk_nell, rat1, rat2, jar, errand])
ground = Floor(20, 20, "stone")
sky1 = Sky("#14121a", "#221c2a", 0.03)
glow = Light("ambient", "#a58a6a", 0.7)
lamp1 = Prop("torch", 1, 1)
crate1 = Prop("crate", 1, 1)
nell = NPC("nell", "Nell", 1, 1, "merchant", "wary", "#8a6f55")
talk_nell = Talk("nell", "Mind the rats. The oil jar is past the second bend, if they left it.", [c1, c2])
c1 = Choice("I will fetch it", "talk", "Nell lends you a stub of candle.", ["candle stub"])
c2 = Choice("Not today", "leave", "Nell goes back to counting jars.", [])
rat1 = Monster("rat_a", "slime", 1, 1, 2, "a sharp noise")
rat2 = Monster("rat_b", "slime", 1, 1, 3, "a sharp noise")
jar = Treasure("oil_jar", 1, 1, ["lamp oil"])
errand = Quest("fetch_oil", "Bring the lamp oil back up from the cellar.")`;

const KIND_NOTE: Record<PlaceKind, string> = {
  side: "A side-scrolling course: the player runs and jumps left to right along one row. The host lays the platforms and the way out; you decide what waits along the way.",
  dungeon:
    "A grid dungeon seen in first person, a maze of corridors. The host carves the maze and the way out; you decide who and what is down there.",
};

function rules(ctx: PlacePromptContext): string[] {
  return [
    `Write every word the player reads — the Place name, NPC names, their lines and answers, quest text, loot, weaknesses — in ${languageName(ctx.language)}. Ids stay ascii snake_case and unique.`,
    'One Floor(20, 20, "<tile>") — only its tile matters, the host sets the size — one Sky, and 1 to 3 Lights with at least one "ambient".',
    `1 to ${Math.min(3, LIMITS.maxTreasures)} Treasures holding things this place would really have.`,
    "0 to 2 NPCs who belong here, each with a role, a mood and a colour.",
    `Every NPC gets exactly one Talk: what they say when the player walks up, with 1 to ${LIMITS.maxChoices} answers. A Choice action is one of ${WITNESS_ACTIONS.join(", ")}; gives is [] or one small thing. These words are all they will ever say.`,
    ctx.combat
      ? `2 to ${Math.min(5, LIMITS.maxMonsters)} Monsters that fit the place, levels 1 to 5.`
      : "No Monster: this game declares no combat.",
    ctx.kind === "dungeon"
      ? "3 to 8 Props that fit a corridor (torches, crates, pillars…), never an altar."
      : "No Props.",
    "Exactly one Quest: one concrete sentence saying what the player is here to do.",
    "No Exit, Wall, Platform, Patch or Trigger: the host builds the ground and the ways out.",
    "Coordinates are placed by the host: give every x and z as 1.",
    "Name the Place after the place itself, never after a number.",
    `Names stay under ${LIMITS.text.name} characters; colours are quoted hex like "#8ab6ff".`,
    "The example below shows syntax only. Never reuse its words, names or places.",
    "Answer with the program only: first line root = Place(...), every other statement referenced from it exactly once.",
  ];
}

export function placePrompt(ctx: PlacePromptContext): string {
  const wish = clampText(ctx.wish, 300);
  return placeLibrary.prompt({
    preamble: [
      "You write one place of an UNMAPPED world. Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.",
      `## The place\n${KIND_NOTE[ctx.kind]}`,
      wish.length === 0 ? null : `## What the player asked for\n"${wish}"`,
    ]
      .filter((part) => part !== null)
      .join("\n\n"),
    additionalRules: rules(ctx),
    examples: [PLACE_EXAMPLE],
  });
}

/** What makes the written life of a place unusable; each entry becomes a repair complaint. */
export function placeIssues(graph: SceneGraph, ctx: PlacePromptContext): OpenUIError[] {
  const issues: OpenUIError[] = [];
  if (graph.name.trim().length === 0) {
    issues.push(propError("Place", "The place has no name.", "Name the Place after the place."));
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
