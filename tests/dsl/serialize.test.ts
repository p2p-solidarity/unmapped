import { parseScene, serializeScene } from "@dsl/index";
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

  it("escapes quotes so a floor name can talk about the DSL", () => {
    const graph = graphOf(
      ['root = Scene("The \\"Floor\\" Joke", "meadow", [g])', 'g = Floor(8, 8, "grass")'].join(
        "\n",
      ),
    );
    expect(graphOf(serializeScene(graph)).name).toBe('The "Floor" Joke');
  });
});
