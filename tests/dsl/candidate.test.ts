// The Scene Gallery candidate contract: the prompt has to bind the model to the space the author
// picked, and `candidateIssues` has to catch it when the model ignored that — those complaints are
// what the repair round re-sends, so a wrong answer is fixed rather than shown.

import {
  type CandidateSceneContext,
  candidateIssues,
  candidateScenePrompt,
  parseScene,
} from "@dsl";
import { rollBases, type SceneBase } from "@shared/scene-bases";
import { describe, expect, it } from "vitest";

const rolled = rollBases(1)[0];
if (rolled === undefined) throw new Error("no scene base");
const base: SceneBase = rolled;

const ctx: CandidateSceneContext = {
  gameTitle: "Low Well",
  brief: "A quiet errand between two farms.",
  modes: ["adventure_rpg"],
  sceneTitle: "The first field",
  sceneRole: "opening",
  position: 1,
  total: 2,
  terminal: false,
  base,
  kit: "tps_exploration@1",
  combat: false,
  language: "en-US",
};

function scene(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** A scene that fits `ctx`: right extent, right biome, one exit, people, a point to it. */
function fitting(extra: string[] = [], children: string[] = []): string {
  const all = ["ground", "sky1", "sun1", "keeper", "toma", "crate", "task", "way", ...children];
  return scene([
    `root = Scene("The first field", "${base.biome}", [${all.join(", ")}])`,
    `ground = Floor(${base.width}, ${base.depth}, "${base.tile}")`,
    'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
    'sun1 = Light("sun", "#fff3d0", 1.4)',
    'keeper = NPC("keeper", "Keeper", 2, 3, "elder", "calm", "#d8c9a3")',
    'toma = NPC("toma", "Toma", 5, 6, "farmer", "joyful", "#c9b28a")',
    'crate = Treasure("crate_a", 4, 7, ["rope"])',
    'task = Quest("open_the_gate", "The keeper wants the gate open before dusk.")',
    'way = Exit(6, 6, "Onward")',
    ...extra,
  ]);
}

function issuesOf(source: string, context: CandidateSceneContext = ctx): string[] {
  const parsed = parseScene(source);
  if (!parsed.ok) throw new Error(`fixture does not parse: ${parsed.error.message}`);
  return candidateIssues(parsed.value, context).map((issue) => issue.message);
}

describe("candidateScenePrompt", () => {
  it("binds the model to the author's space, brief and scene", () => {
    const prompt = candidateScenePrompt(ctx);
    expect(prompt).toContain(`Floor(${base.width}, ${base.depth}, "${base.tile}")`);
    expect(prompt).toContain(base.biome);
    expect(prompt).toContain("A quiet errand between two farms.");
    expect(prompt).toContain("The first field");
    // No combat declared means the model is told so, not left to guess.
    expect(prompt).toContain("No Monster");
  });

  it("asks for monsters only when the profile declares combat", () => {
    expect(candidateScenePrompt({ ...ctx, combat: true })).toContain("Monsters, each at least 3");
  });
});

describe("candidateIssues", () => {
  it("accepts a scene that fits the chosen space", () => {
    // Props are part of the contract too, so a fitting scene has to carry them.
    const props = Array.from(
      { length: 6 },
      (_, index) => `p${index} = Prop("rock", ${index + 1}, 1, 1)`,
    );
    const ids = props.map((_, index) => `p${index}`);
    expect(issuesOf(fitting(props, ids))).toEqual([]);
  });

  it("catches a floor that is not the space the author picked", () => {
    const wrong = fitting().replace(
      `Floor(${base.width}, ${base.depth}`,
      `Floor(${base.width - 4}, ${base.depth - 4}`,
    );
    expect(issuesOf(wrong).join(" ")).toContain("The floor is");
  });

  it("catches an empty scene, a missing point and a dark scene", () => {
    const bare = scene([
      'root = Scene("Nowhere", "meadow", [ground, sky1, way])',
      `ground = Floor(${base.width}, ${base.depth}, "${base.tile}")`,
      'sky1 = Sky("#9fc7ff", "#cfe3ff", 0.03)',
      'way = Exit(6, 6, "Onward")',
    ]);
    const messages = issuesOf(bare, { ...ctx, base: { ...base, biome: "meadow" } }).join(" ");
    expect(messages).toContain("Nobody is in this scene");
    expect(messages).toContain("no ambient or sun light");
    expect(messages).toContain("Nothing says what the player is here to do");
  });

  it("refuses monsters in a game that declares no combat", () => {
    const armed = fitting(['foe = Monster("foe", "drone", 6, 2, 1, "rain")'], ["foe"]);
    expect(issuesOf(armed).join(" ")).toContain("declares no combat");
    expect(issuesOf(armed, { ...ctx, combat: true }).join(" ")).not.toContain("no combat");
  });

  it("refuses anything standing on the tile the player arrives on", () => {
    const centre = { x: Math.floor(base.width / 2), z: Math.floor(base.depth / 2) };
    const blocked = fitting()
      .replace('"elder", "calm"', '"elder", "calm"')
      .replace(
        `keeper = NPC("keeper", "Keeper", 2, 3`,
        `keeper = NPC("keeper", "Keeper", ${centre.x}, ${centre.z}`,
      );
    expect(issuesOf(blocked).join(" ")).toContain("the tile the player arrives on");
  });
});
