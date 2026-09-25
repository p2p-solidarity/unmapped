import { parseRules, serializeRules } from "@dsl/index";
import { describe, expect, it } from "vitest";

const source = [
  'root = Rules("tps_exploration@1", "grounded", [tps, fps, forward, back, left, right, interact, jump, flashlight, inspect])',
  'tps = Kit("tps_exploration@1", 4, 7, 6.4, 15, 2, 55, 0.0022, 9)',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'forward = Bind("move_forward", ["KeyW", "ArrowUp"])',
  'back = Bind("move_backward", ["KeyS", "ArrowDown"])',
  'left = Bind("move_left", ["KeyA", "ArrowLeft"])',
  'right = Bind("move_right", ["KeyD", "ArrowRight"])',
  'interact = Bind("interact", ["KeyE"])',
  'jump = Bind("jump", ["Space"])',
  'flashlight = Bind("flashlight", ["KeyF"])',
  'inspect = Bind("inspect", ["MouseLeft"])',
].join("\n");

describe("Gameplay Rules DSL", () => {
  it("parses and deterministically round-trips kit tuning and input bindings", () => {
    const parsed = parseRules(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.defaultKit).toBe("tps_exploration@1");
    expect(parsed.value.physics).toBe("grounded");
    expect(parsed.value.kits[1]).toMatchObject({
      id: "fps_puzzle@1",
      moveSpeed: 3.5,
      cameraFov: 70,
    });
    expect(parsed.value.bindings.interact).toEqual(["KeyE"]);
    expect(parseRules(serializeRules(parsed.value))).toEqual(parsed);
    expect(serializeRules(parsed.value)).toBe(serializeRules(parsed.value));
  });
});
