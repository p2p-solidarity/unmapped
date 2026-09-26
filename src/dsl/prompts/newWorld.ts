// Making a new world (plan.md §9, the minimal Create): the model writes the bible, then the place
// the player starts in — a small, open spot whose edges lead out into open land. The world's mood
// and look come from what the player asked for (rev 6), never from one house style: the bible's
// look then decides the biome, the ground and the props every later place is built from.

import type { OpenUIError } from "@openuidev/lang-core";
import { worldPropKinds } from "@shared/bible";
import type { WorldBible } from "@shared/cartridge";
import { ok, type Result } from "@shared/result";
import { BIOMES, PROP_KINDS, type PropKind, type SceneGraph, type Tile } from "@shared/world";
import { bibleLibrary, scenePromptLibrary } from "../libraries";
import { clampText } from "../limits";
import { mergeDslErrors } from "../parse/complaints";
import { dslError, failWith, propError } from "../parse/program";
import { readScene } from "../parse/scene";
import type { DslError } from "../types";
import { languageName } from "./shared";

export interface NewWorldContext {
  name: string;
  intent: string;
  language: string;
  /** How the world is fought in: absent or "none" for a world where nobody fights. */
  fights?: "none" | "gun" | "blade";
  /** The player's own story, if they wrote one: the world must be able to hold it. */
  material?: string;
}

function materialSection(material: string | undefined): string {
  const text = clampText(material ?? "", 1_500);
  return text === ""
    ? ""
    : `\n\n## The player's story (material: the world must be able to hold it)\n${text}`;
}

/** The bible must allow what the game will put on the land, or every chapter contradicts it. */
function fightingRule(fights: NewWorldContext["fights"]): string {
  if (fights === undefined || fights === "none") {
    return "Nobody fights in this world: taboos may rule out monsters and weapons.";
  }
  const arm = fights === "gun" ? "a gun" : "a blade";
  return `This world has fights: monsters roam the open land and the player carries ${arm}. Say in the rules what the monsters are and why they are here, in the world's own terms; never list monsters, weapons or fighting among the taboos.`;
}

const ROLE =
  "Write ONLY an OpenUI Lang program: no prose, no markdown, no code fences, no comments. The first line is the root statement.";

/** Syntax demonstration only (Rule 2): parsed by the DSL tests, never saved. */
export const BIBLE_EXAMPLE = `root = Bible("A coast where the survey ships stopped coming. Past the last pylon the land is real but has no names yet.", "Quiet, a little lonely, warm at dusk.", ["The ferry runs twice a day and nobody minds.", "People trade favours, not money.", "Every village keeps one small rule of its own."], ["Magic or monsters", "Heroes and prophecies"], "Two-word place names from what stands there: Salt Pylon, Low Well. People go by short first names.", "Short sentences. Plain words. People mention the weather before anything else.", "Whitewashed stone houses with blue shutters, rope and driftwood everywhere, grey sea light and faded paint.")`;

export function biblePrompt(ctx: NewWorldContext): string {
  return bibleLibrary.prompt({
    preamble: `${ROLE}\n\n## The world the player asked for\nName: ${clampText(ctx.name, 60)}\nIntent: ${clampText(ctx.intent, 400)}${materialSection(ctx.material)}\n\nThis is a land where the map stopped being drawn: past what is known it is real, but nameless until someone walks there. Its mood, era and look are the ones the player's words above ask for — take them from the intent, not from any genre you would default to. People live ordinary lives in it; it is a place worth coming back to.`,
    additionalRules: [
      "The whole program is ONE statement: root = Bible(...) with every string and list written inline inside the call. Never define premise, rules or any other value as its own statement.",
      `Write every part in ${languageName(ctx.language)}.`,
      "Rules are concrete everyday facts, not lore dumps. Taboos name what must never appear.",
      "The look is what an artist needs to draw this world: its buildings, materials, colours and era, in one or two concrete sentences that follow from the intent.",
      fightingRule(ctx.fights),
      "The example shows syntax only. Never reuse its words.",
    ],
    examples: [BIBLE_EXAMPLE],
  });
}

/**
 * Syntax demonstration only (Rule 2), never saved. Without it the chat model guessed the program's
 * shape and about half the time left the Floor out of the Scene or passed its children wrongly.
 */
export const ORIGIN_EXAMPLE = `root = Scene("Low Well Corner", "meadow", [ground, sky, sun, house1, sign1, crate1, tree1, well1, aki])
ground = Floor(16, 16, "grass")
sky = Sky("#cfdde3", "#c6d4d8", 0.06)
sun = Light("sun", "#fff1c9", 4)
house1 = Prop("house", 3, 3, 1)
sign1 = Prop("signpost", 6, 4, 1)
crate1 = Prop("crate", 11, 5, 1)
tree1 = Prop("tree", 12, 12, 1)
well1 = Prop("well", 4, 11, 1)
aki = NPC("aki", "Aki", 10, 7, "farmer", "calm", "#6d7d4a")`;

/** Ground a player can stand on; water, lava and void are for the land around, not the start. */
const ORIGIN_TILES: readonly Tile[] = ["grass", "stone", "sand", "snow", "wood"];

export function originPrompt(ctx: NewWorldContext, bible: WorldBible): string {
  const props = worldPropKinds(bible);
  const fit = props.length < PROP_KINDS.length ? "" : " — only the ones that fit the bible's look";
  return scenePromptLibrary.prompt({
    preamble: `${ROLE}\n\n## World bible — core\n${bible.core}\n\n## World bible — style\n${bible.style}\n\n## What to write\nThe small place the player wakes in, in the world "${clampText(ctx.name, 60)}". It is the middle of open land: the ground continues past every edge. It looks the way the bible's look says.`,
    additionalRules: [
      `Write every word the player reads in ${languageName(ctx.language)}. Ids and statement names (left of =) stay ascii snake_case.`,
      `Scene biome: the one of ${BIOMES.join(", ")} closest to the bible's look. Floor 12 to 24 tiles each way, tile one of ${ORIGIN_TILES.join(", ")}: the ground of this world's look — the whole land around will be the same ground.`,
      "Exactly one Sky and one sun Light: a daytime sky in the colours of this world.",
      `1 to 3 NPCs who live here. 4 to 20 Props from ${props.join(", ")}${fit}.`,
      "Walls only as short pieces of a building; no Wall may touch the edge of the Floor — every side stays open.",
      "No Monster, Treasure, Exit, Trigger or Platform. At most one Quest(id, text).",
      'Stop a call after the last argument you need: leave the optional ones (marked ?) out, never write "none", "" or a word for them. Every colour is a "#rrggbb" string.',
      "The player wakes on the centre tile: keep it empty.",
      "root = Scene(name, biome, [children]) and the children list MUST include exactly one Floor.",
      "The example shows syntax only. Never reuse its words, places, biome or props.",
    ],
    examples: [ORIGIN_EXAMPLE],
  });
}

/** How far a program with mistakes could be read (`readScene`), for the origin checks. */
export interface OriginReading {
  /** Components with a statement being sent back anyway: what they add is not called missing. */
  refused: ReadonlySet<string>;
  /** The root's children by component as written, readable or not: what counts as too many. */
  written: ReadonlyMap<string, number>;
}

const READ_IN_FULL: OriginReading = { refused: new Set(), written: new Map() };

/**
 * What makes an origin scene unfit for open land; each is a repair-round complaint. `props` is the
 * world's own prop list (its bible's style); a prop outside it is sent back like any other issue.
 * `reading` keeps a program with mistakes from being told "0 residents" about residents refused
 * only for a colour, and still tells it "5 residents" when two of the five were readable.
 */
export function originIssues(
  graph: SceneGraph,
  props?: readonly PropKind[],
  reading: OriginReading = READ_IN_FULL,
): OpenUIError[] {
  const issues: OpenUIError[] = [];
  const { width, depth } = graph.floor;
  if (!ORIGIN_TILES.includes(graph.floor.tile)) {
    issues.push(
      propError(
        "Floor",
        `The floor is ${graph.floor.tile}; nobody can wake on it.`,
        `Use one of ${ORIGIN_TILES.join(", ")}.`,
      ),
    );
  }
  const foreign = props === undefined ? [] : graph.props.filter((p) => !props.includes(p.kind));
  if (foreign.length > 0 && props !== undefined) {
    issues.push(
      propError(
        "Prop",
        `${[...new Set(foreign.map((p) => p.kind))].join(", ")} do not belong in this world.`,
        `Use only ${props.join(", ")}.`,
      ),
    );
  }
  if (width < 12 || depth < 12 || width > 24 || depth > 24) {
    issues.push(
      propError("Floor", `The floor is ${width}×${depth}.`, "Use 12 to 24 tiles each way."),
    );
  }
  const edge = graph.walls.filter(
    (wall) => wall.x <= 0 || wall.z <= 0 || wall.z >= depth - 1 || wall.x + wall.width >= width,
  );
  if (edge.length > 0) {
    issues.push(
      propError(
        "Wall",
        `${edge.length} wall(s) touch the floor's edge.`,
        "Keep walls inside; every edge stays open to the land.",
      ),
    );
  }
  const forbidden =
    graph.monsters.length +
    graph.treasures.length +
    graph.exits.length +
    graph.triggers.length +
    graph.platforms.length;
  if (forbidden > 0) {
    issues.push(
      propError(
        "Scene",
        "The scene has monsters, treasure, exits, triggers or platforms.",
        "Remove them: this is a quiet place people live in.",
      ),
    );
  }
  const residents = Math.max(graph.npcs.length, reading.written.get("NPC") ?? 0);
  if ((residents < 1 && !reading.refused.has("NPC")) || residents > 3) {
    issues.push(propError("NPC", `The scene has ${residents} residents.`, "Write 1 to 3 NPCs."));
  }
  if (!graph.lights.some((light) => light.kind === "sun") && !reading.refused.has("Light")) {
    issues.push(propError("Light", "There is no sun.", 'Add Light("sun", "#fff3d6", 1.2).'));
  }
  return issues;
}

/** The origin checks' complaints as one repair-round error. */
export function originUnfit(issues: readonly OpenUIError[]): DslError {
  return dslError({
    code: "dsl-origin-unfit",
    message: `${issues.length} problem(s) make this place unfit to start in.`,
    hint: issues.map((issue) => `${issue.message} ${issue.hint ?? ""}`.trim()).join(" "),
    errors: [...issues],
  });
}

/**
 * The place the player wakes in: its program and its fit in one step, so one repair round hears
 * about both. A program with mistakes is still checked for fit as far as it could be read.
 */
export function parseOrigin(
  source: string,
  props?: readonly PropKind[],
): Result<SceneGraph, DslError> {
  const read = readScene(source);
  const issues = read.graph === null ? [] : originIssues(read.graph, props, read);
  const error = mergeDslErrors([read.error, issues.length === 0 ? null : originUnfit(issues)]);
  if (error !== null) return failWith(error);
  if (read.graph === null) {
    return failWith(
      dslError({
        code: "dsl-parse",
        message: "No Scene program could be read from the answer.",
        hint: 'End with root = Scene("<place name>", "<biome>", [ ... ]).',
      }),
    );
  }
  return ok(read.graph);
}
