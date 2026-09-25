import { parseScene } from "@dsl/index";
import { LIMITS } from "@dsl/limits";
import { describe, expect, it } from "vitest";
import { fixture } from "./fixtures";

const expectOk = <T>(
  result: { ok: true; value: T } | { ok: false; error: { code: string } },
): T => {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}`);
  return result.value;
};

describe("parseScene", () => {
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
