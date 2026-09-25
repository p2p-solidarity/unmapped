import { parseRules, serializeRules } from "@dsl/index";
import type { GameplayRules } from "@shared/gameplay";
import { applyTweak, describeOp, type RulesTweak } from "@shared/tweak";
import { describe, expect, it } from "vitest";

const rules: GameplayRules = {
  defaultKit: "fps_puzzle@1",
  physics: "grounded",
  kits: [
    {
      id: "fps_puzzle@1",
      moveSpeed: 3.5,
      sprintSpeed: 5,
      jumpSpeed: 0,
      gravity: 15,
      interactDistance: 3,
      cameraFov: 70,
      lookSensitivity: 0.0022,
      cameraDistance: 0,
    },
  ],
  bindings: { fire: ["MouseLeft"] },
  timing: { system: "turn_bar", resolution: "per_player", turnSeconds: 0 },
  combat: { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 },
  party: { size: 2, memberHp: 60, memberSpeed: 8 },
  generation: { kind: "maze", width: 25, depth: 25, braid: 18 },
  progression: [{ kind: "run_based", value: 0 }],
  weapons: [
    {
      id: "sidearm",
      name: "制式槍械",
      kind: "gun",
      damage: 22,
      range: 22,
      cooldownMs: 320,
      magazine: 12,
    },
  ],
};

function tweak(...ops: RulesTweak["ops"]): RulesTweak {
  return { summary: "test", ops };
}

describe("applyTweak", () => {
  it("swaps the turn system, which is the whole point of change_timing", () => {
    const applied = applyTweak(rules, tweak({ type: "change_timing", system: "revolver" }));
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.timing?.system).toBe("revolver");
    // Untouched fields keep their old value rather than resetting.
    expect(applied.value.timing?.resolution).toBe("per_player");
    expect(applied.value.weapons).toEqual(rules.weapons);
  });

  it("changes only the weapon fields it was given", () => {
    const applied = applyTweak(
      rules,
      tweak({ type: "set_weapon", weaponId: "sidearm", cooldownMs: 120 }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.weapons[0]).toEqual({ ...rules.weapons[0], cooldownMs: 120 });
  });

  it("clamps a hallucinated number instead of letting it through", () => {
    const applied = applyTweak(
      rules,
      tweak({ type: "set_weapon", weaponId: "sidearm", damage: 99999, range: 9000, cooldownMs: 1 }),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.weapons[0]).toMatchObject({ damage: 999, range: 60, cooldownMs: 50 });
  });

  it("refuses a weapon that does not exist rather than inventing one", () => {
    const applied = applyTweak(
      rules,
      tweak({ type: "set_weapon", weaponId: "railgun", damage: 50 }),
    );
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error.code).toBe("tweak-unknown-weapon");
  });

  it("adds a weapon, and refuses a duplicate id", () => {
    const added = applyTweak(
      rules,
      tweak({
        type: "add_weapon",
        id: "revolver",
        name: "左輪",
        kind: "gun",
        damage: 45,
        range: 18,
        cooldownMs: 800,
        magazine: 6,
      }),
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(added.value.weapons).toHaveLength(2);
    expect(added.value.weapons[1]?.magazine).toBe(6);

    const twice = applyTweak(
      added.value,
      tweak({
        type: "add_weapon",
        id: "revolver",
        name: "x",
        kind: "gun",
        damage: 1,
        range: 1,
        cooldownMs: 100,
        magazine: 1,
      }),
    );
    expect(twice.ok).toBe(false);
  });

  it("refuses to arm a cartridge that has no combat at all", () => {
    const peaceful: GameplayRules = { ...rules, combat: null, weapons: [] };
    const applied = applyTweak(
      peaceful,
      tweak({
        type: "add_weapon",
        id: "knife",
        name: "刀",
        kind: "melee",
        damage: 10,
        range: 2,
        cooldownMs: 500,
        magazine: 0,
      }),
    );
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.error.code).toBe("tweak-no-combat");
  });

  it("refuses to tune generation on a cartridge with an authored map", () => {
    const authored: GameplayRules = { ...rules, generation: null };
    expect(applyTweak(authored, tweak({ type: "set_generation", braid: 50 })).ok).toBe(false);
  });

  it("rejects an empty tweak instead of quietly doing nothing", () => {
    expect(applyTweak(rules, { summary: "nothing", ops: [] }).ok).toBe(false);
  });

  it("applies several operations in order, all or nothing", () => {
    const applied = applyTweak(
      rules,
      tweak(
        { type: "change_timing", system: "revolver" },
        { type: "set_party", size: 4 },
        { type: "set_weapon", weaponId: "sidearm", magazine: 6 },
      ),
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.value.timing?.system).toBe("revolver");
    expect(applied.value.party?.size).toBe(4);
    expect(applied.value.weapons[0]?.magazine).toBe(6);

    // One bad op rejects the whole thing; nothing is half-applied.
    const partial = applyTweak(
      rules,
      tweak({ type: "set_party", size: 4 }, { type: "set_weapon", weaponId: "nope", damage: 5 }),
    );
    expect(partial.ok).toBe(false);
  });

  it("always leaves rules the DSL can still write and read back", () => {
    const wild = applyTweak(
      rules,
      tweak(
        { type: "change_timing", system: "phase_based", turnSeconds: 9999 },
        { type: "set_combat", playerHp: -5, monsterHpBase: 100000 },
        { type: "set_party", size: 99 },
        { type: "set_generation", width: 999, braid: -20 },
        { type: "set_weapon", weaponId: "sidearm", damage: 0, magazine: 0 },
      ),
    );
    expect(wild.ok).toBe(true);
    if (!wild.ok) return;
    const round = parseRules(serializeRules(wild.value));
    expect(round.ok).toBe(true);
    if (!round.ok) return;
    expect(round.value).toEqual(wild.value);
  });
});

describe("describeOp", () => {
  it("says what changes, in terms of the current value", () => {
    expect(describeOp({ type: "change_timing", system: "revolver" }, rules)).toContain("turn_bar");
    expect(describeOp({ type: "set_party", size: 4 }, rules)).toContain("2");
  });
});
