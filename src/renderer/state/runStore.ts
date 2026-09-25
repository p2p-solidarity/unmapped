// `run_progression@1`: score, kills, level and how the run ended.
//
// Scope, stated plainly: this is session state. It survives moving between scenes in one sitting,
// but it is not written into the save yet — SaveState has no run fields until the cartridge v2
// schema lands. Nothing here claims otherwise, and the HUD only shows a gauge whose system the
// cartridge actually declared (Rule 2).

import type { ProgressionRule, RunOutcome, RunProgress } from "@shared/progression";
import { awardKill, NEW_RUN, runOutcome } from "@shared/progression";
import { create } from "zustand";

export interface RunState extends RunProgress {
  /** The systems this cartridge declared; empty means "track nothing, show nothing". */
  rules: ProgressionRule[];
  /** How deep this run has gone. 1 is the floor the cartridge opens on. */
  floor: number;
  /** Seed the current floor's layout is generated from. Changing it regenerates the map. */
  seed: number;

  /**
   * Records the cartridge's progression rules. Never touches `seed`: the floor layout is derived
   * from it, so re-rolling here would regenerate the scene and start this all over again. Progress
   * and the floor only start over when the rules changed (another cartridge) or the run had ended.
   */
  begin(rules: ProgressionRule[]): void;
  /** Take the exit: next floor, new layout, progress kept. */
  descend(): void;
  recordKill(victimLevel: number): void;
  settle(input: { playerAlive: boolean; hostilesStanding: number }): void;
  reset(): void;
}

function rollSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

function sameRules(a: readonly ProgressionRule[], b: readonly ProgressionRule[]): boolean {
  return (
    a.length === b.length &&
    a.every((rule, index) => rule.kind === b[index]?.kind && rule.value === b[index]?.value)
  );
}

export const useRunStore = create<RunState>()((set, get) => ({
  ...NEW_RUN,
  rules: [],
  floor: 1,
  seed: rollSeed(),

  begin: (rules) =>
    set((state) =>
      sameRules(state.rules, rules) && state.outcome === "running"
        ? { rules }
        : { ...NEW_RUN, rules, floor: 1 },
    ),

  // The score, the level and the kill count are the run's; only the floor and its layout change.
  descend: () => set((state) => ({ floor: state.floor + 1, seed: rollSeed(), outcome: "running" })),

  recordKill: (victimLevel) => set((state) => awardKill(state, state.rules, victimLevel)),

  settle: ({ playerAlive, hostilesStanding }) => {
    const state = get();
    if (state.outcome !== "running") return;
    const outcome: RunOutcome = runOutcome({ playerAlive, hostilesStanding, rules: state.rules });
    if (outcome !== "running") set({ outcome });
  },

  reset: () => set({ ...NEW_RUN, rules: get().rules, floor: 1, seed: rollSeed() }),
}));
