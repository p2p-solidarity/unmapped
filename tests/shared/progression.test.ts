import {
  awardKill,
  damageAtLevel,
  hasKind,
  levelFor,
  NEW_RUN,
  type ProgressionRule,
  runOutcome,
} from "@shared/progression";
import { describe, expect, it } from "vitest";

const SCORING: ProgressionRule[] = [{ kind: "score_run", value: 10 }];
const LEVELLING: ProgressionRule[] = [{ kind: "stat_growth", value: 3 }];
const ROGUE: ProgressionRule[] = [{ kind: "run_based", value: 0 }];

describe("levelFor", () => {
  it("stays at level 1 until the first step is paid for", () => {
    expect(levelFor(0, 3)).toBe(1);
    expect(levelFor(2, 3)).toBe(1);
    expect(levelFor(3, 3)).toBe(2);
    expect(levelFor(7, 3)).toBe(3);
  });

  it("never levels a cartridge that declared no curve", () => {
    expect(levelFor(999, 0)).toBe(1);
  });
});

describe("awardKill", () => {
  it("counts the kill but awards nothing a cartridge did not ask for", () => {
    const run = awardKill(NEW_RUN, [], 3);
    expect(run.kills).toBe(1);
    expect(run.score).toBe(0);
    expect(run.xp).toBe(0);
    expect(run.level).toBe(1);
  });

  it("pays score per kill, scaled by what was killed", () => {
    expect(awardKill(NEW_RUN, SCORING, 1).score).toBe(10);
    expect(awardKill(NEW_RUN, SCORING, 4).score).toBe(40);
  });

  it("levels the player up once enough has been killed", () => {
    let run = NEW_RUN;
    run = awardKill(run, LEVELLING, 1); // 1 xp
    expect(run.level).toBe(1);
    run = awardKill(run, LEVELLING, 2); // 3 xp
    expect(run.level).toBe(2);
    expect(run.kills).toBe(2);
  });
});

describe("damageAtLevel", () => {
  it("leaves a level 1 weapon exactly as the rules declared it", () => {
    expect(damageAtLevel(22, 1)).toBe(22);
  });

  it("adds a tenth per level, so growth is felt but never runaway", () => {
    expect(damageAtLevel(22, 2)).toBe(24);
    expect(damageAtLevel(22, 5)).toBe(31);
  });
});

describe("runOutcome", () => {
  it("ends the run when the player falls, whatever the cartridge declared", () => {
    expect(runOutcome({ playerAlive: false, hostilesStanding: 3, rules: [] })).toBe("defeated");
    expect(runOutcome({ playerAlive: false, hostilesStanding: 0, rules: ROGUE })).toBe("defeated");
  });

  it("clears a run-based cartridge once nothing is left standing", () => {
    expect(runOutcome({ playerAlive: true, hostilesStanding: 0, rules: ROGUE })).toBe("cleared");
  });

  it("keeps going for a cartridge that never asked to be run-based", () => {
    expect(runOutcome({ playerAlive: true, hostilesStanding: 0, rules: [] })).toBe("running");
    expect(runOutcome({ playerAlive: true, hostilesStanding: 2, rules: ROGUE })).toBe("running");
  });
});

describe("hasKind", () => {
  it("is how the HUD decides whether a gauge exists at all", () => {
    expect(hasKind(SCORING, "score_run")).toBe(true);
    expect(hasKind(SCORING, "stat_growth")).toBe(false);
  });
});
