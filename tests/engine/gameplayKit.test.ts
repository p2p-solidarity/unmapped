import { resolveSceneKit } from "@renderer/engine/kits/registry";
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
};

describe("gameplay kit registry", () => {
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
