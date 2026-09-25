import { DEFAULT_RULES_SOURCE, parseRules, RULE_COMPONENT_NAMES, serializeRules } from "@dsl/index";
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

// A cartridge that arms the player: the pacing, the tuning and the weapons are all data, which is
// what makes plan.md §4's `add_weapon` / `change_timing` mods possible without shipping code.
const armed = [
  'root = Rules("fps_puzzle@1", "grounded", [fps, pace, tuning, rifle, knife, forward, interact])',
  'fps = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
  'pace = Timing("phase_based", "shared_team", 12)',
  "tuning = Combat(100, 20, 8)",
  'rifle = Weapon("pulse_rifle", "脈衝步槍", "gun", 24, 20, 400, 12)',
  'knife = Weapon("service_knife", "工兵刀", "melee", 35, 1.5, 700, 0)',
  'forward = Bind("move_forward", ["KeyW"])',
  'interact = Bind("interact", ["KeyE"])',
].join("\n");

describe("Rules DSL: pacing, combat and weapons", () => {
  it("parses a turn system, combat tuning and every declared weapon", () => {
    const parsed = parseRules(armed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.timing).toEqual({
      system: "phase_based",
      resolution: "shared_team",
      turnSeconds: 12,
    });
    expect(parsed.value.combat).toEqual({ playerHp: 100, monsterHpBase: 20, monsterHpPerLevel: 8 });
    expect(parsed.value.weapons).toHaveLength(2);
    expect(parsed.value.weapons[0]).toEqual({
      id: "pulse_rifle",
      name: "脈衝步槍",
      kind: "gun",
      damage: 24,
      range: 20,
      cooldownMs: 400,
      magazine: 12,
    });
    // 0 in the DSL means "never runs dry"; the engine sees null.
    expect(parsed.value.weapons[1]?.magazine).toBeNull();
  });

  it("round-trips through serializeRules without drift", () => {
    const parsed = parseRules(armed);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const again = parseRules(serializeRules(parsed.value));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value).toEqual(parsed.value);
  });

  it("leaves pacing, combat and weapons unset for a cartridge that has none", () => {
    const parsed = parseRules(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.timing).toBeNull();
    expect(parsed.value.combat).toBeNull();
    expect(parsed.value.weapons).toEqual([]);
  });

  it("refuses weapons without combat tuning, so damage has nothing to lie about", () => {
    const noTuning = armed.replace("tuning = Combat(100, 20, 8)\n", "").replace("tuning, ", "");
    expect(parseRules(noTuning).ok).toBe(false);
  });

  it("refuses two pacings in one cartridge", () => {
    const twoPacings = armed
      .replace("[fps, pace,", "[fps, pace, pace2,")
      .replace(
        'pace = Timing("phase_based", "shared_team", 12)',
        'pace = Timing("phase_based", "shared_team", 12)\npace2 = Timing("revolver", "per_player", 8)',
      );
    expect(parseRules(twoPacings).ok).toBe(false);
  });

  it("clamps a hallucinated weapon instead of letting it through", () => {
    const absurd = armed.replace(
      'rifle = Weapon("pulse_rifle", "脈衝步槍", "gun", 24, 20, 400, 12)',
      'rifle = Weapon("pulse_rifle", "脈衝步槍", "gun", 99999, 9000, 1, 12)',
    );
    const parsed = parseRules(absurd);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.weapons[0]?.damage).toBe(999);
    expect(parsed.value.weapons[0]?.range).toBe(60);
    expect(parsed.value.weapons[0]?.cooldownMs).toBe(50);
  });
});

describe("Rules DSL: every component is reachable", () => {
  // Regression: `Generate` was defined, parsed and serialized, but never added to the union of
  // Rules children — so a cartridge using it failed to publish with "unknown component".
  it("accepts every declared rule component as a child of Rules", () => {
    const children = RULE_COMPONENT_NAMES.filter((name) => name !== "Rules");
    const source = [
      `root = Rules("fps_puzzle@1", "grounded", [${children.map((n) => n.toLowerCase()).join(", ")}])`,
      'kit = Kit("fps_puzzle@1", 3.5, 5, 0, 15, 3, 70, 0.0022, 0)',
      'bind = Bind("move_forward", ["KeyW"])',
      'timing = Timing("revolver", "per_player", 0)',
      'weapon = Weapon("w", "W", "gun", 10, 5, 300, 6)',
      "combat = Combat(100, 20, 5)",
      "party = Party(2, 60, 8)",
      'progression = Progression("run_based", 0)',
      'generate = Generate("maze", 21, 21, 10)',
    ].join("\n");

    const parsed = parseRules(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.generation).toEqual({ kind: "maze", width: 21, depth: 21, braid: 10 });
    // And it survives the round trip the publisher uses.
    expect(parseRules(serializeRules(parsed.value)).ok).toBe(true);
  });
});

describe("Rules DSL: numeric fidelity", () => {
  // Regression: clampFloat rounded to three decimals, so the engine's own stock look sensitivity
  // (0.0022) parsed back as 0.002 — a silent ~10% change to every cartridge's aiming feel.
  it("keeps a kit's tuning exactly as it was written", () => {
    const parsed = parseRules(DEFAULT_RULES_SOURCE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.kits.every((kit) => kit.lookSensitivity === 0.0022)).toBe(true);
    const again = parseRules(serializeRules(parsed.value));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value).toEqual(parsed.value);
  });
});
