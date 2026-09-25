import { inspectScene, validateScene } from "@shared/scene-validation";
import { describe, expect, it } from "vitest";
import { exit, makeScene, platform, prop, wall } from "../engine/fixtures";

describe("scene validation", () => {
  it("rejects geometry outside the floor bounds", () => {
    const result = validateScene(makeScene({ walls: [wall(7, 7, 2)] }), {
      spawn: { x: 1, z: 1 },
      requiredTargets: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.some((issue) => issue.code === "scene-out-of-bounds")).toBe(true);
  });

  it("reports approximate AABB overlap between scene objects", () => {
    const result = validateScene(makeScene({ walls: [wall(2, 2)], props: [prop("rock", 2, 2)] }), {
      spawn: { x: 0, z: 0 },
      requiredTargets: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.some((issue) => issue.code === "scene-overlap")).toBe(true);
  });

  it("rejects an exit without clearance and without a reachable route", () => {
    const result = validateScene(
      makeScene({
        walls: [...Array.from({ length: 8 }, (_, z) => wall(3, z)), wall(5, 1)],
        exits: [exit(6, 1)],
      }),
      { spawn: { x: 0, z: 1 }, requiredTargets: [{ x: 6, z: 1 }] },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues.some((issue) => issue.code === "exit-clearance")).toBe(true);
    expect(result.error.issues.some((issue) => issue.code === "navigation-unreachable")).toBe(true);
  });

  it("accepts a bounded scene with a clear exit and reachable target", () => {
    const result = validateScene(makeScene({ exits: [exit(6, 6)] }), {
      spawn: { x: 1, z: 1 },
      requiredTargets: [{ x: 6, z: 6 }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.valid).toBe(true);
    expect(result.value.metrics.reachableRequiredTargets).toBe(1);
  });

  it("treats a raised platform as non-blocking for the floor-grid route", () => {
    const result = inspectScene(makeScene({ platforms: [platform(3, 3, { y: 1 })] }), {
      spawn: { x: 1, z: 1 },
      requiredTargets: [{ x: 5, z: 5 }],
    });

    expect(result.valid).toBe(true);
    expect(result.navigation.targets[0]?.reachable).toBe(true);
  });
});
