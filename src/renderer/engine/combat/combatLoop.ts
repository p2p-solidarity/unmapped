// The one combat model (`shooter_combat@1` + `turn_scheduler@1` + `team_party@1`), free of any
// renderer: the player's trigger, the cooldown, the aim preview, the turns that belong to somebody
// else, and in real time the hostiles that close in and strike back. The 3D canvas (CombatControl)
// and the open land (LandView2D) both drive it, so a weapon added by a mod — or a monster's blow —
// behaves the same wherever it happens; they only say where things can stand.
//
// Rule 4: the clock is a plain mutable object the caller keeps in a ref — including where every
// real-time hostile has walked to (`hostiles.ts`); only a shot, a hit or a turn change reaches the
// store.

import { type EncounterCombatant, useEncounterStore, useRunStore } from "@renderer/state";
import { type Blocker, hitscan, type Ray } from "@shared/combat";
import { FOE_TUNING, foeDamage } from "@shared/foes";
import type { GameplayRules } from "@shared/gameplay";
import { damageAtLevel } from "@shared/progression";
import { activeActor, chargeBars, isContinuous } from "@shared/timing";
import { chooseVictim, PLAYER_ID } from "./encounter";
import { type HostileGround, type HostileState, type Point, stepHostiles } from "./hostiles";

/** How long a committed action is played out before the turn moves on. */
export const RESOLVE_SECONDS = 0.45;

export interface CombatClock {
  cooldown: number;
  resolve: number;
  tick: number;
  /** Real time: where each living hostile has walked to and what it is doing, keyed by id. */
  hostiles: Map<string, HostileState>;
  /** Seconds the player cannot be hurt again (after a blow, after getting back up). */
  guard: number;
}

export function newCombatClock(): CombatClock {
  return { cooldown: 0, resolve: 0, tick: 0, hostiles: new Map(), guard: 0 };
}

/** The fight's hostiles where they stand this instant (the roster only knows where they began). */
export function liveHostiles(
  clock: CombatClock,
  combatants: readonly EncounterCombatant[],
): EncounterCombatant[] {
  return combatants
    .filter((one) => one.side === "hostile")
    .map((one) => {
      const live = clock.hostiles.get(one.id);
      return live === undefined ? one : { ...one, x: live.x, z: live.z };
    });
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
  /**
   * Where real-time hostiles may walk: the same test the player moves by. Absent = they hold. On the
   * land it also names safe ground (home), where no hostile goes and no hostile's blow lands.
   */
  ground?: HostileGround;
  /** Pushes the player back by (dx, dz) tiles, through the controller's own collision. */
  shove?(dx: number, dz: number): void;
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
  const hostile = store.combatants.find((one) => one.id === targetId)?.side === "hostile";
  const killed = store.hit(targetId, damage);
  const run = useRunStore.getState();
  // Only a felled hostile is a kill; the player falling ends the run, it is not a trophy.
  if (killed && hostile) run.recordKill(victimLevel);
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

  const hit = hitscan(aim.ray(), weapon, liveHostiles(clock, state.combatants), blockers);
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
  if (clock.guard > 0) clock.guard = Math.max(0, clock.guard - delta);

  const store = useEncounterStore.getState();

  // Aim preview: the same hitscan the trigger will use, so nothing promises a hit the shot would
  // not make. `setAimTarget` only writes when the target identity changes (Rule 4).
  if (store.weapon !== null) {
    const live = liveHostiles(clock, store.combatants);
    const preview = hitscan(aim.ray(), store.weapon, live, blockers);
    store.setAimTarget(preview?.combatantId ?? null);
  }

  const turn = store.turn;
  if (turn === null) return;
  // Real time: the hostiles close in and strike on their own clock (a paused world holds still).
  if (isContinuous(turn.system)) {
    if (!store.paused) stepRealtimeHostiles(clock, aim, rules, delta);
    return;
  }

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
  // No hostile strikes anyone standing on safe ground (the land's home); its turn passes them over.
  const safe = self.side === "hostile" ? aim.ground?.safe : undefined;
  const foes = store.combatants
    .filter((one) => one.side !== self.side)
    .map((one) => (one.id === PLAYER_ID ? { ...one, x: here.x, z: here.z } : one))
    .filter((one) => safe === undefined || !safe(one.x, one.z));
  // Walls block their shots exactly as they block yours; nobody in sight passes the turn.
  const victimId = chooseVictim(self, foes, weapon, blockers);
  if (victimId !== null) {
    const victim = store.combatants.find((one) => one.id === victimId);
    strike(victimId, weapon.damage, victim?.level ?? 1, aim.endless);
  }
  store.commitTurn();
  clock.resolve = RESOLVE_SECONDS;
}

/** Every living hostile walks, winds up or strikes; a blow lands through `strike`, like a shot. */
function stepRealtimeHostiles(
  clock: CombatClock,
  aim: CombatAim,
  rules: GameplayRules | null,
  delta: number,
): void {
  const combat = rules?.combat ?? null;
  const store = useEncounterStore.getState();
  if (combat === null || useRunStore.getState().outcome !== "running") return;
  const you = store.combatants.find((one) => one.id === PLAYER_ID);
  if (you === undefined || you.hp <= 0) return;
  const roster = store.combatants.filter((one) => one.side === "hostile" && one.hp > 0);
  const player = aim.player();
  const ground = aim.ground ?? null;
  stepHostiles(clock.hostiles, roster, { player, delta, ground }, (id, from) => {
    const attacker = roster.find((one) => one.id === id);
    // A blow inside the guard window after the last one glances off.
    if (attacker === undefined || clock.guard > 0) return false;
    strike(PLAYER_ID, foeDamage(combat, attacker.level), 1, aim.endless);
    clock.guard = FOE_TUNING.guardSeconds;
    shoveAway(aim, from, player);
    return useRunStore.getState().outcome !== "running";
  });
}

function shoveAway(aim: CombatAim, from: Point, player: Point): void {
  const dx = player.x - from.x;
  const dz = player.z - from.z;
  const length = Math.hypot(dx, dz);
  if (aim.shove === undefined || length < 1e-6) return;
  aim.shove((dx / length) * FOE_TUNING.knockback, (dz / length) * FOE_TUNING.knockback);
}

/** Ends the player's planning turn with no action (the `end_turn` key). */
export function passTurn(clock: CombatClock): void {
  const state = useEncounterStore.getState();
  if (state.turn === null || isContinuous(state.turn.system)) return;
  if (activeActor(state.turn) !== PLAYER_ID || state.turn.phase !== "planning") return;
  state.commitTurn();
  clock.resolve = RESOLVE_SECONDS;
}
