import { accentFor, parseScene, ROLE_LOOK } from "@dsl/index";
import { LIMITS } from "@dsl/limits";
import { SCENE_EXAMPLES } from "@dsl/prompts/scene";
import { ARCHETYPES } from "@shared/world";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const expectOk = <T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string } },
): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
};

describe("parseScene", () => {
  it("walks a valid program into a SceneGraph", () => {
    const scene = expectOk(parseScene(fixture("valid-scene.oui")));
    expect(scene.name).toBe("Terrace of Bells");
    expect(scene.biome).toBe("onsen_town");
    expect(scene.floor).toEqual({ width: 18, depth: 14, tile: "wood" });
    expect(scene.npcs).toHaveLength(2);
    expect(scene.monsters).toHaveLength(1);
    expect(scene.treasures).toHaveLength(1);
    expect(scene.props).toHaveLength(5);
    expect(scene.patches).toHaveLength(2);
    expect(scene.platforms).toHaveLength(1);
    expect(scene.walls).toHaveLength(1);
    expect(scene.lights).toHaveLength(2);
    expect(scene.exits).toHaveLength(1);
    expect(scene.quests).toHaveLength(1);
    expect(scene.triggers).toHaveLength(1);
    expect(scene.sky).toEqual({ color: "#7fa8d0", fog: "#c9dcea", fogDensity: 0.03 });
    expect(scene.npcs[0]).toEqual({
      id: "hana_inn",
      name: "Hana",
      x: 4,
      z: 5,
      role: "merchant",
      mood: "joyful",
      color: "#e2b7c3",
      ...ROLE_LOOK.merchant,
      accent: accentFor("#e2b7c3"),
    });
    expect(scene.patches[0]).toEqual({ x: 8, z: 0, width: 3, depth: 14, tile: "stone" });
    expect(scene.platforms[0]).toEqual({
      x: 12,
      z: 10,
      width: 3,
      depth: 2,
      y: 1.5,
      height: 0.5,
      tile: "wood",
      bounce: true,
    });
    expect(scene.lights[1]).toEqual({
      kind: "point",
      color: "#ffcf9a",
      intensity: 0.7,
      x: 9,
      z: 6,
    });
    expect(scene.props[1]).toEqual({ kind: "tree", x: 2, z: 11, scale: 1, tint: null });
    expect(scene.treasures[0]?.loot).toEqual(["folded towel", "brass key"]);
  });

  it("resolves references defined after the root statement", () => {
    const scene = expectOk(
      parseScene(
        [
          'root = Scene("Forward", "meadow", [ground, later, sky1])',
          'later = NPC("late_comer", "Late", 2, 3, "bard", "manic", "#123456")',
          'ground = Floor(8, 8, "grass")',
          'sky1 = Sky("#101010", "#202020", 0.01)',
        ].join("\n"),
      ),
    );
    expect(scene.npcs[0]?.id).toBe("late_comer");
    expect(scene.floor.width).toBe(8);
  });

  it("fails with dsl-missing-floor when nothing can be stood on", () => {
    const result = parseScene(fixture("missing-floor.oui"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-missing-floor");
    expect(result.error.hint).toContain("Floor(width, depth, tile)");
  });

  it("reports an unknown component with an actionable hint", () => {
    const result = parseScene(fixture("unknown-component.oui"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-unknown-component");
    expect(result.error.errors.length).toBeGreaterThan(0);
    const first = result.error.errors[0];
    expect(first?.statementId).toBe("wizard1");
    expect(first?.message).toContain("Wizard");
    expect(first?.hint).toContain("Floor");
  });

  it("clamps every number and pulls coordinates inside the floor", () => {
    const scene = expectOk(parseScene(fixture("clamp-scene.oui")));
    expect(scene.floor.width).toBe(LIMITS.floor.max);
    expect(scene.floor.depth).toBe(LIMITS.floor.min);
    const maxX = Math.min(LIMITS.coord.max, scene.floor.width - 1);
    const maxZ = scene.floor.depth - 1;
    expect(scene.npcs[0]).toMatchObject({ x: maxX, z: 0, color: "#ffaa00" });
    expect(scene.monsters[0]).toMatchObject({ x: maxX, z: maxZ, level: LIMITS.level.max });
    expect(scene.treasures[0]).toMatchObject({ x: 0, z: maxZ });
    expect(scene.treasures[0]?.loot).toHaveLength(LIMITS.maxLoot);
    expect(scene.exits[0]).toMatchObject({ x: maxX, z: maxZ });
    expect(scene.lights[0]?.intensity).toBe(LIMITS.intensity.max);
    expect(scene.sky?.fogDensity).toBe(LIMITS.fogDensity.max);
    expect(scene.props[0]).toMatchObject({ scale: LIMITS.scale.max, tint: "#aabbcc" });
  });

  it("rejects duplicate ids and names them", () => {
    const result = parseScene(fixture("duplicate-ids.oui"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-duplicate-id");
    expect(result.error.message).toContain("twin");
  });

  it("snake_cases ids the model wrote in another script", () => {
    const scene = expectOk(
      parseScene(
        [
          'root = Scene("湯の街", "onsen_town", [ground, granny])',
          'ground = Floor(10, 10, "wood")',
          'granny = NPC("おばあ", "おばあさん", 2, 2, "elder", "calm", "#ddccbb")',
        ].join("\n"),
      ),
    );
    expect(scene.npcs[0]?.id).toBe("npc_1");
    expect(scene.npcs[0]?.name).toBe("おばあさん");
  });

  it("keeps the first Sky and reports references that go nowhere", () => {
    const twoSkies = expectOk(
      parseScene(
        [
          'root = Scene("Two Skies", "abyss", [ground, sky1, sky2])',
          'ground = Floor(8, 8, "void")',
          'sky1 = Sky("#111111", "#222222", 0.05)',
          'sky2 = Sky("#333333", "#444444", 0.06)',
        ].join("\n"),
      ),
    );
    expect(twoSkies.sky?.color).toBe("#111111");

    const missing = parseScene(
      'root = Scene("Gap", "meadow", [ground, ghost])\nground = Floor(8, 8, "grass")',
    );
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.error.code).toBe("dsl-unresolved-reference");
    expect(missing.error.unresolved).toContain("ghost");
  });

  it("reports statements the root never uses", () => {
    const result = parseScene(
      [
        'root = Scene("Lonely", "meadow", [ground])',
        'ground = Floor(8, 8, "grass")',
        'forgotten = Quest("forgotten", "Nobody will ever read this.")',
      ].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-orphaned-statement");
    expect(result.error.orphaned).toContain("forgotten");
  });

  it("refuses an answer that is only prose", () => {
    const result = parseScene("I am sorry, I cannot generate that world for you.");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("dsl-parse");
    expect(result.error.hint).toContain("root = Scene");
  });

  it("leaves the reserved words Floor and Mutation alone inside strings", () => {
    const scene = expectOk(
      parseScene(
        [
          'root = Scene("Floor(2)", "meadow", [ground, note])',
          'ground = Floor(9, 9, "grass")',
          'note = Quest("about_the_lift", "Ask Mira about Floor(2) and the broken lift.")',
        ].join("\n"),
      ),
    );
    expect(scene.name).toBe("Floor(2)");
    expect(scene.quests[0]?.text).toContain("Floor(2)");
  });

  it("parses the example program of every archetype", () => {
    for (const archetype of ARCHETYPES) {
      const result = parseScene(SCENE_EXAMPLES[archetype]);
      expect(result.ok, `${archetype} example must parse`).toBe(true);
    }
  });

  it("dresses an NPC from its role and keeps a look the model wrote out", () => {
    const scene = expectOk(parseScene(fixture("valid-scene.oui")));
    expect(scene.npcs[0]).toMatchObject({ ...ROLE_LOOK.merchant, accent: accentFor("#e2b7c3") });
    expect(scene.npcs[1]).toMatchObject({
      body: "tall",
      hat: "headband",
      held: "hammer",
      accent: "#ffd166",
    });
    const monk = expectOk(
      parseScene(
        [
          'root = Scene("Cell", "abyss", [ground, m])',
          'ground = Floor(8, 8, "stone")',
          'm = NPC("still_monk", "Still", 2, 2, "monk", "calm", "#ccbbaa", null, "crown")',
        ].join("\n"),
      ),
    );
    expect(monk.npcs[0]).toMatchObject({
      body: ROLE_LOOK.monk.body,
      hat: "crown",
      held: ROLE_LOOK.monk.held,
    });
  });

  it("defaults a monster to size 1 with no tint and clamps a hallucinated size", () => {
    const scene = expectOk(parseScene(fixture("clamp-scene.oui")));
    expect(scene.monsters[0]).toMatchObject({
      size: LIMITS.monsterSize.max,
      color: "#00ff00",
    });
    const plain = expectOk(parseScene(fixture("terrain-scene.oui")));
    expect(plain.monsters[0]).toMatchObject({ size: 0.7, color: null });
    const tiny = expectOk(
      parseScene(
        [
          'root = Scene("Motes", "abyss", [ground, m])',
          'ground = Floor(8, 8, "void")',
          'm = Monster("mote", "wisp", 2, 2, 1, "sunlight", 0.01)',
        ].join("\n"),
      ),
    );
    expect(tiny.monsters[0]?.size).toBe(LIMITS.monsterSize.min);
    expect(tiny.monsters[0]?.color).toBeNull();
  });

  it("places only point lights: ambient and sun keep x and z null", () => {
    const scene = expectOk(parseScene(fixture("clamp-scene.oui")));
    const [point, sun] = scene.lights;
    expect(point).toMatchObject({ kind: "point", intensity: LIMITS.intensity.max });
    expect(point?.x).toBe(Math.min(LIMITS.coord.max, scene.floor.width - 1));
    expect(point?.z).toBe(scene.floor.depth - 1);
    expect(sun).toMatchObject({ kind: "sun", x: null, z: null });
  });

  it("clamps patches and platforms into the floor", () => {
    const scene = expectOk(parseScene(fixture("clamp-scene.oui")));
    expect(scene.patches[0]).toEqual({
      x: 0,
      z: scene.floor.depth - 1,
      width: scene.floor.width,
      depth: 1,
      tile: "lava",
    });
    expect(scene.platforms[0]).toEqual({
      x: 6,
      z: 1,
      width: LIMITS.span.max,
      depth: scene.floor.depth - 1,
      y: LIMITS.platformY.max,
      height: LIMITS.platformHeight.max,
      tile: "void",
      bounce: true,
    });
  });

  it("leaves bounce off unless the model asked for it", () => {
    const scene = expectOk(parseScene(fixture("terrain-scene.oui")));
    expect(scene.platforms.map((platform) => platform.bounce)).toEqual([false, true, false]);
    expect(scene.platforms[2]?.y).toBe(4);
  });

  it("keeps at most the engine's share of patches and platforms", () => {
    const patches = Array.from(
      { length: LIMITS.maxPatches + 3 },
      (_, i) => `p${i} = Patch(0, ${i % 6}, 2, 2, "sand")`,
    );
    const platforms = Array.from(
      { length: LIMITS.maxPlatforms + 3 },
      (_, i) => `d${i} = Platform(${i % 6}, 0, 2, 2, 1, 0.5, "stone")`,
    );
    const names = [...patches.map((_, i) => `p${i}`), ...platforms.map((_, i) => `d${i}`)].join(
      ", ",
    );
    const scene = expectOk(
      parseScene(
        [
          `root = Scene("Too Much", "snowfield", [ground, ${names}])`,
          'ground = Floor(8, 8, "snow")',
          ...patches,
          ...platforms,
        ].join("\n"),
      ),
    );
    expect(scene.patches).toHaveLength(LIMITS.maxPatches);
    expect(scene.platforms).toHaveLength(LIMITS.maxPlatforms);
  });
});
