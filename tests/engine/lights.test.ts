import { MAX_POINT_LIGHTS, pointLights } from "@renderer/engine/lights";
import { describe, expect, it } from "vitest";
import { makeScene, pointLight, prop } from "./fixtures";

const floor = { width: 10, depth: 6, tile: "stone" } as const;

describe("pointLights", () => {
  it("spends one shared budget on scene lights and torches together", () => {
    const scene = makeScene({
      floor,
      lights: Array.from({ length: 5 }, (_, i) => pointLight(1, i, 0)),
      props: Array.from({ length: 6 }, (_, i) => prop("torch", i, 3)),
    });
    const kept = pointLights(scene);
    expect(kept).toHaveLength(MAX_POINT_LIGHTS);
    // Scene lights are gained to 12 and torches burn at 6, so every scene light survives.
    expect(kept.filter((l) => l.key.startsWith("scene-"))).toHaveLength(5);
    expect(kept.filter((l) => l.key.startsWith("torch-"))).toHaveLength(3);
  });

  it("keeps every key unique so two torches on the same tile never collide", () => {
    const scene = makeScene({ props: [prop("torch", 1, 1), prop("torch", 1, 1)] });
    const kept = pointLights(scene);
    expect(new Set(kept.map((l) => l.key)).size).toBe(kept.length);
  });
});
