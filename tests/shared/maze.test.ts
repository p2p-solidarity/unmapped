import { generateMaze, type MazeRequest, type MazeTile } from "@shared/maze";
import { describe, expect, it } from "vitest";

function request(overrides: Partial<MazeRequest> = {}): MazeRequest {
  return {
    width: 21,
    depth: 21,
    seed: 4242,
    entrance: { x: 1, z: 1 },
    exit: { x: 19, z: 19 },
    braid: 0,
    ...overrides,
  };
}

/** Walks the returned route and checks every step is one tile and lands on open ground. */
function routeIsWalkable(result: ReturnType<typeof generateMaze>): boolean {
  const open = new Set(result.open.map((tile) => `${tile.x},${tile.z}`));
  return result.path.every((tile, index) => {
    if (!open.has(`${tile.x},${tile.z}`)) return false;
    if (index === 0) return true;
    const previous = result.path[index - 1];
    if (previous === undefined) return false;
    return Math.abs(tile.x - previous.x) + Math.abs(tile.z - previous.z) === 1;
  });
}

describe("generateMaze", () => {
  it("always leaves a walkable route from the entrance to the exit", () => {
    for (const seed of [1, 2, 7, 99, 4242, 65535]) {
      const result = generateMaze(request({ seed }));
      expect(result.path.length).toBeGreaterThan(0);
      expect(result.path[0]).toEqual({ x: 1, z: 1 });
      expect(result.path[result.path.length - 1]).toEqual({ x: 19, z: 19 });
      expect(routeIsWalkable(result)).toBe(true);
    }
  });

  it("keeps the author's endpoints open, wherever they put them", () => {
    const corners: MazeTile[][] = [
      [
        { x: 1, z: 19 },
        { x: 19, z: 1 },
      ],
      [
        { x: 9, z: 1 },
        { x: 9, z: 19 },
      ],
    ];
    for (const pair of corners) {
      const [entrance, exit] = pair;
      if (entrance === undefined || exit === undefined) continue;
      const result = generateMaze(request({ entrance, exit }));
      const open = new Set(result.open.map((tile) => `${tile.x},${tile.z}`));
      expect(open.has(`${entrance.x},${entrance.z}`)).toBe(true);
      expect(open.has(`${exit.x},${exit.z}`)).toBe(true);
      expect(routeIsWalkable(result)).toBe(true);
    }
  });

  it("is deterministic: the same seed rebuilds the same maze", () => {
    expect(generateMaze(request()).walls).toEqual(generateMaze(request()).walls);
    expect(generateMaze(request({ seed: 5 })).walls).not.toEqual(generateMaze(request()).walls);
  });

  it("braiding opens the maze up rather than sealing it", () => {
    const perfect = generateMaze(request({ braid: 0 }));
    const looped = generateMaze(request({ braid: 60 }));
    expect(looped.open.length).toBeGreaterThan(perfect.open.length);
    expect(routeIsWalkable(looped)).toBe(true);
  });

  it("never walls in a tile it also reports as open", () => {
    const result = generateMaze(request({ seed: 13 }));
    const open = new Set(result.open.map((tile) => `${tile.x},${tile.z}`));
    for (const wall of result.walls) {
      for (let step = 0; step < wall.width; step += 1) {
        expect(open.has(`${wall.x + step},${wall.z}`)).toBe(false);
      }
    }
  });

  it("survives a cramped floor without stranding the player", () => {
    const tiny = generateMaze(request({ width: 7, depth: 7, exit: { x: 5, z: 5 } }));
    expect(routeIsWalkable(tiny)).toBe(true);
  });
});
