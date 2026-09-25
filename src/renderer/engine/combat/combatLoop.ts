// The one combat model (`shooter_combat@1` + `turn_scheduler@1` + `team_party@1`), free of any
// renderer: the player's trigger, the cooldown, the aim preview, and the turns that belong to
// somebody else. The 3D canvas (CombatControl) and the open land (LandView2D) both drive it, so a
// weapon added by a mod behaves the same wherever it is fired.
//
// Rule 4: the clock is a plain mutable object the caller keeps in a ref; only a shot, a hit or a
// turn change reaches the store.

import { useEncounterStore, useRunStore } from "@renderer/state";
import { type Blocker, hitscan, type Ray } from "@shared/combat";
import type { GameplayRules } from "@shared/gameplay";
import { damageAtLevel } from "@shared/progression";
import { activeActor, chargeBars, isContinuous } from "@shared/timing";
import { chooseVictim, PLAYER_ID } from "./encounter";

/** How long a committed action is played out before the turn moves on. */
export const RESOLVE_SECONDS = 0.45;

export interface CombatClock {
  cooldown: number;
  resolve: number;
  tick: number;
}

export function newCombatClock(): CombatClock {
  return { cooldown: 0, resolve: 0, tick: 0 };
}

export interface CombatAim {
  /** The player's line of fire this instant. */
  ray(): Ray;
  /** Where the player stands now (the roster only knows where they started). */
  player(): { x: number; z: number };
  /**
   * Open land: the roster is whoever is near, so running out of hostiles is not a cleared run —
   * only the player falling ends the fight.
   */
  endless?: boolean;
}

/** What a trigger pull did, with how far the shot flew when it connected. */
export interface FireResult {
  outcome: "hit" | "kill" | "empty" | "wait" | "reload";
  distance: number | null;
}

/** Applies a hit and settles everything that follows from it: progression, and the run itself. */
export function strike(
  targetId: string,
  damage: number,
  victimLevel: number,
  endless = false,
): boolean {
  const store = useEncounterStore.getState();
  const killed = store.hit(targetId, damage);
  const run = useRunStore.getState();
  if (killed) run.recordKill(victimLevel);
  const after = useEncounterStore.getState().combatants;
  run.settle({
    playerAlive: (after.find((one) => one.id === PLAYER_ID)?.hp ?? 0) > 0,
    hostilesStanding: endless
      ? Number.POSITIVE_INFINITY
      : after.filter((one) => one.side === "hostile" && one.hp > 0).length,
  });
  return killed;
}

/** The player pulls the trigger. Null when there is no fight to fire in. */
export function fireWeapon(
  clock: CombatClock,
  aim: CombatAim,
  blockers: readonly Blocker[],
): FireResult | null {
  const state = useEncounterStore.getState();
  const weapon = state.weapon;
  if (weapon === null || state.turn === null || state.paused) return null;
  // Outside real time, the player may only shoot on their own planning turn.
  const myTurn =
    isContinuous(state.turn.system) ||
    (activeActor(state.turn) === PLAYER_ID && state.turn.phase === "planning");
  if (!myTurn || clock.cooldown > 0) {
    state.recordShot("wait");
    return { outcome: "wait", distance: null };
  }
  const endAction = (): void => {
    clock.cooldown = weapon.cooldownMs / 1000;
    if (state.turn !== null && !isContinuous(state.turn.system)) {
      state.commitTurn();
      clock.resolve = RESOLVE_SECONDS;
    }
  };

  // Nothing binds a reload, so a dry trigger reloads: it costs the action, like a shot would.
  if (state.ammo !== null && state.ammo <= 0) {
    state.reload();
    state.recordShot("reload");
    endAction();
    return { outcome: "reload", distance: null };
  }

  const hit = hitscan(
    aim.ray(),
    weapon,
    state.combatants.filter((one) => one.side === "hostile"),
    blockers,
  );
  // Nothing in the line of fire is not a shot: it spends neither a round nor a turn.
  if (hit === null) {
    state.recordShot("empty");
    return { outcome: "empty", distance: null };
  }

  state.spendAmmo();
  // `stat_growth` is the only thing that makes level matter; without it this is a no-op.
  const damage = damageAtLevel(weapon.damage, useRunStore.getState().level);
  const victim = state.combatants.find((one) => one.id === hit.combatantId);
  const killed = strike(hit.combatantId, damage, victim?.level ?? 1, aim.endless);
  state.recordShot(killed ? "kill" : "hit");
  endAction();
  return { outcome: killed ? "kill" : "hit", distance: hit.distance };
}

/** One frame of the fight: cooldown, aim preview, and whoever's turn it is when it is not yours. */
export function stepCombat(
  clock: CombatClock,
  aim: CombatAim,
  blockers: readonly Blocker[],
  rules: GameplayRules | null,
  delta: number,
): void {
  if (clock.cooldown > 0) clock.cooldown = Math.max(0, clock.cooldown - delta);

  const store = useEncounterStore.getState();

  // Aim preview: the same hitscan the trigger will use, so nothing promises a hit the shot would
  // not make. `setAimTarget` only writes when the target identity changes (Rule 4).
  if (store.weapon !== null) {
    const preview = hitscan(
      aim.ray(),
      store.weapon,
      store.combatants.filter((one) => one.side === "hostile"),
      blockers,
    );
    store.setAimTarget(preview?.combatantId ?? null);
  }

  const turn = store.turn;
  if (turn === null || isContinuous(turn.system)) return;

  // A committed action is still playing out.
  if (clock.resolve > 0) {
    clock.resolve = Math.max(0, clock.resolve - delta);
    if (clock.resolve === 0) store.advanceTurn();
    return;
  }

  // Action bars only fill while nobody is mid-turn.
  if (turn.system === "turn_bar" && activeActor(turn) === null) {
    const charged = chargeBars(
      turn,
      store.combatants.map((one) => ({
        id: one.id,
        side: one.side,
        speed: one.speed,
        alive: one.hp > 0,
      })),
      delta,
    );
    if (charged !== turn) store.setTurn(charged);
    return;
  }

  const actor = activeActor(turn);

  // `tick`: the clock, not the player, ends a slot. Standing still simply passes your turn.
  if (turn.system === "tick" && actor === PLAYER_ID) {
    const tickSeconds = rules?.timing?.turnSeconds ?? 0;
    if (tickSeconds <= 0) return; // an untimed tick waits for input, like a plain turn
    clock.tick += delta;
    if (clock.tick < tickSeconds) return;
    clock.tick = 0;
    store.commitTurn();
    clock.resolve = RESOLVE_SECONDS;
    return;
  }

  if (actor === null || actor === PLAYER_ID) return;

  // Somebody else's turn: act, then resolve. Allies shoot the nearest hostile; hostiles strike
  // the nearest party member. Both use the same declared weapon damage, so there is no hidden
  // second combat model.
  const self = store.combatants.find((one) => one.id === actor);
  const weapon = store.weapon;
  if (self === undefined || weapon === null) {
    store.commitTurn();
    clock.resolve = RESOLVE_SECONDS;
    return;
  }

  // The player is the only combatant that moves, so its live position wins over the roster's.
  const here = aim.player();
  const foes = store.combatants
    .filter((one) => one.side !== self.side)
    .map((one) => (one.id === PLAYER_ID ? { ...one, x: here.x, z: here.z } : one));
  // Walls block their shots exactly as they block yours; nobody in sight passes the turn.
  const victimId = chooseVictim(self, foes, weapon, blockers);
  if (victimId !== null) {
    const victim = store.combatants.find((one) => one.id === victimId);
    strike(victimId, weapon.damage, victim?.level ?? 1, aim.endless);
  }
  store.commitTurn();
  clock.resolve = RESOLVE_SECONDS;
}

/** Ends the player's planning turn with no action (the `end_turn` key). */
export function passTurn(clock: CombatClock): void {
  const state = useEncounterStore.getState();
  if (state.turn === null || isContinuous(state.turn.system)) return;
  if (activeActor(state.turn) !== PLAYER_ID || state.turn.phase !== "planning") return;
  state.commitTurn();
  clock.resolve = RESOLVE_SECONDS;
}
