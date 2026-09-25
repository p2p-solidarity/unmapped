// What this guards (Rule 0: invariants over many seeds, which no E2E run can reach). Places are
// played on engine2d with `placeMotion.ts`; the host builds their ground from a seed nobody chose.
//
// 1. An unwinnable course: some seed of `buildPlace("side")` lays a wall or a ledge that the side
//    body, with the platformer kit's own speed / jump / gravity, cannot get past — so the goal exit
//    is never within interact reach from the spawn.
// 2. A course you cannot leave: the way back is out of reach from where the player arrives.
// 3. An unwinnable maze: some seed of `buildPlace("dungeon")` leaves the goal exit on a tile the grid
//    walker cannot step to from the spawn (walls, floor edge), or the way back is unreachable.
//
// Every route found is a real input sequence replayed through `stepSide` / `stepGrid` (the search
// only prunes states it has already seen), so a pass means a player could actually do it.

import { parseScene } from "@dsl";
import { kitTuning } from "@shared/forge";
import { buildPlace, PLACE_BACK, PLACE_GOAL } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { describe, expect, it } from "vitest";
import { distanceTo, sceneTargets, type TargetPoint } from "../../src/renderer/engine/targets";
import {
  type GridBody,
  gridMaze,
  gridSpawn,
  NO_SIDE_INPUT,
  type SideBody,
  type SideCourse,
  type SideInput,
  sideCourse,
  sideReach,
  sideSpawn,
  stepGrid,
  stepSide,
} from "../../src/renderer/engine2d/place/placeMotion";

const WRITTEN = `root = Scene("Test Place", "abyss", [floor, chest, coin, foe1, foe2, npc1, quest])
floor = Floor(20, 20, "stone")
chest = Treasure("chest", 1, 1, ["lamp oil"])
coin = Treasure("coin", 1, 1, ["old coin"])
foe1 = Monster("foe_a", "slime", 1, 1, 2, "salt")
foe2 = Monster("foe_b", "skeleton", 1, 1, 3, "light")
npc1 = NPC("miner", "Old Miner", 1, 1, "merchant", "calm", "#aa8844")
quest = Quest("q1", "Reach the far end.")`;

const SEEDS = Array.from({ length: 240 }, (_, index) => index * 7919 + 1);
const FRAME = 1 / 60;

function written(): SceneGraph {
  const parsed = parseScene(WRITTEN);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function built(kind: "side" | "dungeon", seed: number): SceneGraph {
  const place: Parameters<typeof buildPlace>[0] = {
    id: "p1",
    kind,
    title: "Test Place",
    cx: 1,
    cz: 1,
    seed,
    source: WRITTEN,
    cleared: false,
  };
  return buildPlace(place, written()).graph;
}

function exitTarget(graph: SceneGraph, label: string): TargetPoint {
  const found = sceneTargets(graph, [], false).find(
    (one) => one.kind === "exit" && one.label === label,
  );
  if (found === undefined) throw new Error(`no ${label} exit`);
  return found;
}

// ── The course ──────────────────────────────────────────────────────────────────────────────────

interface Macro {
  /** Input for the first frame, then for every frame after it until the body stands again. */
  first: SideInput;
  rest: SideInput;
  frames: number;
}

const walk = (move: number, sprint: boolean): Macro => ({
  first: { ...NO_SIDE_INPUT, move, sprint },
  rest: { ...NO_SIDE_INPUT, move, sprint },
  frames: 12,
});
const hop = (move: number, sprint: boolean): Macro => ({
  first: { ...NO_SIDE_INPUT, move, sprint, jump: true },
  rest: { ...NO_SIDE_INPUT, move, sprint },
  frames: 1,
});

/**
 * Toward the target first (`toward` is +1 or -1): a depth-first search that heads for the exit and
 * backs off only when stuck, so a winnable course is found in a few dozen expansions.
 */
function macros(toward: number): Macro[] {
  return [
    walk(toward, true),
    hop(toward, true),
    walk(toward, false),
    hop(toward, false),
    hop(0, false),
    { first: { ...NO_SIDE_INPUT, drop: true }, rest: NO_SIDE_INPUT, frames: 1 },
    walk(-toward, true),
    hop(-toward, true),
    walk(-toward, false),
    hop(-toward, false),
  ];
}

const PLATFORMER = kitTuning("platformer_2_5d@1");

function play(body: SideBody, macro: Macro, course: SideCourse): SideBody {
  let next = stepSide(body, macro.first, course, PLATFORMER, FRAME);
  for (let frame = 1; frame < macro.frames; frame += 1) {
    next = stepSide(next, macro.rest, course, PLATFORMER, FRAME);
  }
  // Keep the input held until the body stands again (a jump or a fall plays out).
  for (let frame = 0; frame < 600 && !next.grounded; frame += 1) {
    next = stepSide(next, macro.rest, course, PLATFORMER, FRAME);
  }
  return next;
}

function courseReaches(graph: SceneGraph, target: TargetPoint): boolean {
  const course = sideCourse(graph);
  const reached = (body: SideBody): boolean => {
    const at = sideReach(body, course);
    return distanceTo(target, at.x, at.z) <= PLATFORMER.interactDistance;
  };
  const key = (body: SideBody): string => `${Math.round(body.x * 10)}:${Math.round(body.y * 10)}`;
  const start = sideSpawn(course);
  if (reached(start)) return true;
  // Tried in reverse so the first macro is the first popped.
  const order = macros(target.x >= start.x ? 1 : -1).reverse();
  const seen = new Set([key(start)]);
  const stack: SideBody[] = [start];
  for (let expanded = 0; stack.length > 0 && expanded < 20_000; expanded += 1) {
    const body = stack.pop() as SideBody;
    for (const macro of order) {
      const next = play(body, macro, course);
      if (!next.grounded || seen.has(key(next))) continue;
      if (reached(next)) return true;
      seen.add(key(next));
      stack.push(next);
    }
  }
  return false;
}

// ── The maze ────────────────────────────────────────────────────────────────────────────────────

function mazeReaches(graph: SceneGraph, target: TargetPoint): boolean {
  const maze = gridMaze(graph);
  const kit = kitTuning("dungeon_grid@1");
  const start = gridSpawn(graph);
  const seen = new Set([`${start.to.x},${start.to.z}`]);
  const queue: GridBody[] = [start];
  while (queue.length > 0) {
    const body = queue.shift() as GridBody;
    const x = body.to.x + 0.5;
    const z = body.to.z + 0.5;
    if (distanceTo(target, x, z) <= kit.interactDistance) return true;
    for (const direction of ["north", "south", "east", "west"] as const) {
      let next = stepGrid(body, direction, maze, kit.moveSpeed, FRAME);
      for (let frame = 0; frame < 120 && next.moving; frame += 1) {
        next = stepGrid(next, null, maze, kit.moveSpeed, FRAME);
      }
      const tile = `${next.to.x},${next.to.z}`;
      if (seen.has(tile)) continue;
      seen.add(tile);
      queue.push(next);
    }
  }
  return false;
}

describe("places played on engine2d", () => {
  it("can cross every course the host builds, and walk back out", () => {
    const stuck: number[] = [];
    for (const seed of SEEDS) {
      const graph = built("side", seed);
      if (!courseReaches(graph, exitTarget(graph, PLACE_GOAL))) stuck.push(seed);
      if (!courseReaches(graph, exitTarget(graph, PLACE_BACK))) stuck.push(-seed);
    }
    expect(stuck).toEqual([]);
  });

  it("can walk every maze the host builds to its far end, and back to the way out", () => {
    const stuck: number[] = [];
    for (const seed of SEEDS) {
      const graph = built("dungeon", seed);
      if (!mazeReaches(graph, exitTarget(graph, PLACE_GOAL))) stuck.push(seed);
      if (!mazeReaches(graph, exitTarget(graph, PLACE_BACK))) stuck.push(-seed);
    }
    expect(stuck).toEqual([]);
  });
});
