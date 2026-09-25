import { awardKill, NEW_RUN, type ProgressionRule, runOutcome } from "@shared/progression";
import { describe, expect, it } from "vitest";

const LEVELLING: ProgressionRule[] = [{ kind: "stat_growth", value: 3 }];
const ROGUE: ProgressionRule[] = [{ kind: "run_based", value: 0 }];

describe("awardKill", () => {
  it("levels the player up once enough has been killed", () => {
    let run = NEW_RUN;
    run = awardKill(run, LEVELLING, 1); // 1 xp
    expect(run.level).toBe(1);
    run = awardKill(run, LEVELLING, 2); // 3 xp
    expect(run.level).toBe(2);
    expect(run.kills).toBe(2);
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
