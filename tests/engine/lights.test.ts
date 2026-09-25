import { floorCenter } from "@renderer/engine/colliders";
import {
  CENTRE_LIGHT_HEIGHT,
  capPointLights,
  MAX_POINT_LIGHTS,
  POINT_GAIN,
  POINT_LIGHT_HEIGHT,
  pointLights,
  scenePointLights,
  TORCH_INTENSITY,
  torchPointLights,
} from "@renderer/engine/lights";
import type { LightSpec } from "@shared/world";
import { describe, expect, it } from "vitest";
import { makeScene, pointLight, prop } from "./fixtures";

const floor = { width: 10, depth: 6, tile: "stone" } as const;

describe("scenePointLights", () => {
  it("places a light with x/z over the centre of its tile at lantern height", () => {
    const [light] = scenePointLights([pointLight(1, 3, 4)], floor);
    expect(light?.position).toEqual([3.5, POINT_LIGHT_HEIGHT, 4.5]);
    expect(light?.intensity).toBeCloseTo(POINT_GAIN);
  });

  it("parks a light with no x/z over the floor centre, higher up", () => {
    const [light] = scenePointLights([pointLight(0.5)], floor);
    const centre = floorCenter(floor);
    expect(light?.position).toEqual([centre[0], CENTRE_LIGHT_HEIGHT, centre[2]]);
  });

  it("needs both coordinates before it counts as placed", () => {
    const centre = floorCenter(floor);
    expect(scenePointLights([pointLight(1, 3, null)], floor)[0]?.position[0]).toBe(centre[0]);
    expect(scenePointLights([pointLight(1, null, 4)], floor)[0]?.position[0]).toBe(centre[0]);
  });

  it("ignores ambient and sun lights — <Atmosphere> owns those", () => {
    const lights: LightSpec[] = [
      { kind: "ambient", color: "#ffffff", intensity: 1, x: null, z: null },
      { kind: "sun", color: "#ffffff", intensity: 2, x: 1, z: 1 },
      pointLight(1, 2, 2),
    ];
    expect(scenePointLights(lights, floor)).toHaveLength(1);
  });

  it("clamps a negative intensity to zero rather than inverting the light", () => {
    expect(scenePointLights([pointLight(-3, 1, 1)], floor)[0]?.intensity).toBe(0);
  });
});

describe("torchPointLights", () => {
  it("lights torches at the flame and nothing else", () => {
    const placements = torchPointLights([prop("torch", 2, 3), prop("tree", 4, 4)]);
    expect(placements).toHaveLength(1);
    expect(placements[0]?.position[0]).toBeCloseTo(2.5);
    expect(placements[0]?.position[2]).toBeCloseTo(3.5);
    expect(placements[0]?.intensity).toBe(TORCH_INTENSITY);
  });

  it("follows the prop scale up the pole", () => {
    const small = torchPointLights([prop("torch", 0, 0, 1)])[0];
    const big = torchPointLights([prop("torch", 0, 0, 2)])[0];
    expect(big?.position[1] ?? 0).toBeGreaterThan(small?.position[1] ?? 0);
  });
});

describe("capPointLights", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    key: `k${i}`,
    color: "#ffffff",
    intensity: i,
    distance: 8,
    position: [0, 0, 0] as [number, number, number],
  }));

  it("keeps everything when the scene is inside the budget", () => {
    const few = many.slice(0, 3);
    expect(capPointLights(few)).toEqual(few);
  });

  it("drops the dimmest first", () => {
    const kept = capPointLights(many);
    expect(kept).toHaveLength(MAX_POINT_LIGHTS);
    expect(kept.map((l) => l.intensity)).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("keeps the original order so React keys never shuffle", () => {
    const kept = capPointLights(many, 4);
    expect(kept.map((l) => l.key)).toEqual(["k8", "k9", "k10", "k11"]);
  });

  it("breaks intensity ties on the earlier entry", () => {
    const tied = many.map((light) => ({ ...light, intensity: 1 }));
    expect(capPointLights(tied, 3).map((l) => l.key)).toEqual(["k0", "k1", "k2"]);
  });
});

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

  it("returns nothing for a scene with no point light and no torch", () => {
    expect(pointLights(makeScene({ props: [prop("tree", 1, 1)] }))).toEqual([]);
  });

  it("keeps every key unique so two torches on the same tile never collide", () => {
    const scene = makeScene({ props: [prop("torch", 1, 1), prop("torch", 1, 1)] });
    const kept = pointLights(scene);
    expect(new Set(kept.map((l) => l.key)).size).toBe(kept.length);
  });
});
