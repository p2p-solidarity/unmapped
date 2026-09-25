import { accentFor, parseScene, serializeScene } from "@dsl/index";
import { SCENE_EXAMPLES } from "@dsl/prompts/sceneExamples";
import { ARCHETYPES, type SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const SCENE_FIXTURES = [
  "valid-scene.oui",
  "clamp-scene.oui",
  "terrain-scene.oui",
  "fenced-scene.oui",
] as const;

const graphOf = (source: string): SceneGraph => {
  const result = parseScene(source);
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};

const programs: [string, string][] = [
  ...SCENE_FIXTURES.map((name): [string, string] => [name, fixture(name)]),
  ...ARCHETYPES.map((archetype): [string, string] => [
    `${archetype} example`,
    SCENE_EXAMPLES[archetype],
  ]),
];

describe("serializeScene", () => {
  for (const [name, source] of programs) {
    it(`round-trips ${name}`, () => {
      const graph = graphOf(source);
      const text = serializeScene(graph);
      expect(graphOf(text)).toEqual(graph);
      // Deterministic: the same graph always produces the same bytes.
      expect(serializeScene(graph)).toBe(text);
      expect(serializeScene(graphOf(text))).toBe(text);
    });
  }

  it("writes the root first, then the floor, sky, lights, terrain and the cast", () => {
    const text = serializeScene(graphOf(fixture("valid-scene.oui")));
    const heads = text.split("\n").map((line) => line.split(" = ")[1]?.split("(")[0] ?? "");
    expect(heads).toEqual([
      "Scene",
      "Floor",
      "Sky",
      "Light",
      "Light",
      "Patch",
      "Patch",
      "Platform",
      "Wall",
      "Prop",
      "Prop",
      "Prop",
      "Prop",
      "Prop",
      "NPC",
      "NPC",
      "Monster",
      "Treasure",
      "Exit",
      "Trigger",
      "Quest",
    ]);
    expect(text.startsWith("root = Scene(")).toBe(true);
  });

  it("reuses entity ids as statement names and lists every statement in the root", () => {
    const text = serializeScene(graphOf(fixture("valid-scene.oui")));
    expect(text).toContain("hana_inn = NPC(");
    expect(text).toContain("bath_slime = Monster(");
    expect(text).toContain("find_the_key = Quest(");
    expect(text).toContain('floor1 = Floor(18, 14, "wood")');
    const names = text
      .split("\n")
      .slice(1)
      .map((line) => line.split(" = ")[0]);
    const listed = /\[([^\]]*)\]/.exec(text.split("\n")[0] ?? "")?.[1] ?? "";
    expect(listed.split(", ")).toEqual(names);
  });

  it("omits trailing arguments that equal the defaults", () => {
    const text = serializeScene(graphOf(fixture("valid-scene.oui")));
    // merchant → stout/none/basket and the derived accent, so NPC stops after color.
    expect(text).toContain(
      'hana_inn = NPC("hana_inn", "Hana", 4, 5, "merchant", "joyful", "#e2b7c3")',
    );
    // A smith who is deliberately tall keeps every look argument.
    expect(text).toContain(
      '"kenji_smith", "Kenji", 12, 9, "smith", "wary", "#9ab0c8", "tall", "headband", "hammer", "#ffd166"',
    );
    expect(text).toContain('prop2 = Prop("tree", 2, 11)');
    expect(text).toContain('prop3 = Prop("tree", 3, 12, 0.9)');
    expect(text).toContain('light1 = Light("sun", "#fff0cf", 1.4)');
    expect(text).toContain('light2 = Light("point", "#ffcf9a", 0.7, 9, 6)');
    expect(text).toContain('platform1 = Platform(12, 10, 3, 2, 1.5, 0.5, "wood", true)');
  });

  it("keeps an accent the model chose, even when it matches nothing", () => {
    const graph = graphOf(fixture("valid-scene.oui"));
    const kenji = graph.npcs[1];
    expect(kenji?.accent).toBe("#ffd166");
    expect(kenji?.accent).not.toBe(accentFor(kenji?.color ?? ""));
  });

  it("renames a statement when an entity id collides, without touching the id itself", () => {
    const graph = graphOf(
      [
        'root = Scene("Collision", "meadow", [ground, odd])',
        'ground = Floor(10, 10, "grass")',
        'odd = NPC("floor1", "Odd", 2, 2, "bard", "calm", "#334455")',
      ].join("\n"),
    );
    const text = serializeScene(graph);
    expect(text).toContain('npc1 = NPC("floor1"');
    expect(graphOf(text)).toEqual(graph);
  });

  it("writes a floor with nothing on it", () => {
    const graph = graphOf('root = Scene("Bare", "abyss", [g])\ng = Floor(8, 8, "void")');
    expect(serializeScene(graph)).toBe(
      ['root = Scene("Bare", "abyss", [floor1])', 'floor1 = Floor(8, 8, "void")'].join("\n"),
    );
  });

  it("escapes quotes so a floor name can talk about the DSL", () => {
    const graph = graphOf(
      ['root = Scene("The \\"Floor\\" Joke", "meadow", [g])', 'g = Floor(8, 8, "grass")'].join(
        "\n",
      ),
    );
    expect(graphOf(serializeScene(graph)).name).toBe('The "Floor" Joke');
  });
});
