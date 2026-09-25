// Encounter state for `shooter_combat@1`, `turn_scheduler@1` and `team_party@1`.
//
// Rule 4: nothing per-frame lives here. Positions stay in refs, and the action bars tick inside the
// scheduler component — only a bar that actually filled (which changes whose turn it is) reaches
// this store. What does live here is what the HUD and several engine modules both need: who is in
// the fight, how hurt they are, whose turn it is, and how much ammunition is left.
//
// Rule 2: the whole encounter is null unless the cartridge's rules declared combat. An empty HUD is
// correct for a cartridge with no weapons; a zeroed health bar would be a lie.

import type { Combatant, WeaponSpec } from "@shared/combat";
import { applyDamage } from "@shared/combat";
import type { TurnActor, TurnSide, TurnState } from "@shared/timing";
import { advance, commit, removeActor } from "@shared/timing";
import { create } from "zustand";

export interface EncounterCombatant extends Combatant {
  side: TurnSide;
  /** Player-facing name, generated in the player's language for monsters. */
  label: string;
  speed: number;
  /** Monster level, or 1 for the player and allies. Drives what a kill is worth. */
  level: number;
}

/**
 * What the last pull of the trigger did. `empty`: nothing in the line of fire; `wait`: not your
 * turn, still cooling down; `reload`: the dry magazine was refilled instead. Neither `empty` nor
 * `wait` spends a round or a turn.
 */
export type ShotOutcome = "hit" | "kill" | "empty" | "wait" | "reload";

export interface ShotRecord {
  /** Increments per trigger pull so the HUD can replay its feedback for identical outcomes. */
  seq: number;
  outcome: ShotOutcome;
}

export interface EncounterState {
  /** Null until a scene with combat loads. */
  turn: TurnState | null;
  combatants: EncounterCombatant[];
  weapon: WeaponSpec | null;
  /** Rounds left in the magazine, or null for a weapon that never runs dry. */
  ammo: number | null;
  /** `real_time_with_pause` only: the world is frozen and the keys are not live. */
  paused: boolean;
  /** Hostile currently under the reticle, or null. Published on change, never per frame. */
  aimTargetId: string | null;
  /** Last trigger pull, for the reticle's hit marker / refusal flash. Written per click, not frame. */
  lastShot: ShotRecord | null;

  begin(input: {
    turn: TurnState;
    combatants: EncounterCombatant[];
    weapon: WeaponSpec | null;
  }): void;
  clear(): void;
  /** Applies damage and drops the casualty from the current round. Returns true on a kill. */
  hit(combatantId: string, amount: number): boolean;
  /** The active actor finished aiming. */
  commitTurn(): void;
  /** The committed action finished playing out; hand the turn on. */
  advanceTurn(): void;
  setTurn(turn: TurnState): void;
  spendAmmo(): void;
  reload(): void;
  togglePause(): void;
  setAimTarget(combatantId: string | null): void;
  recordShot(outcome: ShotOutcome): void;
}

export function toActors(combatants: readonly EncounterCombatant[]): TurnActor[] {
  return combatants.map((one) => ({
    id: one.id,
    side: one.side,
    speed: one.speed,
    alive: one.hp > 0,
  }));
}

export const useEncounterStore = create<EncounterState>()((set, get) => ({
  turn: null,
  combatants: [],
  weapon: null,
  ammo: null,
  paused: false,
  aimTargetId: null,
  lastShot: null,

  begin: ({ turn, combatants, weapon }) =>
    set({
      turn,
      combatants,
      weapon,
      ammo: weapon?.magazine ?? null,
      paused: false,
      aimTargetId: null,
      lastShot: null,
    }),

  clear: () =>
    set({
      turn: null,
      combatants: [],
      weapon: null,
      ammo: null,
      paused: false,
      aimTargetId: null,
      lastShot: null,
    }),

  hit: (combatantId, amount) => {
    const state = get();
    const target = state.combatants.find((one) => one.id === combatantId);
    if (target === undefined || target.hp <= 0) return false;
    const result = applyDamage(target, amount);
    const combatants = state.combatants.map((one) =>
      one.id === combatantId ? { ...one, hp: result.combatant.hp } : one,
    );
    set({
      combatants,
      turn:
        result.killed && state.turn !== null ? removeActor(state.turn, combatantId) : state.turn,
    });
    return result.killed;
  },

  commitTurn: () => {
    const { turn } = get();
    if (turn !== null) set({ turn: commit(turn) });
  },

  advanceTurn: () => {
    const state = get();
    if (state.turn === null) return;
    set({ turn: advance(state.turn, toActors(state.combatants)) });
  },

  setTurn: (turn) => set({ turn }),

  spendAmmo: () =>
    set((state) => (state.ammo === null ? state : { ammo: Math.max(0, state.ammo - 1) })),

  reload: () => set((state) => ({ ammo: state.weapon?.magazine ?? null })),

  setAimTarget: (aimTargetId) =>
    set((state) => (state.aimTargetId === aimTargetId ? state : { aimTargetId })),

  recordShot: (outcome) =>
    set((state) => ({ lastShot: { seq: (state.lastShot?.seq ?? 0) + 1, outcome } })),

  togglePause: () =>
    set((state) =>
      state.turn?.system === "real_time_with_pause" ? { paused: !state.paused } : state,
    ),
}));
