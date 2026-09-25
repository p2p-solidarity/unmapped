// Endless depths: a generated floor is a pure function of the authored scenes, the seed and the
// depth; it only reuses what the author wrote; and its stairs are always reachable.

import { parseScene, serializeScene } from "@dsl/index";
import { type AuthoredScene, endlessFloor, endlessObjectiveOf } from "@shared/endless";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";

function scene(id: string, kit: string, body: string[]): AuthoredScene {
  const names = body.map((line) => line.split(" = ")[0]);
  const source = [
    `root = Scene("${id}", "cyber_workshop", [contract, floor, ${names.join(", ")}])`,
    `contract = Contract("${id}", "${kit}", [], [], "carry", [], false)`,
    'floor = Floor(15, 15, "stone")',
    ...body,
  ].join("\n");
  const parsed = parseScene(source);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return { sceneId: id, graph: parsed.value };
}

const deck = scene("deck", "fps_puzzle@1", [
  'drone = Monster("drone", "drone", 3, 3, 2, "coolant")',
  'cache = Treasure("cache", 5, 5, ["nitrogen"])',
  'crate = Prop("crate", 4, 9)',
  'exit = Exit(13, 13, "next")',
]);
const finale = scene("finale", "vn_fixed@1", ['exit = Exit(8, 7, "end")']);
const text = { clear: "clear", loot: "loot", reach: "reach" };

function stairsReachable(graph: SceneGraph): boolean {
  const { width, depth } = graph.floor;
  const blocked = new Set<string>();
  for (const wall of graph.walls) {
    for (let i = 0; i < wall.width; i += 1) blocked.add(`${wall.x + i},${wall.z}`);
  }
  for (const prop of graph.props) blocked.add(`${prop.x},${prop.z}`);
  const exit = graph.exits[0];
  const queue = [[Math.floor(width / 2), Math.floor(depth / 2)]];
  const seen = new Set([queue[0]?.join(",")]);
  while (queue.length > 0) {
    const [x = 0, z = 0] = queue.shift() ?? [];
    if (x === exit?.x && z === exit.z) return true;
    for (const [nx, nz] of [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ] as const) {
      const id = `${nx},${nz}`;
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || seen.has(id) || blocked.has(id)) {
        continue;
      }
      seen.add(id);
      queue.push([nx, nz]);
    }
  }
  return false;
}

describe("endless depths", () => {
  it("regenerates the same floor for the same seed and depth, and deeper floors differ", () => {
    const input = { scenes: [deck, finale], seed: 42, combat: true, objectiveText: text };
    const one = endlessFloor({ ...input, depth: 3 });
    const again = endlessFloor({ ...input, depth: 3 });
    const deeper = endlessFloor({ ...input, depth: 4 });
    expect(again).toEqual(one);
    expect(deeper?.graph).not.toEqual(one?.graph);
  });

  it("writes a valid scene program that keeps the template's kit and an open way down", () => {
    for (let depth = 1; depth <= 12; depth += 1) {
      const floor = endlessFloor({
        scenes: [deck, finale],
        seed: 7,
        depth,
        combat: true,
        objectiveText: text,
      });
      if (floor === null) throw new Error("expected a floor");
      const parsed = parseScene(serializeScene(floor.graph));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.value.contract?.kit).toBe("fps_puzzle@1");
      expect(endlessObjectiveOf(parsed.value)).toBe(floor.objective);
      expect(stairsReachable(parsed.value)).toBe(true);
    }
  });

  it("only reuses authored content, scales monsters with depth, and has none without combat", () => {
    const shallow = endlessFloor({
      scenes: [deck],
      seed: 1,
      depth: 1,
      combat: true,
      objectiveText: text,
    });
    const deep = endlessFloor({
      scenes: [deck],
      seed: 1,
      depth: 9,
      combat: true,
      objectiveText: text,
    });
    const peaceful = endlessFloor({
      scenes: [deck],
      seed: 1,
      depth: 9,
      combat: false,
      objectiveText: text,
    });
    for (const floor of [shallow, deep]) {
      expect(
        floor?.graph.monsters.every((one) => one.kind === "drone" && one.weakness === "coolant"),
      ).toBe(true);
      expect(
        floor?.graph.treasures.flatMap((one) => one.loot).every((one) => one === "nitrogen"),
      ).toBe(true);
    }
    expect(Math.min(...(deep?.graph.monsters.map((one) => one.level) ?? []))).toBeGreaterThan(
      Math.max(...(shallow?.graph.monsters.map((one) => one.level) ?? [])),
    );
    expect(deep?.graph.monsters.length).toBeGreaterThan(shallow?.graph.monsters.length ?? 0);
    expect(peaceful?.graph.monsters).toEqual([]);
  });
});
