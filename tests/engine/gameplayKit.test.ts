import { behaviorForKit, resolveSceneKit } from "@renderer/engine/kits/registry";
import type { GameplayRules } from "@shared/gameplay";
import { describe, expect, it } from "vitest";
import { makeScene } from "./fixtures";

const rules: GameplayRules = {
  defaultKit: "tps_exploration@1",
  physics: "grounded",
  kits: [
    {
      id: "tps_exploration@1",
      moveSpeed: 4,
      sprintSpeed: 7,
      jumpSpeed: 6.4,
      gravity: 15,
      interactDistance: 2,
      cameraFov: 55,
      lookSensitivity: 0.0022,
      cameraDistance: 9,
    },
  ],
  bindings: {},
  timing: null,
  combat: null,
  party: null,
  generation: null,
  progression: [],
  weapons: [],
};

describe("gameplay kit registry", () => {
  it("locks each scene kit to an observably different camera and control policy", () => {
    expect(behaviorForKit("tps_exploration@1")).toEqual({
      camera: "orbit",
      movement: "camera",
      jump: true,
      sprint: true,
      flashlight: false,
      reticle: false,
      open: true,
    });
    expect(behaviorForKit("fps_puzzle@1")).toEqual({
      camera: "fps",
      movement: "camera",
      jump: false,
      sprint: false,
      flashlight: true,
      reticle: true,
      open: false,
    });
    expect(behaviorForKit("platformer_2_5d@1")).toEqual({
      camera: "side",
      movement: "side",
      jump: true,
      sprint: true,
      flashlight: false,
      reticle: false,
      open: false,
    });
    expect(behaviorForKit("topdown_puzzle@1")).toEqual({
      camera: "topdown",
      movement: "topdown",
      jump: false,
      sprint: false,
      flashlight: false,
      reticle: false,
      open: false,
    });
  });

  it("uses the scene contract instead of silently falling back", () => {
    const scene = makeScene({
      contract: {
        sceneId: "vault",
        kit: "fps_puzzle@1",
        requiresFlags: [],
        requiresItems: [],
        inventoryPolicy: "carry",
        grantsFlags: [],
        terminal: false,
      },
    });
    const result = resolveSceneKit(rules, scene);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("gameplay-kit-missing");
  });
});
