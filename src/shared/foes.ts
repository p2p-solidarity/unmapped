// How hostiles fight back in real time, and how long the fallen stay down. Pure tuning and ledger
// maths beside the combat rules they scale from (`CombatRules`, `monsterHp` in ./combat) — never
// constants inside a component, so the land and the 3D places use one set of numbers.
//
// A blow's damage is a share of the cartridge's own player HP that grows with the monster's level,
// so a cartridge that raises `playerHp` makes its player sturdier rather than its monsters deadlier.

import type { CombatRules } from "./gameplay";

export const FOE_TUNING = {
  /** Tiles: a calm hostile this close to the player notices them and closes in. */
  aggroRadius: 6,
  /** Tiles from its home: once the player is farther than this, a hostile gives up and walks back. */
  leashRadius: 12,
  /** Reach beyond its own body radius, centre to centre, at which a hostile starts its swing. */
  reach: 0.8,
  /** Extra distance a wound-up blow still connects at; stepping back past it dodges. */
  reachSlack: 0.45,
  /** Seconds of telegraph (the hostile draws back) before a blow lands. */
  windUpSeconds: 0.55,
  /** Seconds after a blow before it can wind up again. */
  recoverSeconds: 1.2,
  /** Tiles per second at level 1, gained per level, and the cap (the player walks at ~4). */
  speed: 2.1,
  speedPerLevel: 0.05,
  speedMax: 3.4,
  /** A hostile walking home moves this much faster than it chased. */
  returnFactor: 1.25,
  /** A blow is this share of the player's max HP at level 1, plus this per level, up to the cap. */
  damageShare: 0.05,
  damageSharePerLevel: 0.006,
  damageShareMax: 0.25,
  /** Seconds the player cannot be hurt again after a blow, and after getting back up. */
  guardSeconds: 0.8,
  reviveGuardSeconds: 3,
  /** Tiles a blow pushes the player back. */
  knockback: 0.6,
  /** Hostiles keep at least this far apart (tiles) so a pack does not melt into one sprite. */
  spacing: 0.8,
  /** Seconds a chase may make no headway before it is given up. */
  giveUpSeconds: 3,
  /** Seconds between two route plans around whatever blocks the straight line. */
  replanSeconds: 0.8,
  /** How far (tiles) the wind-up draws back and the blow lunges, as drawn. */
  drawBack: 0.18,
  lunge: 0.35,
  lungeSeconds: 0.2,
  /** Seconds of play on the land before a felled hostile stands again. */
  respawnSeconds: 600,
} as const;

function clampShare(level: number): number {
  const steps = Math.max(0, Math.round(level) - 1);
  return Math.min(
    FOE_TUNING.damageShareMax,
    FOE_TUNING.damageShare + FOE_TUNING.damageSharePerLevel * steps,
  );
}

/** Damage one blow of a hostile of `level` deals, from the cartridge's combat rules. */
export function foeDamage(combat: CombatRules, level: number): number {
  return Math.max(1, Math.round(combat.playerHp * clampShare(level)));
}

/** Tiles per second a hostile of `level` closes in at. */
export function foeSpeed(level: number): number {
  const steps = Math.max(0, Math.round(level) - 1);
  return Math.min(FOE_TUNING.speedMax, FOE_TUNING.speed + FOE_TUNING.speedPerLevel * steps);
}

/**
 * Save-owned (`land.felled`): the hostiles felled on this land, so reloading does not raise them.
 * `clock` counts seconds of play on the land; each entry is the clock when that hostile fell, and
 * it stands again once `respawnSeconds` of play have passed since.
 */
export interface FelledLedger {
  clock: number;
  at: Record<string, number>;
}

export const FELLED_LIMITS = {
  /** Oldest entries are dropped first; they would have been the next to respawn anyway. */
  entries: 512,
  idChars: 64,
  clockMax: 1_000_000_000,
} as const;

export function isFelled(ledger: FelledLedger | undefined, id: string): boolean {
  return ledger?.at[id] !== undefined;
}

/** The ledger with `id` down at `clock`, kept within FELLED_LIMITS. */
export function recordFelled(
  ledger: FelledLedger | undefined,
  id: string,
  clock: number,
): FelledLedger {
  const now = Math.min(FELLED_LIMITS.clockMax, Math.max(0, clock));
  const entries = Object.entries({ ...ledger?.at, [id]: now })
    .filter(([key]) => key.length > 0 && key.length <= FELLED_LIMITS.idChars)
    .sort((a, b) => b[1] - a[1])
    .slice(0, FELLED_LIMITS.entries);
  return { clock: now, at: Object.fromEntries(entries) };
}

/** Moves the clock to `clock` and drops everyone whose time is up; `back` lists who returns. */
export function respawnFelled(
  ledger: FelledLedger,
  clock: number,
  interval: number = FOE_TUNING.respawnSeconds,
): { ledger: FelledLedger; back: string[] } {
  const now = Math.min(FELLED_LIMITS.clockMax, Math.max(0, clock));
  const back: string[] = [];
  const at: Record<string, number> = {};
  for (const [id, when] of Object.entries(ledger.at)) {
    if (now - when >= interval) back.push(id);
    else at[id] = when;
  }
  return { ledger: { clock: now, at }, back };
}
