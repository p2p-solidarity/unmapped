import {
  AURA_LEVEL,
  clampMonsterSize,
  hasAura,
  MAX_MONSTER_SIZE,
  MIN_MONSTER_SIZE,
  monsterLabelY,
  monsterLook,
  monsterRadius,
  monsterReach,
} from "@renderer/engine/monsters";
import { MONSTER_LOOK } from "@renderer/engine/palette";
import { NEAR_RADIUS, nearestTarget, sceneTargets } from "@renderer/engine/targets";
import { MONSTER_KINDS } from "@shared/world";
import { describe, expect, it } from "vitest";
import { makeScene, monster } from "./fixtures";

describe("clampMonsterSize", () => {
  it("keeps a hallucinated size inside the silhouette range", () => {
    expect(clampMonsterSize(9000)).toBe(MAX_MONSTER_SIZE);
    expect(clampMonsterSize(0.01)).toBe(MIN_MONSTER_SIZE);
    expect(clampMonsterSize(2)).toBe(2);
  });

  it("treats a missing or nonsensical size as the default silhouette", () => {
    expect(clampMonsterSize(0)).toBe(1);
    expect(clampMonsterSize(Number.NaN)).toBe(1);
    expect(clampMonsterSize(-3)).toBe(1);
  });
});

describe("monster size", () => {
  it("scales the silhouette radius and the label with the size", () => {
    for (const kind of MONSTER_KINDS) {
      const base = monster("m", 0, 0, kind);
      const big = monster("m", 0, 0, kind, 1, { size: 2 });
      expect(monsterRadius(big), kind).toBeCloseTo(monsterRadius(base) * 2);
      expect(monsterLabelY(big), kind).toBeGreaterThan(monsterLabelY(base));
      expect(monsterLabelY(base), kind).toBeGreaterThan(MONSTER_LOOK[kind].height);
    }
  });

  it("adds no extra reach at the default size, and grows from there", () => {
    for (const kind of MONSTER_KINDS) {
      expect(monsterReach(monster("m", 0, 0, kind)), kind).toBe(0);
      expect(monsterReach(monster("m", 0, 0, kind, 1, { size: 0.5 })), kind).toBe(0);
      expect(monsterReach(monster("m", 0, 0, kind, 1, { size: 3 })), kind).toBeGreaterThan(0);
    }
  });

  it("lets a giant be talked to from beyond the ordinary prompt radius", () => {
    const scene = makeScene({ monsters: [monster("giant", 5, 5, "golem", 4, { size: 3 })] });
    const targets = sceneTargets(scene);
    const reach = monsterReach(scene.monsters[0] ?? monster("m", 0, 0));
    expect(nearestTarget(targets, 5.5 + NEAR_RADIUS + reach, 5.5)?.id).toBe("giant");
    expect(nearestTarget(targets, 5.5 + NEAR_RADIUS + reach + 0.01, 5.5)).toBeNull();
  });
});

describe("monster colour", () => {
  it("overrides the body colour only, so the trim still reads", () => {
    const look = monsterLook(monster("m", 0, 0, "slime", 1, { color: "#ff00ff" }));
    expect(look.color).toBe("#ff00ff");
    expect(look.accent).toBe(MONSTER_LOOK.slime.accent);
    expect(look.shape).toBe(MONSTER_LOOK.slime.shape);
  });

  it("falls back to the kind's own palette when the model picks no colour", () => {
    expect(monsterLook(monster("m", 0, 0, "wisp"))).toBe(MONSTER_LOOK.wisp);
  });
});

describe("aura", () => {
  it("starts at the aura level and never below it", () => {
    expect(hasAura(AURA_LEVEL)).toBe(true);
    expect(hasAura(AURA_LEVEL - 1)).toBe(false);
    expect(hasAura(1)).toBe(false);
    expect(hasAura(99)).toBe(true);
  });
});
