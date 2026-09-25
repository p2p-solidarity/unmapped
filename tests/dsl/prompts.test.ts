import {
  ARCHETYPE_GUIDE,
  DIALOGUE_COMPONENT_NAMES,
  dialoguePrompt,
  ITEM_COMPONENT_NAMES,
  itemPrompt,
  MESH_DNA_PARTS,
  repairPrompt,
  SCENE_COMPONENT_NAMES,
  SCENE_EXAMPLES,
  scenePrompt,
} from "@dsl/index";
import { LIMITS } from "@dsl/limits";
import { parseScene } from "@dsl/parse/scene";
import { SCENE_RECIPE } from "@dsl/prompts/archetypes";
import {
  ARCHETYPES,
  type Archetype,
  BIOMES,
  BODY_KINDS,
  DIALOGUE_ACTIONS,
  type Genesis,
  HAT_KINDS,
  HELD_KINDS,
  ITEM_KINDS,
  LIGHT_KINDS,
  MONSTER_KINDS,
  MOODS,
  NPC_ROLES,
  PROP_KINDS,
  type SceneGraph,
  TILES,
} from "@shared/world";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const genesis: Genesis = {
  archetype: "farm",
  physics: "gentle",
  language: "ja-JP",
  seed: 7,
  intent: "I want a town that keeps living when I log off.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const scene = ((): SceneGraph => {
  const result = parseScene(fixture("valid-scene.oui"));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
})();

const union = (values: readonly string[]): string => values.map((v) => `"${v}"`).join(" | ");

/** The longest system prompt this context can produce: capped karma, inventory and covenant. */
const flooded = (archetype: Archetype): string =>
  scenePrompt({
    genesis: {
      ...genesis,
      archetype,
      intent: "x".repeat(400),
    },
    floor: 12,
    previousExit: "Stair of Rising Steam",
    karmaSummary: Array.from({ length: 40 }, (_, i) => `choice number ${i} ${"y".repeat(120)}`),
    inventorySummary: Array.from({ length: 30 }, (_, i) => `item ${i} ${"z".repeat(80)}`),
  });

describe("scenePrompt", () => {
  const prompt = scenePrompt({
    genesis,
    floor: 4,
    previousExit: "Stair of Rising Steam",
    karmaSummary: ["returned the brass key to Kenji"],
    inventorySummary: ["hot soup"],
  });

  it("documents every scene component the model may write, and not the compiler's Contract", () => {
    for (const name of SCENE_COMPONENT_NAMES) {
      if (name === "Contract") expect(prompt).not.toContain("Contract(");
      else expect(prompt).toContain(`${name}(`);
    }
    expect(prompt).toContain("Patch(x: number, z: number, width: number, depth: number");
    expect(prompt).toContain("bounce?: boolean");
  });

  it("uses the vocabulary of src/shared/world.ts verbatim", () => {
    for (const values of [
      BIOMES,
      TILES,
      PROP_KINDS,
      NPC_ROLES,
      MOODS,
      MONSTER_KINDS,
      LIGHT_KINDS,
      BODY_KINDS,
      HAT_KINDS,
      HELD_KINDS,
    ]) {
      expect(prompt).toContain(union(values));
    }
  });

  it("carries the language, the covenant, the floor and the archetype guidance", () => {
    expect(prompt).toContain("ja-JP");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain(genesis.intent);
    expect(prompt).toContain("Floor number: 4.");
    expect(prompt).toContain(ARCHETYPE_GUIDE.farm);
    expect(prompt).toContain("hot soup");
  });

  it("names the arrival area after the exit the player walked through", () => {
    expect(prompt).toContain('climbed here through "Stair of Rising Steam"');
    expect(prompt).toContain("centre tile");
  });

  it("asks the previous choices to show up in the floor itself", () => {
    expect(prompt).toContain("## Previous choices");
    expect(prompt).toContain("returned the brass key to Kenji");
    expect(prompt).toContain("must show in the ground itself");
  });

  it("states the composition, the spawn rules and the numeric limits", () => {
    expect(prompt).toContain("Exactly one Floor, exactly one Exit and exactly one Sky.");
    expect(prompt).toContain(`${LIMITS.floor.min}..${LIMITS.floor.max}`);
    expect(prompt).toContain(`${LIMITS.scale.min}..${LIMITS.scale.max}`);
    expect(prompt).toContain(`${LIMITS.fogDensity.min}..${LIMITS.fogDensity.max}`);
    expect(prompt).toContain(`${LIMITS.platformY.min}..${LIMITS.platformY.max}`);
    expect(prompt).toContain("wakes on the centre tile");
    expect(prompt).toContain("at least 3 tiles apart");
    expect(prompt).toContain("Never wall the Exit in");
    expect(prompt).toContain("no prose");
  });

  it("gives every archetype its own composition recipe and example", () => {
    for (const archetype of ARCHETYPES) {
      const built = scenePrompt({
        genesis: { ...genesis, archetype },
        floor: 2,
        previousExit: null,
        karmaSummary: [],
        inventorySummary: [],
      });
      expect(built).toContain(ARCHETYPE_GUIDE[archetype]);
      for (const line of SCENE_RECIPE[archetype]) expect(built).toContain(line);
      expect(built).toContain(SCENE_EXAMPLES[archetype]);
      for (const other of ARCHETYPES) {
        if (other !== archetype) expect(built).not.toContain(SCENE_EXAMPLES[other]);
      }
    }
  });

  it("ships an example per archetype that the parser accepts", () => {
    for (const archetype of ARCHETYPES) {
      const result = parseScene(SCENE_EXAMPLES[archetype]);
      expect(result.ok, `${archetype} example must parse`).toBe(true);
      if (!result.ok) continue;
      const lines = SCENE_EXAMPLES[archetype].split("\n").length;
      expect(lines).toBeGreaterThanOrEqual(15);
      expect(lines).toBeLessThanOrEqual(25);
      expect(result.value.patches.length).toBeGreaterThan(0);
      expect(result.value.npcs.length).toBeGreaterThan(0);
      expect(result.value.exits).toHaveLength(1);
    }
    expect(parseScene(SCENE_EXAMPLES.delve).ok).toBe(true);
    const delve = parseScene(SCENE_EXAMPLES.delve);
    if (delve.ok) expect(delve.value.platforms.length).toBeGreaterThanOrEqual(3);
  });

  it("ships examples that obey the composition rules the prompt states", () => {
    const far = (ax: number, az: number, bx: number, bz: number): number =>
      Math.max(Math.abs(ax - bx), Math.abs(az - bz));
    for (const archetype of ARCHETYPES) {
      const result = parseScene(SCENE_EXAMPLES[archetype]);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const scene = result.value;
      const cx = Math.floor(scene.floor.width / 2);
      const cz = Math.floor(scene.floor.depth / 2);
      const standing = [...scene.npcs, ...scene.treasures, ...scene.exits];
      for (const thing of standing) {
        expect(
          far(thing.x, thing.z, cx, cz),
          `${archetype}: spawn tile must stay free`,
        ).toBeGreaterThan(0);
      }
      for (const monster of scene.monsters) {
        expect(
          far(monster.x, monster.z, cx, cz),
          `${archetype}: ${monster.id} stands too close to the spawn`,
        ).toBeGreaterThanOrEqual(3);
      }
      for (const [i, npc] of scene.npcs.entries()) {
        for (const other of scene.npcs.slice(i + 1)) {
          expect(
            far(npc.x, npc.z, other.x, other.z),
            `${archetype}: ${npc.id} and ${other.id} are too close`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
      const exit = scene.exits[0];
      for (const wall of scene.walls) {
        const onWall =
          exit !== undefined &&
          exit.z === wall.z &&
          exit.x >= wall.x &&
          exit.x < wall.x + wall.width;
        expect(onWall, `${archetype}: a Wall runs through the Exit`).toBe(false);
      }
      const tiles = standing.map((thing) => `${thing.x},${thing.z}`);
      expect(new Set(tiles).size, `${archetype}: two things share a tile`).toBe(tiles.length);
    }
  });

  it("stays inside the context a 4B local model can hold (~2500 tokens)", () => {
    for (const archetype of ARCHETYPES) {
      const built = scenePrompt({
        genesis: { ...genesis, archetype },
        floor: 7,
        previousExit: "Stair of Rising Steam",
        karmaSummary: ["returned the brass key to Kenji", "let the slime keep the towel"],
        inventorySummary: ["hot soup", "brass key"],
      });
      expect(built.length, `${archetype} prompt is ${built.length} characters`).toBeLessThan(
        10_000,
      );
      expect(Math.ceil(built.length / 4)).toBeLessThan(2_500);
    }
  });

  it("cannot be grown past that by a long karma trail or a long covenant", () => {
    for (const archetype of ARCHETYPES) {
      const built = flooded(archetype);
      expect(built.length, `${archetype} flooded prompt is ${built.length}`).toBeLessThan(10_000);
      expect(built).toContain("choice number 39");
      expect(built).not.toContain("choice number 35");
    }
  });

  it("says nothing is carried on the first floor", () => {
    const first = scenePrompt({
      genesis,
      floor: 1,
      previousExit: null,
      karmaSummary: [],
      inventorySummary: [],
    });
    expect(first).toContain("first floor");
    expect(first).toContain("- nothing yet");
  });
});

describe("dialoguePrompt", () => {
  const npc = scene.npcs[0];
  if (npc === undefined) throw new Error("fixture has no npc");
  const prompt = dialoguePrompt({
    genesis,
    npc,
    scene,
    karmaSummary: ["let the slime keep the towel"],
    inventorySummary: ["brass key"],
  });

  it("documents every dialogue component and only the actions the engine honours", () => {
    for (const name of DIALOGUE_COMPONENT_NAMES) expect(prompt).toContain(`${name}(`);
    expect(prompt).toContain(union(DIALOGUE_ACTIONS));
    expect(prompt).not.toContain('"fight"');
  });

  it("builds the persona from the NPC and summarises the floor", () => {
    expect(prompt).toContain(npc.name);
    expect(prompt).toContain(npc.role);
    expect(prompt).toContain(npc.mood);
    expect(prompt).toContain(`"${npc.id}"`);
    expect(prompt).toContain(scene.name);
    expect(prompt).toContain("Stair of Rising Steam");
    expect(prompt).toContain("let the slime keep the towel");
    expect(prompt).toContain("brass key");
  });

  it("tells the NPC what the traveller can see of them, without the hex codes", () => {
    expect(prompt).toContain(npc.body);
    if (npc.held !== "none") expect(prompt).toContain(npc.held);
    if (npc.hat !== "none") expect(prompt).toContain(npc.hat);
    // Handed its own hex, a model reads it out loud ("dusk soft on me like #d49a6c").
    expect(prompt).not.toContain(npc.color);
    expect(prompt).toContain("never say a colour code");
  });

  it("keeps the NPC in the world and the mutation rare", () => {
    expect(prompt).toContain("You are not an assistant");
    expect(prompt).toContain(`1 to ${LIMITS.maxChoices} Choice`);
    expect(prompt).toContain("Add a Mutation only when");
    expect(prompt).toContain("Japanese");
  });
});

describe("itemPrompt", () => {
  const prompt = itemPrompt({
    genesis,
    wish: "a ladle that never lets the water go cold",
    materials: ["brass key", "folded towel"],
    floor: 4,
    inventorySummary: ["hot soup"],
  });

  it("documents the item component, its kinds and the mesh vocabulary", () => {
    for (const name of ITEM_COMPONENT_NAMES) expect(prompt).toContain(`${name}(`);
    expect(prompt).toContain(union(ITEM_KINDS));
    for (const part of MESH_DNA_PARTS) expect(prompt).toContain(part);
  });

  it("asks for semantic arbitration between the wish and the materials", () => {
    expect(prompt).toContain("a ladle that never lets the water go cold");
    expect(prompt).toContain("brass key");
    expect(prompt).toContain("You do not grant wishes, you weigh them.");
    expect(prompt).toContain("write a curse");
    expect(prompt).toContain(`${LIMITS.power.min}..${LIMITS.power.max}`);
  });
});

describe("repairPrompt", () => {
  it("lists every failing statement id, hint and the program itself", () => {
    const source = fixture("unknown-component.oui");
    const result = parseScene(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const prompt = repairPrompt(source, result.error);
    expect(prompt).toContain("wizard1");
    expect(prompt).toContain("Wizard");
    expect(prompt).toContain(result.error.code);
    expect(prompt).toContain("Available components");
    expect(prompt).toContain('ground = Floor(10, 10, "grass")');
    expect(prompt).toContain("COMPLETE corrected program");
  });

  it("lists unresolved and orphaned names", () => {
    const source = 'root = Scene("Gap", "meadow", [ground, ghost])\nground = Floor(8, 8, "grass")';
    const result = parseScene(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const prompt = repairPrompt(source, result.error);
    expect(prompt).toContain("Referenced but never defined");
    expect(prompt).toContain("- ghost");
  });
});
