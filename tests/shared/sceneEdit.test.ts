import { DEFAULT_BRUSH, describeTile, erase, paint } from "@shared/sceneEdit";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";

function scene(overrides: Partial<SceneGraph> = {}): SceneGraph {
  return {
    name: "draft",
    biome: "cyber_workshop",
    contract: null,
    floor: { width: 20, depth: 20, tile: "stone" },
    patches: [],
    platforms: [],
    walls: [],
    props: [],
    npcs: [],
    monsters: [],
    treasures: [],
    exits: [{ x: 18, z: 18, to: "Exit", targetSceneId: null }],
    lights: [],
    sky: null,
    triggers: [],
    quests: [],
    ...overrides,
  };
}

describe("paint", () => {
  it("puts a platform exactly where the click landed", () => {
    const next = paint(scene(), { ...DEFAULT_BRUSH, kind: "platform", elevation: 2 }, 5, 7);
    expect(next.platforms).toHaveLength(1);
    expect(next.platforms[0]).toMatchObject({ x: 5, z: 7, y: 2, width: 1, depth: 1 });
  });

  it("places each kind of thing on its own list", () => {
    const base = scene();
    expect(paint(base, { ...DEFAULT_BRUSH, kind: "wall" }, 1, 1).walls).toHaveLength(1);
    expect(
      paint(base, { ...DEFAULT_BRUSH, kind: "prop", prop: "torch" }, 1, 1).props[0]?.kind,
    ).toBe("torch");
    expect(
      paint(base, { ...DEFAULT_BRUSH, kind: "monster", monster: "golem" }, 1, 1).monsters[0]?.kind,
    ).toBe("golem");
    expect(paint(base, { ...DEFAULT_BRUSH, kind: "treasure" }, 1, 1).treasures).toHaveLength(1);
  });

  it("refuses to stack two things on one tile", () => {
    const once = paint(scene(), { ...DEFAULT_BRUSH, kind: "prop" }, 4, 4);
    const twice = paint(once, { ...DEFAULT_BRUSH, kind: "monster" }, 4, 4);
    expect(twice.monsters).toHaveLength(0);
    expect(twice).toBe(once);
  });

  it("moves the exit rather than adding a second one", () => {
    const next = paint(scene(), { ...DEFAULT_BRUSH, kind: "exit" }, 3, 9);
    expect(next.exits).toHaveLength(1);
    expect(next.exits[0]).toMatchObject({ x: 3, z: 9, to: "Exit" });
  });

  it("repaints the ground under whatever is already there", () => {
    const withProp = paint(scene(), { ...DEFAULT_BRUSH, kind: "prop" }, 6, 6);
    const painted = paint(withProp, { ...DEFAULT_BRUSH, kind: "patch", tile: "lava" }, 6, 6);
    expect(painted.patches[0]).toMatchObject({ x: 6, z: 6, tile: "lava" });
    expect(painted.props).toHaveLength(1);
  });

  it("clamps a click that lands outside the floor", () => {
    const next = paint(scene(), { ...DEFAULT_BRUSH, kind: "platform" }, 999, -4);
    expect(next.platforms[0]).toMatchObject({ x: 19, z: 0 });
  });

  it("never reuses an entity id", () => {
    let graph = scene();
    for (let index = 0; index < 5; index += 1) {
      graph = paint(graph, { ...DEFAULT_BRUSH, kind: "monster" }, index, 0);
    }
    const ids = graph.monsters.map((one) => one.id);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("erase", () => {
  it("takes away the topmost thing on the tile", () => {
    let graph = paint(scene(), { ...DEFAULT_BRUSH, kind: "platform" }, 2, 2);
    graph = paint(graph, { ...DEFAULT_BRUSH, kind: "patch", tile: "water" }, 2, 2);
    // The monster sits above the platform, so it goes first.
    graph = {
      ...graph,
      monsters: [
        { id: "m", kind: "slime", x: 2, z: 2, level: 1, weakness: "", size: 1, color: null },
      ],
    };

    const once = erase(graph, 2, 2);
    expect(once.monsters).toHaveLength(0);
    expect(once.platforms).toHaveLength(1);

    const twice = erase(once, 2, 2);
    expect(twice.platforms).toHaveLength(0);
    expect(twice.patches).toHaveLength(1);
  });

  it("never removes the exit, because a scene needs a way out", () => {
    const next = erase(scene(), 18, 18);
    expect(next.exits).toHaveLength(1);
  });

  it("does nothing on an empty tile", () => {
    const base = scene();
    expect(erase(base, 10, 10)).toBe(base);
  });
});

describe("describeTile", () => {
  it("names what is under the cursor, for the editor's status line", () => {
    const graph = paint(scene(), { ...DEFAULT_BRUSH, kind: "prop", prop: "altar" }, 8, 8);
    expect(describeTile(graph, 8, 8)).toBe("altar");
    expect(describeTile(graph, 18, 18)).toBe("exit");
    expect(describeTile(graph, 0, 0)).toBeNull();
  });
});
