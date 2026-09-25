import {
  applyDamage,
  type Blocker,
  type Combatant,
  hitscan,
  monsterHp,
  type Ray,
  type WeaponSpec,
} from "@shared/combat";
import { describe, expect, it } from "vitest";

const RIFLE: WeaponSpec = {
  id: "pulse_rifle",
  name: "Pulse Rifle",
  kind: "gun",
  damage: 24,
  range: 20,
  cooldownMs: 400,
  magazine: 12,
};

function target(overrides: Partial<Combatant> = {}): Combatant {
  return { id: "drone", hp: 40, maxHp: 40, x: 0, z: 10, radius: 0.5, height: 1.6, ...overrides };
}

/** Shooter at the origin, eye height 1.2, looking straight down +z. */
function forward(overrides: Partial<Ray> = {}): Ray {
  return { x: 0, y: 1.2, z: 0, dx: 0, dy: 0, dz: 1, ...overrides };
}

describe("applyDamage", () => {
  it("subtracts hp and reports the kill exactly once", () => {
    const first = applyDamage(target({ hp: 30 }), RIFLE.damage);
    expect(first.combatant.hp).toBe(6);
    expect(first.killed).toBe(false);

    const second = applyDamage(first.combatant, RIFLE.damage);
    expect(second.combatant.hp).toBe(0);
    expect(second.applied).toBe(6);
    expect(second.killed).toBe(true);

    // Shooting a corpse applies nothing and does not re-report the kill.
    const third = applyDamage(second.combatant, RIFLE.damage);
    expect(third.applied).toBe(0);
    expect(third.killed).toBe(false);
  });
});

describe("hitscan", () => {
  it("misses a target beside the line of fire", () => {
    expect(hitscan(forward(), RIFLE, [target({ x: 4 })])).toBeNull();
  });

  it("misses a target behind the shooter", () => {
    expect(hitscan(forward(), RIFLE, [target({ z: -10 })])).toBeNull();
  });

  it("misses past the weapon's range", () => {
    expect(hitscan(forward(), RIFLE, [target({ z: 25 })])).toBeNull();
    expect(hitscan(forward(), { ...RIFLE, range: 30 }, [target({ z: 25 })])).not.toBeNull();
  });

  it("takes the nearest of several targets on the same line", () => {
    const hit = hitscan(forward(), RIFLE, [target({ id: "far", z: 15 }), target({ id: "near" })]);
    expect(hit?.combatantId).toBe("near");
  });

  it("ignores the dead so a corpse cannot soak the shot", () => {
    const hit = hitscan(forward(), RIFLE, [
      target({ id: "corpse", hp: 0 }),
      target({ id: "live", z: 14 }),
    ]);
    expect(hit?.combatantId).toBe("live");
  });

  it("lets a shot pass over a short target", () => {
    const crouched = target({ radius: 0.3, height: 0.6 });
    expect(hitscan(forward(), RIFLE, [crouched])).toBeNull();
    // Aimed at its centre, the same weapon connects. The direction is deliberately not a unit
    // vector: hitscan must normalise it rather than mis-measure the distance.
    const aimedDown = forward({ dy: -0.9, dz: 10 });
    expect(hitscan(aimedDown, RIFLE, [crouched])?.distance).toBeCloseTo(10.04, 1);
  });

  it("is stopped by a wall between the shooter and the target, not by one behind it", () => {
    const wall = (z: number, height = 2): Blocker => ({ min: [-2, 0, z], max: [2, height, z + 1] });
    expect(hitscan(forward(), RIFLE, [target()], [wall(4)])).toBeNull();
    expect(hitscan(forward(), RIFLE, [target()], [wall(12)])?.combatantId).toBe("drone");
    // Low cover: the shot at eye height passes over it.
    expect(hitscan(forward(), RIFLE, [target()], [wall(4, 0.8)])?.combatantId).toBe("drone");
    // A monster placed inside a wall must stay killable.
    expect(hitscan(forward(), RIFLE, [target({ z: 4.5 })], [wall(4)])?.combatantId).toBe("drone");
  });
});

describe("monsterHp", () => {
  it("never returns a monster that is already dead", () => {
    expect(monsterHp(0, 0, 1)).toBe(1);
  });
});
