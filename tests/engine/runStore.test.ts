import { useRunStore } from "@renderer/state/runStore";
import type { ProgressionRule } from "@shared/progression";
import { describe, expect, it } from "vitest";

const ENDLESS: ProgressionRule[] = [
  { kind: "run_based", value: 0 },
  { kind: "score_run", value: 10 },
];

describe("runStore.begin", () => {
  it("never re-rolls the seed, so the generated floor it derives cannot loop", () => {
    const run = useRunStore.getState();
    run.begin(ENDLESS);
    run.recordKill(2);
    run.descend();
    const { seed, floor, score } = useRunStore.getState();

    // The encounter restarting on the new floor records the same rules again.
    useRunStore.getState().begin([...ENDLESS]);
    expect(useRunStore.getState()).toMatchObject({ seed, floor, score });
    expect(floor).toBe(2);
    expect(score).toBe(20);
  });

  it("starts progress over for other rules or an ended run, still keeping the seed", () => {
    useRunStore.getState().begin(ENDLESS);
    useRunStore.getState().recordKill(1);
    const seed = useRunStore.getState().seed;
    useRunStore.getState().settle({ playerAlive: false, hostilesStanding: 1 });
    useRunStore.getState().begin(ENDLESS);
    expect(useRunStore.getState()).toMatchObject({ outcome: "running", score: 0, floor: 1, seed });
  });
});
