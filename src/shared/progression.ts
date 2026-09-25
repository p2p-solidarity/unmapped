// `run_progression@1`: what a single run accumulates and how it ends. Pure, so the curve is
// unit-tested and main can validate a cartridge's progression without a renderer.
//
// Every number comes from `Progression(kind, value)` statements in rules.oui — there is no built-in
// XP curve, because a cartridge that never declares one should show no level at all (Rule 2).

export const PROGRESSION_KINDS = [
  "flag_gate",
  "ability_gate",
  "run_based",
  "score_run",
  "stat_growth",
  "crafting",
] as const;
export type ProgressionKind = (typeof PROGRESSION_KINDS)[number];

export interface ProgressionRule {
  kind: ProgressionKind;
  /** Meaning depends on the kind: score per kill, xp per level, and so on. 0 where unused. */
  value: number;
}

export const RUN_OUTCOMES = ["running", "cleared", "defeated"] as const;
export type RunOutcome = (typeof RUN_OUTCOMES)[number];

export interface RunProgress {
  outcome: RunOutcome;
  score: number;
  kills: number;
  xp: number;
  level: number;
}

export const NEW_RUN: RunProgress = { outcome: "running", score: 0, kills: 0, xp: 0, level: 1 };

export function ruleValue(rules: readonly ProgressionRule[], kind: ProgressionKind): number | null {
  const found = rules.find((one) => one.kind === kind);
  return found === undefined ? null : found.value;
}

export function hasKind(rules: readonly ProgressionRule[], kind: ProgressionKind): boolean {
  return rules.some((one) => one.kind === kind);
}

/** Level 1 until the first `xpPerLevel`, then one level per step. */
export function levelFor(xp: number, xpPerLevel: number): number {
  if (xpPerLevel <= 0) return 1;
  return 1 + Math.floor(Math.max(0, xp) / xpPerLevel);
}

/**
 * What a kill is worth. A cartridge that declared neither `score_run` nor `stat_growth` gets
 * nothing but the kill count, so no gauge appears for a system it never asked for.
 */
export function awardKill(
  run: RunProgress,
  rules: readonly ProgressionRule[],
  victimLevel: number,
): RunProgress {
  const scorePerKill = ruleValue(rules, "score_run") ?? 0;
  const xpPerLevel = ruleValue(rules, "stat_growth") ?? 0;
  const xp = run.xp + (xpPerLevel > 0 ? Math.max(1, victimLevel) : 0);
  return {
    ...run,
    kills: run.kills + 1,
    score: run.score + scorePerKill * Math.max(1, victimLevel),
    xp,
    level: levelFor(xp, xpPerLevel),
  };
}

/** Extra damage the player's level is worth: +10% of the weapon's damage per level above 1. */
export function damageAtLevel(baseDamage: number, level: number): number {
  return Math.round(baseDamage * (1 + 0.1 * Math.max(0, level - 1)));
}

/**
 * A run ends when the player falls, or when nothing hostile is left standing. `run_based` decides
 * whether that ending is a hard stop; without it, a cleared floor simply carries on.
 */
export function runOutcome(input: {
  playerAlive: boolean;
  hostilesStanding: number;
  rules: readonly ProgressionRule[];
}): RunOutcome {
  if (!input.playerAlive) return "defeated";
  if (input.hostilesStanding === 0 && hasKind(input.rules, "run_based")) return "cleared";
  return "running";
}
